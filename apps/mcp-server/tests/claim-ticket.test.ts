import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { creerServeur } from '../src/index.js';
import {
  ReclamationRefusee,
  claimTicketResultatSchema,
  reclamerEtLireTicket,
  type MotifRefus,
} from '../src/tools/claim-ticket.js';
import {
  creerAdmin,
  creerPersonne as creerCompte,
  creerProjet as creerProjetDe,
  creerTicket as creerTicketDans,
  premierPattern,
  supprimerComptes,
  type Personne,
} from './helpers/plateforme.js';

/**
 * SV-018 — `claim_ticket` contre la Supabase locale.
 *
 * Ce qui est vérifié, c'est ce que l'outil fait de l'identité qu'on lui donne
 * (voir `helpers/plateforme.ts`) : réclamer en son nom et
 * pas en un autre, ne rien réclamer de ce qu'elle ne voit pas, et laisser la
 * base trancher entre deux réclamations simultanées.
 */

let admin: SupabaseClient;
const comptes: string[] = [];

let porteuse: Personne;
let contributrice: Personne;
let tiers: Personne;

let projetPublic: string;
let projetBrouillon: string;
let pattern: { id: string; nom: string };

const creerPersonne = (nom: string) => creerCompte(admin, comptes, nom);
const creerProjet = (statut: 'actif' | 'brouillon') => creerProjetDe(admin, porteuse.id, statut);
const creerTicket = (projetId: string, titre: string, statut: 'ouvert' | 'brouillon' = 'ouvert') =>
  creerTicketDans(admin, { projetId, patternId: pattern.id, titre, statut });

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
  admin = creerAdmin();

  porteuse = await creerPersonne('Porteuse SV-018');
  contributrice = await creerPersonne('Contributrice SV-018');
  tiers = await creerPersonne('Tiers SV-018');
  pattern = await premierPattern(admin);

  projetPublic = await creerProjet('actif');
  projetBrouillon = await creerProjet('brouillon');
});

afterAll(async () => {
  await supprimerComptes(admin, comptes);
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
