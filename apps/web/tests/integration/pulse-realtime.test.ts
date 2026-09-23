import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../lib/supabase/database.types';
import {
  creerTicket,
  listerPatterns,
  reclamerTicket,
  soumettreSolution,
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
import { ecouter } from '../helpers/realtime';

/**
 * SV-007 — le pulse en temps réel, et surtout ce qu'il ne doit pas laisser
 * passer.
 *
 * L'exigence du ticket est explicite : la Row Level Security doit s'appliquer à
 * la diffusion, pas seulement au chargement initial. Un visiteur anonyme ne doit
 * rien recevoir d'un ticket ou d'un projet en brouillon — c'est le seul endroit
 * du produit où une fuite serait invisible dans l'interface, puisqu'elle
 * passerait par un canal que personne ne regarde.
 */

const DIFF = 'https://github.com/ghalilahlou/shemaVaib/pull/1/files';
const APERCU = 'https://apercu.schemavibe.test/pr-1';

let admin: SupabaseClient<Database>;
let anonyme: SupabaseClient<Database>;
let porteurId: string;
let porteur: SupabaseClient<Database>;
let contributeurId: string;
let contributeur: SupabaseClient<Database>;

let projetPublicId: string;
let projetBrouillonId: string;
let patternId: string;

function formulaire(projetId: string, titre: string) {
  return {
    projet_id: projetId,
    titre,
    contexte: 'Un contexte suffisant.',
    criteres_acceptation: 'Des critères explicites.',
    critere_test: 'Un critère de test explicite.',
    complexite: 'S' as const,
    priorite: 'normale' as const,
    source: 'manuel' as const,
    patterns_suggeres: [patternId],
    publier: true,
  };
}

beforeAll(async () => {
  admin = creerClientAdmin();
  anonyme = creerClientAnonyme();

  porteurId = await creerUtilisateurDeTest(admin, 'Porteuse SV-007');
  contributeurId = await creerUtilisateurDeTest(admin, 'Contributeur SV-007');
  porteur = await creerClientConnecte(porteurId);
  contributeur = await creerClientConnecte(contributeurId);

  const projetPublic = await creerProjet(porteur, porteurId, {
    nom: 'Projet public SV-007',
    repo_url: null,
    statut: 'actif',
  });
  projetPublicId = projetPublic.id;

  const projetBrouillon = await creerProjet(porteur, porteurId, {
    nom: 'Projet brouillon SV-007',
    repo_url: null,
    statut: 'brouillon',
  });
  projetBrouillonId = projetBrouillon.id;

  const patterns = await listerPatterns(anonyme);
  patternId = patterns.find((pattern) => pattern.nom === 'Spec-First')!.id;
});

afterAll(async () => {
  await supprimerUtilisateurDeTest(admin, porteurId);
  await supprimerUtilisateurDeTest(admin, contributeurId);
});

describe('diffusion des changements de ticket', () => {
  it('pousse le changement de statut d’un ticket public à un visiteur anonyme', async () => {
    const ticket = await creerTicket(
      porteur,
      formulaire(projetPublicId, `Ticket diffusé ${crypto.randomUUID()}`),
      'ouvert',
    );

    const recus = await ecouter(
      anonyme,
      ['tickets'],
      async () => {
        await reclamerTicket(contributeur, ticket.id);
      },
      { jusqua: (evenement) => evenement.ligne.id === ticket.id && evenement.type === 'UPDATE' },
    );

    const evenement = recus
      .filter((recu) => recu.ligne.id === ticket.id && recu.type === 'UPDATE')
      .at(-1);

    expect(evenement, 'le changement de statut doit parvenir à l’abonné').toBeDefined();
    expect(evenement?.ligne.statut).toBe('reclame');

    await supprimerTicket(porteur, ticket.id);
  });

  it('ne pousse rien d’un ticket en brouillon à un visiteur anonyme', async () => {
    const brouillon = await creerTicket(
      porteur,
      {
        projet_id: projetPublicId,
        titre: `Brouillon silencieux ${crypto.randomUUID()}`,
        contexte: null,
        criteres_acceptation: null,
        critere_test: null,
        complexite: null,
        priorite: 'normale',
        source: 'manuel',
        patterns_suggeres: [],
        publier: false,
      },
      'brouillon',
    );

    const recus = await ecouter(anonyme, ['tickets'], async () => {
      await porteur.from('tickets').update({ titre: 'Brouillon renommé' }).eq('id', brouillon.id);
    });

    expect(recus.filter((recu) => recu.ligne.id === brouillon.id)).toEqual([]);

    await supprimerTicket(porteur, brouillon.id);
  });

  it('ne pousse rien d’un ticket rattaché à un projet non publié', async () => {
    const cache = await creerTicket(
      porteur,
      formulaire(projetBrouillonId, `Ticket de projet privé ${crypto.randomUUID()}`),
      'ouvert',
    );

    const recus = await ecouter(anonyme, ['tickets'], async () => {
      await porteur.from('tickets').update({ priorite: 'haute' }).eq('id', cache.id);
    });

    // Le ticket est « ouvert », mais son projet ne l'est pas : les deux
    // conditions comptent, à la diffusion comme à la lecture.
    expect(recus.filter((recu) => recu.ligne.id === cache.id)).toEqual([]);

    await supprimerTicket(porteur, cache.id);
  });

  it('pousse au porteur les changements de ses propres brouillons', async () => {
    const brouillon = await creerTicket(
      porteur,
      {
        projet_id: projetPublicId,
        titre: `Brouillon du porteur ${crypto.randomUUID()}`,
        contexte: null,
        criteres_acceptation: null,
        critere_test: null,
        complexite: null,
        priorite: 'normale',
        source: 'manuel',
        patterns_suggeres: [],
        publier: false,
      },
      'brouillon',
    );

    const recus = await ecouter(
      porteur,
      ['tickets'],
      async () => {
        await porteur.from('tickets').update({ priorite: 'critique' }).eq('id', brouillon.id);
      },
      { jusqua: (evenement) => evenement.ligne.id === brouillon.id && evenement.type === 'UPDATE' },
    );

    const evenement = recus
      .filter((recu) => recu.ligne.id === brouillon.id && recu.type === 'UPDATE')
      .at(-1);

    expect(evenement?.ligne.priorite).toBe('critique');

    await supprimerTicket(porteur, brouillon.id);
  });
});

describe('diffusion des soumissions', () => {
  it('pousse une nouvelle soumission d’un ticket public à un visiteur anonyme', async () => {
    const ticket = await creerTicket(
      porteur,
      formulaire(projetPublicId, `Ticket à soumettre ${crypto.randomUUID()}`),
      'ouvert',
    );
    await reclamerTicket(contributeur, ticket.id);

    const recus = await ecouter(
      anonyme,
      ['submissions'],
      async () => {
        await soumettreSolution(contributeur, {
          ticketId: ticket.id,
          diffUrl: DIFF,
          previewUrl: APERCU,
          resumeMd: null,
        });
      },
      { jusqua: (evenement) => evenement.ligne.ticket_id === ticket.id },
    );

    const evenement = recus.filter((recu) => recu.ligne.ticket_id === ticket.id).at(-1);

    expect(evenement, 'la soumission doit parvenir à l’abonné').toBeDefined();
    expect(evenement?.type).toBe('INSERT');

    await supprimerTicket(porteur, ticket.id);
  });

  it('ne pousse pas la soumission d’un ticket invisible', async () => {
    const cache = await creerTicket(
      porteur,
      formulaire(projetBrouillonId, `Ticket privé à soumettre ${crypto.randomUUID()}`),
      'ouvert',
    );

    // Le porteur réclame et soumet sur son propre projet non publié : tout est
    // légitime de son côté, mais rien ne doit sortir.
    await admin
      .from('tickets')
      .update({ statut: 'reclame', reclame_par: porteurId, reclame_le: new Date().toISOString() })
      .eq('id', cache.id);

    const recus = await ecouter(anonyme, ['submissions'], async () => {
      await soumettreSolution(porteur, {
        ticketId: cache.id,
        diffUrl: DIFF,
        previewUrl: APERCU,
        resumeMd: 'Ne doit pas fuiter.',
      });
    });

    expect(recus.filter((recu) => recu.ligne.ticket_id === cache.id)).toEqual([]);

    await supprimerTicket(porteur, cache.id);
  });
});
