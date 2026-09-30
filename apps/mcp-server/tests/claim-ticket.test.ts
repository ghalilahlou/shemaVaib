import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { creerServeur } from '../src/index.js';
import type { SourceSession } from '../src/lib/plateforme.js';
import {
  ReclamationRefusee,
  claimTicketResultatSchema,
  reclamerEtLireTicket,
  type MotifRefus,
} from '../src/tools/claim-ticket.js';

/**
 * SV-018 — `claim_ticket` contre la Supabase locale.
 *
 * L'échange du jeton personnel est déjà couvert par SV-014 ; la session est donc
 * ouverte ici directement, par mot de passe, pour la même identité. Ce qui est
 * vérifié, c'est ce que l'outil fait de cette identité : réclamer en son nom et
 * pas en un autre, ne rien réclamer de ce qu'elle ne voit pas, et laisser la
 * base trancher entre deux réclamations simultanées.
 */

const MOT_DE_PASSE = 'MotDePasseDeTest12345';

interface Personne {
  id: string;
  nom: string;
  session: SourceSession;
}

let admin: SupabaseClient;
const comptes: string[] = [];

let porteuse: Personne;
let contributrice: Personne;
let tiers: Personne;

let projetPublic: string;
let projetBrouillon: string;
let pattern: { id: string; nom: string };

function variable(nom: string): string {
  const valeur = process.env[nom];

  if (!valeur) {
    throw new Error(`${nom} est absent : démarrez la Supabase locale (pnpm db:start).`);
  }

  return valeur;
}

