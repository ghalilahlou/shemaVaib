import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { evaluerDefinitionOfReady } from '@schemavibe/shared-types';
import type { Database } from '../../lib/supabase/database.types';
import {
  compterPatternsSuggeres,
  creerTicket,
  listerPatterns,
  listerTickets,
  mettreAJourTicket,
  recupererTicket,
  supprimerTicket,
} from '../../features/tickets/repository/tickets-repository';
import { creerProjet } from '../../features/projects/repository/projects-repository';
import {
  creerClientAdmin,
  creerClientAnonyme,
  creerClientConnecte,
  creerUtilisateurDeTest,
  supprimerUtilisateurDeTest,
} from '../helpers/supabase';

/**
 * SV-004 — tests d'intégration des tickets, contre l'instance Supabase locale.
 *
 * Le critère de test du ticket (section 22) est explicite : vérifier qu'un
 * ticket incomplet reste bloqué en « brouillon ». Il est couvert ici à deux
 * niveaux — la règle métier partagée, et la contrainte Postgres qui l'adosse.
 *
 * Les trois identités de SV-003 sont reprises, car un ticket hérite de la
 * visibilité de son projet.
 */

let admin: SupabaseClient<Database>;
let anonyme: SupabaseClient<Database>;

let porteurId: string;
let porteur: SupabaseClient<Database>;
let tiersId: string;
let tiers: SupabaseClient<Database>;

let projetPublicId: string;
let projetBrouillonId: string;
let patternId: string;

const CONTENU_COMPLET = {
  contexte: 'La liste des tickets ne se filtre pas par statut.',
  criteres_acceptation: 'Un filtre par statut existe et conserve la sélection.',
  critere_test: 'Test e2e : filtrer sur « ouvert » ne laisse que des tickets ouverts.',
  complexite: 'S' as const,
};

function formulaire(
  projetId: string,
  surcharge: Partial<Parameters<typeof creerTicket>[1]> = {},
): Parameters<typeof creerTicket>[1] {
  return {
    projet_id: projetId,
    titre: 'Ticket de test',
    contexte: null,
    criteres_acceptation: null,
    critere_test: null,
    complexite: null,
    priorite: 'normale',
    source: 'manuel',
    patterns_suggeres: [],
    publier: false,
    ...surcharge,
  };
}

beforeAll(async () => {
  admin = creerClientAdmin();
  anonyme = creerClientAnonyme();

  porteurId = await creerUtilisateurDeTest(admin, 'Porteuse SV-004');
  tiersId = await creerUtilisateurDeTest(admin, 'Tiers SV-004');
  porteur = await creerClientConnecte(porteurId);
  tiers = await creerClientConnecte(tiersId);

  const projetPublic = await creerProjet(porteur, porteurId, {
    nom: 'Projet public SV-004',
    repo_url: null,
    statut: 'actif',
  });
  projetPublicId = projetPublic.id;

  const projetBrouillon = await creerProjet(porteur, porteurId, {
    nom: 'Projet brouillon SV-004',
    repo_url: null,
    statut: 'brouillon',
  });
  projetBrouillonId = projetBrouillon.id;

  // La bibliothèque de patterns n'est peuplée qu'au ticket SV-008 : le test
  // crée donc le sien, plutôt que de dépendre d'un travail à venir.
  const { data: pattern } = await admin
    .from('patterns')
    .insert({ nom: `Spec-First ${crypto.randomUUID()}`, categorie: 'planification' })
    .select('id')
    .single();
  patternId = pattern!.id;
});

afterAll(async () => {
  await admin.from('patterns').delete().eq('id', patternId);
  await supprimerUtilisateurDeTest(admin, porteurId);
  await supprimerUtilisateurDeTest(admin, tiersId);
});

