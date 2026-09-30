import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { creerServeur } from '../src/index.js';
import {
  CreationRefusee,
  createTicketsInputSchema,
  createTicketsResultatSchema,
  preparerOuCreer,
  type MotifRefusLot,
} from '../src/tools/create-tickets.js';
import {
  creerAdmin,
  creerPersonne,
  creerProjet,
  premierPattern,
  supprimerComptes,
  type Personne,
} from './helpers/plateforme.js';

/**
 * SV-020 — `create_tickets` et la fonction `creer_tickets`, contre la Supabase
 * locale.
 *
 * Quatre promesses sont éprouvées : rien n'est créé sans confirmation ; la
 * Definition of Ready décide seule de ce qui est publié ; un lot est créé en
 * entier ou pas du tout ; et seul le porteur du projet peut en créer, la RLS
 * s'appliquant dans la fonction elle-même.
 */

let admin: SupabaseClient;
const comptes: string[] = [];
let porteuse: Personne;
let tiers: Personne;
let projet: string;
let projetCache: string;
let pattern: { id: string; nom: string };

/** Un ticket complet, qui réunit la Definition of Ready. */
function complet(titre: string) {
  return {
    titre,
    contexte: 'Aucun test ne couvre le calcul de la santé des jalons.',
    criteres_acceptation: 'La vue jalons_avec_sante est couverte pour ses trois états.',
    critere_test: 'Un test franchit chaque seuil dans les deux sens.',
    complexite: 'M' as const,
    patterns: [pattern.nom],
  };
}

function lot(titres: { complet?: string; incomplet?: string }, options = {}) {
  return {
    projet,
    tickets: [
      ...(titres.complet ? [complet(titres.complet)] : []),
      ...(titres.incomplet
        ? [
            {
              titre: titres.incomplet,
              contexte: 'Seulement un contexte.',
              complexite: 'S' as const,
            },
          ]
        : []),
    ],
    publier: true,
    confirmer: false,
    ...options,
  };
}

async function ticketsTitres(...titres: string[]) {
  const { data, error } = await admin
    .from('tickets')
    .select('id, titre, statut, source, liens:ticket_patterns(pattern_id)')
    .eq('projet_id', projet)
    .in('titre', titres);

  if (error) throw error;

  return data as {
    id: string;
    titre: string;
    statut: string;
    source: string;
    liens: { pattern_id: string }[];
  }[];
}

/**
 * Appelle l'outil comme le fait le SDK MCP : l'entrée passe d'abord par son
 * schéma, qui applique les valeurs par défaut (`patterns`, `priorite`...).
 */
const creer = (session: Personne['session'], entree: unknown) =>
  preparerOuCreer(session, z.object(createTicketsInputSchema).parse(entree));

async function motifDuRefus(promesse: Promise<unknown>): Promise<MotifRefusLot> {
  const erreur: unknown = await promesse.then(
    () => null,
    (raison: unknown) => raison,
  );

  expect(erreur).toBeInstanceOf(CreationRefusee);

  return (erreur as CreationRefusee).motif;
}

beforeAll(async () => {
  admin = creerAdmin();
  porteuse = await creerPersonne(admin, comptes, 'Porteuse SV-020');
  tiers = await creerPersonne(admin, comptes, 'Tiers SV-020');
  pattern = await premierPattern(admin);
  projet = await creerProjet(admin, porteuse.id, 'actif');
  projetCache = await creerProjet(admin, porteuse.id, 'brouillon');
});

afterAll(async () => {
  await supprimerComptes(admin, comptes);
});

describe('aperçu, puis création confirmée', () => {
  const titres = { complet: 'Couvrir la santé des jalons', incomplet: 'Documenter le pulse' };
  let apercu: Awaited<ReturnType<typeof preparerOuCreer>>;

  beforeAll(async () => {
    apercu = await creer(porteuse.session, lot(titres));
  });

  it('sans confirmation, dit ce qui serait créé et n’écrit rien', async () => {
    expect(apercu.cree).toBe(false);
    expect(apercu.tickets).toEqual([
      { titre: titres.complet, statut: 'ouvert', manques: [], patterns: [pattern.nom], id: null },
      {
        titre: titres.incomplet,
        statut: 'brouillon',
        manques: ['critères d’acceptation', 'critère de test', 'pattern suggéré'],
        patterns: [],
        id: null,
      },
    ]);
    expect(await ticketsTitres(titres.complet, titres.incomplet)).toEqual([]);
  });

  it('avec confirmation, crée ce que l’aperçu annonçait', async () => {
    const resultat = await creer(porteuse.session, { ...lot(titres), confirmer: true });
    const enBase = await ticketsTitres(titres.complet, titres.incomplet);
    const parTitre = new Map(enBase.map((ticket) => [ticket.titre, ticket]));

    expect(resultat.cree).toBe(true);
    expect(resultat.tickets.map(({ id: _id, ...reste }) => reste)).toEqual(
      apercu.tickets.map(({ id: _id, ...reste }) => reste),
    );
    expect(parTitre.get(titres.complet)).toMatchObject({
      id: resultat.tickets[0]!.id,
      statut: 'ouvert',
      source: 'scan_mcp',
      liens: [{ pattern_id: pattern.id }],
    });
    expect(parTitre.get(titres.incomplet)).toMatchObject({
      id: resultat.tickets[1]!.id,
      statut: 'brouillon',
      liens: [],
    });
  });

  it('confirmer une seconde fois ne crée rien de plus', async () => {
    expect(await motifDuRefus(creer(porteuse.session, { ...lot(titres), confirmer: true }))).toBe(
      'doublon',
    );
    expect(await ticketsTitres(titres.complet, titres.incomplet)).toHaveLength(2);
  });
});