async function creerPersonne(nom: string): Promise<Personne> {
  const email = `mcp-${crypto.randomUUID()}@schemavibe.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: MOT_DE_PASSE,
    email_confirm: true,
    user_metadata: { nom },
  });

  if (error || !data.user) {
    throw new Error(`Création du compte impossible : ${error?.message ?? 'inconnu'}`);
  }

  comptes.push(data.user.id);

  const client = createClient(
    variable('NEXT_PUBLIC_SUPABASE_URL'),
    variable('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { error: erreurSession } = await client.auth.signInWithPassword({
    email,
    password: MOT_DE_PASSE,
  });

  if (erreurSession) {
    throw new Error(`Ouverture de session impossible : ${erreurSession.message}`);
  }

  const id = data.user.id;

  return {
    id,
    nom,
    session: {
      identite: () => Promise.resolve({ id, nom }),
      client: () => Promise.resolve(client),
    },
  };
}

async function creerProjet(statut: 'actif' | 'brouillon'): Promise<string> {
  const { data, error } = await admin
    .from('projects')
    .insert({ proprietaire_id: porteuse.id, nom: `Projet SV-018 ${statut}`, statut })
    .select('id')
    .single();

  if (error) throw error;

  return (data as { id: string }).id;
}

/** Un ticket qui réunit la Definition of Ready, publié ou laissé en brouillon. */
async function creerTicket(
  projetId: string,
  titre: string,
  statut: 'ouvert' | 'brouillon' = 'ouvert',
): Promise<string> {
  const { data, error } = await admin
    .from('tickets')
    .insert({
      projet_id: projetId,
      titre,
      contexte: 'Le filtre par statut manque sur la liste des tickets.',
      criteres_acceptation: 'Un filtre par statut existe et conserve la sélection.',
      critere_test: 'Filtrer sur « ouvert » ne laisse que des tickets ouverts.',
      complexite: 'S',
    })
    .select('id')
    .single();

  if (error) throw error;

  const id = (data as { id: string }).id;

  const { error: erreurLien } = await admin
    .from('ticket_patterns')
    .insert({ ticket_id: id, pattern_id: pattern.id, role: 'suggere' });
  if (erreurLien) throw erreurLien;

  if (statut === 'ouvert') {
    const { error: erreurPublication } = await admin
      .from('tickets')
      .update({ statut: 'ouvert' })
      .eq('id', id);
    if (erreurPublication) throw erreurPublication;
  }

  return id;
}

async function reclamantEnBase(ticketId: string): Promise<string | null> {
  const { data, error } = await admin
    .from('tickets')
    .select('reclame_par')
    .eq('id', ticketId)
    .single();

  if (error) throw error;

  return (data as { reclame_par: string | null }).reclame_par;
}

async function motifDuRefus(promesse: Promise<unknown>): Promise<MotifRefus> {
  const erreur: unknown = await promesse.then(
    () => null,
    (raison: unknown) => raison,
  );

  expect(erreur).toBeInstanceOf(ReclamationRefusee);

  return (erreur as ReclamationRefusee).motif;
}

beforeAll(async () => {
  admin = createClient(
    variable('NEXT_PUBLIC_SUPABASE_URL'),
    variable('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  porteuse = await creerPersonne('Porteuse SV-018');
  contributrice = await creerPersonne('Contributrice SV-018');
  tiers = await creerPersonne('Tiers SV-018');

  const { data: patterns, error } = await admin.from('patterns').select('id, nom').limit(1);
  if (error || !patterns?.[0]) throw new Error('Bibliothèque de patterns vide.');
  pattern = patterns[0] as { id: string; nom: string };

  projetPublic = await creerProjet('actif');
  projetBrouillon = await creerProjet('brouillon');
});

afterAll(async () => {
  for (const id of comptes) {
    await admin.auth.admin.deleteUser(id);
  }
});

describe('réclamer un ticket ouvert', () => {
  let ticket: string;
  let bloqueur: string;

  beforeAll(async () => {
    ticket = await creerTicket(projetPublic, 'Ticket à réclamer');
    bloqueur = await creerTicket(projetPublic, 'Ticket qui le bloque');

    const { error: erreurDependance } = await admin
      .from('ticket_dependencies')
      .insert({ ticket_id: ticket, bloque_par_id: bloqueur });
    if (erreurDependance) throw erreurDependance;

    // Une tentative antérieure, laissée par quelqu'un qui a depuis relâché le ticket.
    const { error: erreurSoumission } = await admin.from('submissions').insert({
      ticket_id: ticket,
      auteur_id: tiers.id,
      diff_url: 'https://exemple.test/diff/1',
      preview_url: 'https://exemple.test/apercu/1',
      resume_md: 'Première tentative, abandonnée.',
    });
    if (erreurSoumission) throw erreurSoumission;
  });

  it('le réclame au nom du porteur du jeton, et de personne d’autre', async () => {
    const resultat = await reclamerEtLireTicket(contributrice.session, ticket);

    expect(resultat.reclamation).toBe('nouvelle');
    expect(resultat.agit_au_nom_de.id).toBe(contributrice.id);
    expect(resultat.ticket.statut).toBe('reclame');
    expect(await reclamantEnBase(ticket)).toBe(contributrice.id);
  });

  it('rend le contexte nécessaire pour y travailler', async () => {
    const resultat = await reclamerEtLireTicket(contributrice.session, ticket);

    expect(claimTicketResultatSchema.safeParse(resultat).success).toBe(true);
    expect(resultat.ticket.critere_test).toContain('Filtrer sur « ouvert »');
    expect(resultat.projet.id).toBe(projetPublic);
    expect(resultat.patterns_suggeres.map((p) => p.nom)).toEqual([pattern.nom]);
    expect(resultat.bloque_par).toEqual([
      { id: bloqueur, titre: 'Ticket qui le bloque', statut: 'ouvert' },
    ]);
    expect(resultat.tentatives_precedentes.map((t) => t.resume_md)).toEqual([
      'Première tentative, abandonnée.',
    ]);
  });

  it('reprend le travail sans erreur quand on le tient déjà', async () => {
    const resultat = await reclamerEtLireTicket(contributrice.session, ticket);

    expect(resultat.reclamation).toBe('deja_la_votre');
    expect(await reclamantEnBase(ticket)).toBe(contributrice.id);
  });

  it('refuse à quelqu’un d’autre, sans déplacer la réclamation', async () => {
    expect(await motifDuRefus(reclamerEtLireTicket(tiers.session, ticket))).toBe('deja_reclame');
    expect(await reclamantEnBase(ticket)).toBe(contributrice.id);
  });
});

describe('ce qui ne se réclame pas', () => {
  it('un ticket d’un projet en brouillon est introuvable pour un tiers, et reste libre', async () => {
    const cache = await creerTicket(projetBrouillon, 'Ticket d’un projet non publié');

    const motif = await motifDuRefus(reclamerEtLireTicket(tiers.session, cache));

    expect(motif).toBe('introuvable');
    expect(await reclamantEnBase(cache)).toBeNull();
  });

  it('ne distingue pas un ticket caché d’un identifiant inexistant', async () => {
    const cache = await creerTicket(projetBrouillon, 'Autre ticket non publié');

    const messages = await Promise.all(
      [cache, crypto.randomUUID()].map((id) =>
        reclamerEtLireTicket(tiers.session, id).then(
          () => null,
          (erreur: unknown) => (erreur as Error).message,
        ),
      ),
    );

    expect(messages[0]).not.toBeNull();
    expect(messages[1]).toBe(messages[0]);
  });

  it('un brouillon que l’on voit n’est pas pour autant réclamable', async () => {
    // Le témoin : la porteuse voit son propre brouillon, le refus ne vient donc
    // pas d'une lecture impossible mais du statut.
    const brouillon = await creerTicket(projetPublic, 'Ticket pas encore publié', 'brouillon');

    expect(await motifDuRefus(reclamerEtLireTicket(porteuse.session, brouillon))).toBe(
      'non_ouvert',
    );
    expect(await reclamantEnBase(brouillon)).toBeNull();
  });
});

describe('deux réclamations simultanées', () => {
  it('n’en laissent aboutir qu’une, l’autre recevant un refus explicite', async () => {
    const disputé = await creerTicket(projetPublic, 'Ticket disputé');

    const issues = await Promise.allSettled([
      reclamerEtLireTicket(contributrice.session, disputé),
      reclamerEtLireTicket(tiers.session, disputé),
    ]);

    const reussies = issues.filter((issue) => issue.status === 'fulfilled');
    const refusees = issues.filter((issue) => issue.status === 'rejected');

    expect(reussies).toHaveLength(1);
    expect(refusees).toHaveLength(1);
    expect((refusees[0] as PromiseRejectedResult).reason).toBeInstanceOf(ReclamationRefusee);
    expect(((refusees[0] as PromiseRejectedResult).reason as ReclamationRefusee).motif).toBe(
      'deja_reclame',
    );

    const gagnante = (reussies[0] as PromiseFulfilledResult<{ agit_au_nom_de: { id: string } }>)
      .value.agit_au_nom_de.id;
    expect(await reclamantEnBase(disputé)).toBe(gagnante);
  });
});

describe('à travers un client MCP réel', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ name: 'test', version: '0.0.0' });
    const [transportClient, transportServeur] = InMemoryTransport.createLinkedPair();

    await Promise.all([
      creerServeur({ session: () => contributrice.session }).connect(transportServeur),
      client.connect(transportClient),
    ]);
  });

  afterAll(async () => {
    await client.close();
  });

  it('rend une sortie structurée conforme au schéma déclaré', async () => {
    const ticket = await creerTicket(projetPublic, 'Ticket réclamé par le protocole');

    const resultat = await client.callTool({ name: 'claim_ticket', arguments: { ticket } });

    expect(resultat.isError).toBeFalsy();
    expect(claimTicketResultatSchema.parse(resultat.structuredContent).reclamation).toBe(
      'nouvelle',
    );
    expect(JSON.stringify(resultat.content)).toContain('Ticket réclamé par le protocole');
  });

  it('transforme un refus en erreur d’outil lisible, et non en panne', async () => {
    const resultat = await client.callTool({
      name: 'claim_ticket',
      arguments: { ticket: crypto.randomUUID() },
    });

    expect(resultat.isError).toBe(true);
    expect(JSON.stringify(resultat.content)).toContain('Aucun ticket visible');
  });
});