/** Le critère de test nommé par la section 22. */
describe('un ticket incomplet reste bloqué en brouillon', () => {
  it('la règle métier refuse la publication et dit ce qui manque', () => {
    const conformite = evaluerDefinitionOfReady({
      contexte: null,
      criteres_acceptation: null,
      critere_test: null,
      complexite: null,
      source: 'manuel',
      score_confiance: null,
      nombre_patterns_suggeres: 0,
    });

    expect(conformite.pret).toBe(false);
    expect(conformite.motifs).toContain('aucun_pattern_suggere');
  });

  it('la base refuse un ticket « ouvert » aux champs manquants', async () => {
    await expect(
      creerTicket(porteur, formulaire(projetPublicId, { titre: 'Incomplet publié' }), 'ouvert'),
    ).rejects.toThrow('Impossible de créer le ticket.');
  });

  it('le même ticket s’enregistre sans difficulté en brouillon', async () => {
    const ticket = await creerTicket(
      porteur,
      formulaire(projetPublicId, { titre: 'Incomplet en brouillon' }),
      'brouillon',
    );

    expect(ticket.statut).toBe('brouillon');

    await supprimerTicket(porteur, ticket.id);
  });

  it('la base refuse aussi de faire passer un brouillon incomplet à « ouvert »', async () => {
    const ticket = await creerTicket(
      porteur,
      formulaire(projetPublicId, { titre: 'Brouillon qu’on tente d’ouvrir' }),
      'brouillon',
    );

    await expect(mettreAJourTicket(porteur, ticket.id, { statut: 'ouvert' })).rejects.toThrow(
      'Impossible de mettre à jour le ticket.',
    );

    const inchange = await recupererTicket(porteur, ticket.id);
    expect(inchange?.statut).toBe('brouillon');

    await supprimerTicket(porteur, ticket.id);
  });

  it('accepte la publication dès que tout est réuni', async () => {
    const ticket = await creerTicket(
      porteur,
      formulaire(projetPublicId, {
        titre: 'Ticket complet',
        ...CONTENU_COMPLET,
        patterns_suggeres: [patternId],
      }),
      'ouvert',
    );

    expect(ticket.statut).toBe('ouvert');
    expect(await compterPatternsSuggeres(porteur, ticket.id)).toBe(1);

    await supprimerTicket(porteur, ticket.id);
  });
});

describe('visibilité héritée du projet', () => {
  it('expose un ticket ouvert d’un projet public à un visiteur anonyme', async () => {
    const ticket = await creerTicket(
      porteur,
      formulaire(projetPublicId, {
        titre: 'Ticket public',
        ...CONTENU_COMPLET,
        patterns_suggeres: [patternId],
      }),
      'ouvert',
    );

    expect(await recupererTicket(anonyme, ticket.id)).not.toBeNull();

    await supprimerTicket(porteur, ticket.id);
  });

  it('cache un ticket ouvert rattaché à un projet encore en brouillon', async () => {
    const ticket = await creerTicket(
      porteur,
      formulaire(projetBrouillonId, {
        titre: 'Ticket ouvert sur projet privé',
        ...CONTENU_COMPLET,
        patterns_suggeres: [patternId],
      }),
      'ouvert',
    );

    // Publier un ticket ne doit pas trahir l'existence d'un projet non publié.
    expect(await recupererTicket(anonyme, ticket.id)).toBeNull();
    expect(await recupererTicket(tiers, ticket.id)).toBeNull();
    expect(await recupererTicket(porteur, ticket.id)).not.toBeNull();

    await supprimerTicket(porteur, ticket.id);
  });

  it('cache un brouillon de ticket, même sur un projet public', async () => {
    const ticket = await creerTicket(
      porteur,
      formulaire(projetPublicId, { titre: 'Brouillon de ticket' }),
      'brouillon',
    );

    expect(await recupererTicket(anonyme, ticket.id)).toBeNull();
    expect(await recupererTicket(tiers, ticket.id)).toBeNull();
    expect(await recupererTicket(porteur, ticket.id)).not.toBeNull();

    await supprimerTicket(porteur, ticket.id);
  });

  it('empêche un tiers de créer un ticket sur le projet d’autrui', async () => {
    await expect(
      creerTicket(tiers, formulaire(projetPublicId, { titre: 'Ticket intrus' }), 'brouillon'),
    ).rejects.toThrow('Impossible de créer le ticket.');
  });

  it('empêche un visiteur anonyme de créer un ticket', async () => {
    await expect(
      creerTicket(anonyme, formulaire(projetPublicId, { titre: 'Ticket anonyme' }), 'brouillon'),
    ).rejects.toThrow('Impossible de créer le ticket.');
  });

  it('ne laisse pas un tiers modifier le ticket d’autrui', async () => {
    const ticket = await creerTicket(
      porteur,
      formulaire(projetPublicId, {
        titre: 'Ticket à détourner',
        ...CONTENU_COMPLET,
        patterns_suggeres: [patternId],
      }),
      'ouvert',
    );

    expect(await mettreAJourTicket(tiers, ticket.id, { titre: 'Détourné' })).toBeNull();
    expect((await recupererTicket(anonyme, ticket.id))?.titre).toBe('Ticket à détourner');

    await supprimerTicket(porteur, ticket.id);
  });
});

