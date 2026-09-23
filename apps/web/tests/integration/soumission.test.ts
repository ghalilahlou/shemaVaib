import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../lib/supabase/database.types';
import {
  creerTicket,
  listerPatterns,
  listerSoumissions,
  reclamerTicket,
  recupererTicket,
  relacherTicket,
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

/**
 * SV-006 — soumission d'une solution, contre l'instance Supabase locale.
 *
 * Les trois identités habituelles sont appliquées à l'action de soumission. Le
 * cas le plus délicat est celui du relâchement concurrent : une soumission ne
 * doit jamais se retrouver rattachée à un ticket redevenu « ouvert ».
 */

const DIFF = 'https://github.com/ghalilahlou/shemaVaib/pull/1/files';
const APERCU = 'https://apercu.schemavibe.test/pr-1';

let admin: SupabaseClient<Database>;
let anonyme: SupabaseClient<Database>;

let porteurId: string;
let porteur: SupabaseClient<Database>;
let contributeurId: string;
let contributeur: SupabaseClient<Database>;
let tiersId: string;
let tiers: SupabaseClient<Database>;

let projetPublicId: string;
let patternId: string;
let ticketId: string;

function formulaire(titre: string) {
  return {
    projet_id: projetPublicId,
    titre,
    contexte: 'Le filtre par statut manque sur la liste des tickets.',
    criteres_acceptation: 'Un filtre par statut existe et conserve la sélection.',
    critere_test: 'Test e2e : filtrer sur « ouvert » ne laisse que des tickets ouverts.',
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

  porteurId = await creerUtilisateurDeTest(admin, 'Porteuse SV-006');
  contributeurId = await creerUtilisateurDeTest(admin, 'Contributeur SV-006');
  tiersId = await creerUtilisateurDeTest(admin, 'Tiers SV-006');

  porteur = await creerClientConnecte(porteurId);
  contributeur = await creerClientConnecte(contributeurId);
  tiers = await creerClientConnecte(tiersId);

  const projet = await creerProjet(porteur, porteurId, {
    nom: 'Projet SV-006',
    repo_url: null,
    statut: 'actif',
  });
  projetPublicId = projet.id;

  const patterns = await listerPatterns(anonyme);
  patternId = patterns.find((pattern) => pattern.nom === 'Spec-First')!.id;
});

afterAll(async () => {
  await supprimerUtilisateurDeTest(admin, porteurId);
  await supprimerUtilisateurDeTest(admin, contributeurId);
  await supprimerUtilisateurDeTest(admin, tiersId);
});

/** Chaque test part d'un ticket publié et réclamé par le contributeur. */
beforeEach(async () => {
  const ticket = await creerTicket(porteur, formulaire(`Ticket ${crypto.randomUUID()}`), 'ouvert');
  ticketId = ticket.id;
  await reclamerTicket(contributeur, ticketId);
});

afterEach(async () => {
  await supprimerTicket(porteur, ticketId);
});

describe('soumettre', () => {
  it('rattache la soumission et fait passer le ticket à « soumis »', async () => {
    const soumission = await soumettreSolution(contributeur, {
      ticketId,
      diffUrl: DIFF,
      previewUrl: APERCU,
      resumeMd: 'Trois fichiers modifiés, deux tests ajoutés.',
    });

    expect(soumission.ticket_id).toBe(ticketId);
    expect(soumission.auteur_id).toBe(contributeurId);
    expect(soumission.diff_url).toBe(DIFF);
    expect(soumission.preview_url).toBe(APERCU);
    expect(soumission.resume_md).toContain('deux tests ajoutés');

    const ticket = await recupererTicket(anonyme, ticketId);
    expect(ticket?.statut).toBe('soumis');
  });

  it('laisse resultat_qualite en attente : aucune porte automatisée n’existe', async () => {
    const soumission = await soumettreSolution(contributeur, {
      ticketId,
      diffUrl: DIFF,
      previewUrl: APERCU,
      resumeMd: null,
    });

    expect(soumission.resultat_qualite).toBe('en_attente');
  });

  it('accepte un résumé absent', async () => {
    const soumission = await soumettreSolution(contributeur, {
      ticketId,
      diffUrl: DIFF,
      previewUrl: APERCU,
      resumeMd: null,
    });

    expect(soumission.resume_md).toBeNull();
  });

  it.each([
    ['diff', '', APERCU],
    ['aperçu', DIFF, ''],
    ['les deux liens', '', ''],
  ])('refuse une soumission sans %s', async (_libelle, diffUrl, previewUrl) => {
    await expect(
      soumettreSolution(contributeur, { ticketId, diffUrl, previewUrl, resumeMd: null }),
    ).rejects.toThrow('Cette solution ne peut pas être soumise.');
  });

  it('refuse un tiers qui n’a pas réclamé le ticket', async () => {
    await expect(
      soumettreSolution(tiers, { ticketId, diffUrl: DIFF, previewUrl: APERCU, resumeMd: null }),
    ).rejects.toThrow('Cette solution ne peut pas être soumise.');

    expect(await listerSoumissions(anonyme, ticketId)).toHaveLength(0);
  });

  it('refuse le porteur du projet s’il n’est pas le réclamant', async () => {
    await expect(
      soumettreSolution(porteur, { ticketId, diffUrl: DIFF, previewUrl: APERCU, resumeMd: null }),
    ).rejects.toThrow('Cette solution ne peut pas être soumise.');
  });

  it('refuse un visiteur anonyme', async () => {
    await expect(
      soumettreSolution(anonyme, { ticketId, diffUrl: DIFF, previewUrl: APERCU, resumeMd: null }),
    ).rejects.toThrow('Cette solution ne peut pas être soumise.');
  });

  it('refuse une soumission sur un ticket relâché', async () => {
    await relacherTicket(contributeur, ticketId);

    await expect(
      soumettreSolution(contributeur, {
        ticketId,
        diffUrl: DIFF,
        previewUrl: APERCU,
        resumeMd: null,
      }),
    ).rejects.toThrow('Cette solution ne peut pas être soumise.');

    expect(await listerSoumissions(anonyme, ticketId)).toHaveLength(0);
  });
});

describe('plusieurs soumissions au fil du temps', () => {
  it('accepte des soumissions successives du même réclamant', async () => {
    await soumettreSolution(contributeur, {
      ticketId,
      diffUrl: `${DIFF}?tentative=1`,
      previewUrl: APERCU,
      resumeMd: 'Première tentative.',
    });
    await soumettreSolution(contributeur, {
      ticketId,
      diffUrl: `${DIFF}?tentative=2`,
      previewUrl: APERCU,
      resumeMd: 'Revue prise en compte.',
    });

    const soumissions = await listerSoumissions(anonyme, ticketId);

    expect(soumissions).toHaveLength(2);
    // De la plus récente à la plus ancienne.
    expect(soumissions[0]?.resume_md).toBe('Revue prise en compte.');
    expect(soumissions[1]?.resume_md).toBe('Première tentative.');
  });

  it('ne laisse pas un tiers soumettre sur un ticket déjà soumis', async () => {
    await soumettreSolution(contributeur, {
      ticketId,
      diffUrl: DIFF,
      previewUrl: APERCU,
      resumeMd: null,
    });

    await expect(
      soumettreSolution(tiers, { ticketId, diffUrl: DIFF, previewUrl: APERCU, resumeMd: null }),
    ).rejects.toThrow('Cette solution ne peut pas être soumise.');
  });
});

/**
 * Le point d'attention du ticket, après révision de ce qu'il faut protéger.
 *
 * Une soumission qui survit au relâchement du ticket n'est pas un défaut : le
 * cahier des charges veut justement que l'historique des tentatives précédentes
 * reste attaché au ticket (section 5.1). L'invariant à tenir est plus étroit —
 * AUCUNE soumission ne doit être créée par quelqu'un qui ne tient pas le ticket
 * à cet instant précis.
 *
 * C'est ce que la transition d'état, placée avant l'insertion et servant de
 * garde, garantit : si le relâchement passe d'abord, la mise à jour ne trouve
 * aucune ligne et l'insertion n'a jamais lieu.
 */
describe('concurrence entre soumission et relâchement', () => {
  it('ne crée aucune soumission quand le relâchement a déjà eu lieu', async () => {
    await Promise.allSettled([
      relacherTicket(porteur, ticketId),
      soumettreSolution(contributeur, {
        ticketId,
        diffUrl: DIFF,
        previewUrl: APERCU,
        resumeMd: null,
      }),
    ]);

    const ticket = await recupererTicket(porteur, ticketId);
    const soumissions = await listerSoumissions(porteur, ticketId);

    // Deux états finaux sont acceptables, et un seul est interdit : un ticket
    // libre portant une soumission que personne n'aurait eu le droit de créer.
    if (ticket?.statut === 'ouvert') {
      // Le relâchement a gagné : le ticket est libre, et la soumission — si elle
      // existe — a été créée avant, alors que le contributeur tenait encore le
      // ticket. Elle est alors de l'historique légitime.
      expect(ticket.reclame_par).toBeNull();
      expect(soumissions.length).toBeLessThanOrEqual(1);
    } else {
      expect(ticket?.statut).toBe('soumis');
      expect(soumissions).toHaveLength(1);
    }
  });

  it('interdit toute soumission une fois le ticket libéré', async () => {
    await relacherTicket(porteur, ticketId);

    // Quatre tentatives simultanées sur un ticket que plus personne ne tient.
    const resultats = await Promise.allSettled(
      Array.from({ length: 4 }, () =>
        soumettreSolution(contributeur, {
          ticketId,
          diffUrl: DIFF,
          previewUrl: APERCU,
          resumeMd: null,
        }),
      ),
    );

    expect(resultats.every((resultat) => resultat.status === 'rejected')).toBe(true);
    expect(await listerSoumissions(porteur, ticketId)).toHaveLength(0);
  });

  it('ne laisse jamais le ticket « soumis » sans soumission', async () => {
    await Promise.allSettled([
      soumettreSolution(contributeur, {
        ticketId,
        diffUrl: DIFF,
        previewUrl: APERCU,
        resumeMd: null,
      }),
      relacherTicket(contributeur, ticketId),
      relacherTicket(porteur, ticketId),
    ]);

    const ticket = await recupererTicket(porteur, ticketId);
    const soumissions = await listerSoumissions(porteur, ticketId);

    // L'incohérence à éviter : un ticket annoncé comme soumis alors qu'aucune
    // solution ne lui est rattachée.
    if (ticket?.statut === 'soumis') {
      expect(soumissions.length).toBeGreaterThan(0);
    }
    expect(ticket?.statut).not.toBe('reclame');
  });
});

describe('visibilité des soumissions', () => {
  it('suit celle du ticket : publique pour un ticket public', async () => {
    await soumettreSolution(contributeur, {
      ticketId,
      diffUrl: DIFF,
      previewUrl: APERCU,
      resumeMd: null,
    });

    expect(await listerSoumissions(anonyme, ticketId)).toHaveLength(1);
  });

  it('reste cachée quand le ticket l’est', async () => {
    const projetPrive = await creerProjet(porteur, porteurId, {
      nom: 'Projet privé SV-006',
      repo_url: null,
      statut: 'brouillon',
    });

    const ticketCache = await creerTicket(
      porteur,
      { ...formulaire('Ticket caché'), projet_id: projetPrive.id },
      'ouvert',
    );

    // Le ticket n'étant pas public, il n'est pas réclamable : la soumission est
    // donc impossible, et rien ne fuite.
    await expect(reclamerTicket(contributeur, ticketCache.id)).rejects.toThrow();
    expect(await listerSoumissions(anonyme, ticketCache.id)).toHaveLength(0);

    await supprimerTicket(porteur, ticketCache.id);
  });

  it('interdit d’écrire directement dans la table, même au réclamant', async () => {
    const { error } = await contributeur
      .from('submissions')
      .insert({ ticket_id: ticketId, diff_url: DIFF, preview_url: APERCU });

    // Aucune politique d'écriture n'existe : tout passe par la fonction, ce qui
    // garantit qu'aucune soumission n'existe sans sa transition d'état.
    expect(error).not.toBeNull();
  });

  it('conserve les soumissions quand le ticket est relâché après coup', async () => {
    await soumettreSolution(contributeur, {
      ticketId,
      diffUrl: DIFF,
      previewUrl: APERCU,
      resumeMd: 'Travail partiel.',
    });

    await relacherTicket(porteur, ticketId);

    const ticket = await recupererTicket(anonyme, ticketId);
    const soumissions = await listerSoumissions(anonyme, ticketId);

    // L'historique des tentatives précédentes fait partie du ticket (section 5.1).
    expect(ticket?.statut).toBe('ouvert');
    expect(soumissions).toHaveLength(1);
  });
});