describe('ce que l’outil refuse', () => {
  it('un titre répété dans le lot, dès l’aperçu', async () => {
    const entree = lot({ complet: 'Titre répété' });
    entree.tickets.push(complet('titre RÉPÉTÉ '));

    expect(await motifDuRefus(creer(porteuse.session, entree))).toBe('doublon');
  });

  it('un pattern inconnu, en nommant ceux qui existent', async () => {
    const entree = lot({ complet: 'Ticket au pattern imaginaire' });
    entree.tickets[0]!.patterns = ['Vibe Magique'];

    const refus = creer(porteuse.session, entree);

    await expect(refus).rejects.toThrow(/Vibe Magique.*disponibles.*Spec-First/s);
  });

  it('ne publie rien quand publier vaut false, même un ticket prêt', async () => {
    const resultat = await creer(
      porteuse.session,
      lot({ complet: 'Prêt mais gardé en brouillon' }, { publier: false }),
    );

    expect(resultat.tickets[0]).toMatchObject({ statut: 'brouillon', manques: [] });
  });

  it('un tiers, sur un projet public qu’il ne porte pas, sans rien créer', async () => {
    const entree = { ...lot({ complet: 'Ticket d’un tiers' }), confirmer: true };

    expect(await motifDuRefus(creer(tiers.session, entree))).toBe('projet_non_porte');
    expect(await ticketsTitres('Ticket d’un tiers')).toEqual([]);
  });

  it('ne distingue pas un projet caché d’un identifiant inexistant', async () => {
    const messages = await Promise.all(
      [projetCache, crypto.randomUUID()].map((id) =>
        creer(tiers.session, { ...lot({ complet: 'X' }), projet: id }).then(
          () => null,
          (erreur: unknown) => (erreur as Error).message,
        ),
      ),
    );

    expect(messages[0]).not.toBeNull();
    expect(messages[1]).toBe(messages[0]);
  });
});

describe('la fonction creer_tickets, appelée directement', () => {
  const ligne = (titre: string, extra: Record<string, unknown> = {}) => ({
    ...complet(titre),
    patterns: [pattern.id],
    priorite: 'normale',
    publier: true,
    ...extra,
  });

  it('crée tout le lot ou rien : un refus au second ticket annule le premier', async () => {
    const client = await porteuse.session.client();

    const { error } = await client.rpc('creer_tickets', {
      projet,
      lot: [ligne('Premier du lot annulé'), ligne('Second, publié sans pattern', { patterns: [] })],
    });

    expect(error?.message).toContain('publication_sans_pattern');
    expect(await ticketsTitres('Premier du lot annulé')).toEqual([]);
  });

  it('applique la RLS de l’appelant : un tiers ne crée rien chez autrui', async () => {
    // Le témoin : la même ligne passe pour la porteuse.
    const porteur = await porteuse.session.client();
    const temoin = await porteur.rpc('creer_tickets', { projet, lot: [ligne('Ligne témoin')] });
    expect(temoin.error).toBeNull();

    const client = await tiers.session.client();
    const { error } = await client.rpc('creer_tickets', {
      projet,
      lot: [ligne('Ligne d’un tiers')],
    });

    expect(error?.code).toBe('42501');
    expect(await ticketsTitres('Ligne d’un tiers')).toEqual([]);
  });
});

describe('à travers un client MCP réel', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ name: 'test', version: '0.0.0' });
    const [transportClient, transportServeur] = InMemoryTransport.createLinkedPair();

    await Promise.all([
      creerServeur({ session: () => porteuse.session }).connect(transportServeur),
      client.connect(transportClient),
    ]);
  });

  afterAll(async () => {
    await client.close();
  });

  it('n’écrit rien quand confirmer est omis', async () => {
    const { confirmer: _omis, ...sansConfirmation } = lot({ complet: 'Proposé par le protocole' });

    const resultat = await client.callTool({ name: 'create_tickets', arguments: sansConfirmation });

    expect(resultat.isError).toBeFalsy();
    expect(createTicketsResultatSchema.parse(resultat.structuredContent).cree).toBe(false);
    expect(JSON.stringify(resultat.content)).toContain('APERÇU');
    expect(await ticketsTitres('Proposé par le protocole')).toEqual([]);
  });
});