describe('listerTickets', () => {
  it('filtre par statut et par projet', async () => {
    const ouvert = await creerTicket(
      porteur,
      formulaire(projetPublicId, {
        titre: 'Ticket ouvert filtrable',
        ...CONTENU_COMPLET,
        patterns_suggeres: [patternId],
      }),
      'ouvert',
    );
    const brouillon = await creerTicket(
      porteur,
      formulaire(projetPublicId, { titre: 'Ticket brouillon filtrable' }),
      'brouillon',
    );

    const ouverts = await listerTickets(porteur, { statut: 'ouvert' });
    expect(ouverts.every((ticket) => ticket.statut === 'ouvert')).toBe(true);
    expect(ouverts.map((ticket) => ticket.id)).toContain(ouvert.id);
    expect(ouverts.map((ticket) => ticket.id)).not.toContain(brouillon.id);

    const duProjet = await listerTickets(porteur, { projet_id: projetPublicId });
    expect(duProjet.every((ticket) => ticket.projet_id === projetPublicId)).toBe(true);

    const duProjetBrouillon = await listerTickets(porteur, { projet_id: projetBrouillonId });
    expect(duProjetBrouillon.map((ticket) => ticket.id)).not.toContain(ouvert.id);

    await supprimerTicket(porteur, ouvert.id);
    await supprimerTicket(porteur, brouillon.id);
  });

  it('joint le projet et les patterns suggérés', async () => {
    const ticket = await creerTicket(
      porteur,
      formulaire(projetPublicId, {
        titre: 'Ticket avec jointures',
        ...CONTENU_COMPLET,
        patterns_suggeres: [patternId],
      }),
      'ouvert',
    );

    const detaille = await recupererTicket(anonyme, ticket.id);

    expect(detaille?.projet?.nom).toBe('Projet public SV-004');
    expect(detaille?.patterns_suggeres).toHaveLength(1);
    expect(detaille?.patterns_suggeres[0]?.id).toBe(patternId);

    await supprimerTicket(porteur, ticket.id);
  });

  it('trie du plus récent au plus ancien', async () => {
    const tickets = await listerTickets(porteur, { projet_id: projetPublicId });
    const dates = tickets.map((ticket) => new Date(ticket.cree_le).getTime());

    expect(dates).toEqual([...dates].sort((a, b) => b - a));
  });
});

describe('listerPatterns', () => {
  it('expose la bibliothèque à un visiteur anonyme', async () => {
    const patterns = await listerPatterns(anonyme);

    expect(patterns.map((pattern) => pattern.id)).toContain(patternId);
  });
});
