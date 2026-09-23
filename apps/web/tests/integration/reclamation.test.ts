import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../lib/supabase/database.types';
import {
  creerTicket,
  listerPatterns,
  reclamerTicket,
  recupererTicket,
  relacherTicket,
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
 * SV-005 — réclamation d'un ticket, contre l'instance Supabase locale.
 *
 * Les trois identités habituelles sont appliquées à l'action elle-même, et non
 * seulement à la lecture. Le cas qui compte le plus est celui de la concurrence :
 * deux réclamations quasi simultanées ne doivent laisser passer que la première.
 */

let admin: SupabaseClient<Database>;
let anonyme: SupabaseClient<Database>;

let porteurId: string;
let porteur: SupabaseClient<Database>;
let contributeurId: string;
let contributeur: SupabaseClient<Database>;
let tiersId: string;
let tiers: SupabaseClient<Database>;

let projetPublicId: string;
let projetBrouillonId: string;
let patternId: string;

let ticketOuvertId: string;

const CONTENU_COMPLET = {
  contexte: 'Le filtre par statut manque sur la liste des tickets.',
  criteres_acceptation: 'Un filtre par statut existe et conserve la sélection.',
  critere_test: 'Test e2e : filtrer sur « ouvert » ne laisse que des tickets ouverts.',
  complexite: 'S' as const,
};

function formulaire(projetId: string, titre: string) {
  return {
    projet_id: projetId,
    titre,
    ...CONTENU_COMPLET,
    priorite: 'normale' as const,
    source: 'manuel' as const,
    patterns_suggeres: [patternId],
    publier: true,
  };
}

beforeAll(async () => {
  admin = creerClientAdmin();
  anonyme = creerClientAnonyme();

  porteurId = await creerUtilisateurDeTest(admin, 'Porteuse SV-005');
  contributeurId = await creerUtilisateurDeTest(admin, 'Contributeur SV-005');
  tiersId = await creerUtilisateurDeTest(admin, 'Tiers SV-005');

  porteur = await creerClientConnecte(porteurId);
  contributeur = await creerClientConnecte(contributeurId);
  tiers = await creerClientConnecte(tiersId);

  const projetPublic = await creerProjet(porteur, porteurId, {
    nom: 'Projet public SV-005',
    repo_url: null,
    statut: 'actif',
  });
  projetPublicId = projetPublic.id;

  const projetBrouillon = await creerProjet(porteur, porteurId, {
    nom: 'Projet brouillon SV-005',
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
  await supprimerUtilisateurDeTest(admin, tiersId);
});

/** Chaque test part d'un ticket ouvert et vierge de toute réclamation. */
beforeEach(async () => {
  const ticket = await creerTicket(
    porteur,
    formulaire(projetPublicId, `Ticket réclamable ${crypto.randomUUID()}`),
    'ouvert',
  );
  ticketOuvertId = ticket.id;
});

// Les tickets de ce fichier sont publics : les laisser derrière eux fausserait
// les assertions des autres fichiers sur ce qu'un visiteur anonyme peut voir.
afterEach(async () => {
  await supprimerTicket(porteur, ticketOuvertId);
});

describe('réclamer', () => {
  it('fixe le statut et enregistre le réclamant', async () => {
    const ticket = await reclamerTicket(contributeur, ticketOuvertId);

    expect(ticket.statut).toBe('reclame');
    expect(ticket.reclame_par).toBe(contributeurId);
    expect(ticket.reclame_le).not.toBeNull();
  });

  it('refuse un visiteur anonyme', async () => {
    await expect(reclamerTicket(anonyme, ticketOuvertId)).rejects.toThrow(
      'Ce ticket ne peut pas être réclamé.',
    );

    const inchange = await recupererTicket(anonyme, ticketOuvertId);
    expect(inchange?.statut).toBe('ouvert');
    expect(inchange?.reclame_par).toBeNull();
  });

  it('refuse une seconde réclamation, même par un autre contributeur', async () => {
    await reclamerTicket(contributeur, ticketOuvertId);

    await expect(reclamerTicket(tiers, ticketOuvertId)).rejects.toThrow(
      'Ce ticket ne peut pas être réclamé.',
    );

    const ticket = await recupererTicket(anonyme, ticketOuvertId);
    expect(ticket?.reclame_par).toBe(contributeurId);
  });

  it('refuse qu’un contributeur réclame deux fois le même ticket', async () => {
    await reclamerTicket(contributeur, ticketOuvertId);

    await expect(reclamerTicket(contributeur, ticketOuvertId)).rejects.toThrow(
      'Ce ticket ne peut pas être réclamé.',
    );
  });

  it('refuse un ticket resté en brouillon', async () => {
    const brouillon = await creerTicket(
      porteur,
      {
        projet_id: projetPublicId,
        titre: 'Brouillon non réclamable',
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

    await expect(reclamerTicket(contributeur, brouillon.id)).rejects.toThrow(
      'Ce ticket ne peut pas être réclamé.',
    );

    await supprimerTicket(porteur, brouillon.id);
  });

  it('refuse un ticket ouvert rattaché à un projet encore en brouillon', async () => {
    const cache = await creerTicket(
      porteur,
      formulaire(projetBrouillonId, 'Ticket ouvert sur projet privé'),
      'ouvert',
    );

    // Le ticket n'est pas public : le réclamer reviendrait à agir sur ce qu'on
    // ne peut même pas voir.
    await expect(reclamerTicket(contributeur, cache.id)).rejects.toThrow(
      'Ce ticket ne peut pas être réclamé.',
    );

    await supprimerTicket(porteur, cache.id);
  });

  it('refuse un identifiant inconnu sans rien révéler de plus', async () => {
    await expect(reclamerTicket(contributeur, crypto.randomUUID())).rejects.toThrow(
      'Ce ticket ne peut pas être réclamé.',
    );
  });

  it('laisse le porteur du projet réclamer son propre ticket', async () => {
    const ticket = await reclamerTicket(porteur, ticketOuvertId);

    expect(ticket.reclame_par).toBe(porteurId);
  });
});

/**
 * Le point d'attention du ticket : deux réclamations simultanées.
 *
 * Un `update ... where id = ?` laisserait passer les deux et le second
 * écraserait le premier réclamant. La condition d'état rend l'opération
 * atomique ; ces tests échoueraient si on y revenait.
 */
describe('concurrence', () => {
  it('ne laisse passer qu’une seule de deux réclamations simultanées', async () => {
    const resultats = await Promise.allSettled([
      reclamerTicket(contributeur, ticketOuvertId),
      reclamerTicket(tiers, ticketOuvertId),
    ]);

    const reussies = resultats.filter((resultat) => resultat.status === 'fulfilled');
    const echouees = resultats.filter((resultat) => resultat.status === 'rejected');

    expect(reussies).toHaveLength(1);
    expect(echouees).toHaveLength(1);

    // Le ticket porte le réclamant de l'appel qui a gagné, et aucun autre.
    const gagnant = (reussies[0] as PromiseFulfilledResult<{ reclame_par: string | null }>).value;
    const ticket = await recupererTicket(anonyme, ticketOuvertId);

    expect(ticket?.statut).toBe('reclame');
    expect(ticket?.reclame_par).toBe(gagnant.reclame_par);
    expect([contributeurId, tiersId]).toContain(ticket?.reclame_par);
  });

  it('ne laisse passer qu’une seule de cinq réclamations simultanées', async () => {
    const clients = await Promise.all([
      creerClientConnecte(contributeurId),
      creerClientConnecte(tiersId),
      creerClientConnecte(contributeurId),
      creerClientConnecte(tiersId),
      creerClientConnecte(contributeurId),
    ]);

    const resultats = await Promise.allSettled(
      clients.map((client) => reclamerTicket(client, ticketOuvertId)),
    );

    expect(resultats.filter((resultat) => resultat.status === 'fulfilled')).toHaveLength(1);
    expect(resultats.filter((resultat) => resultat.status === 'rejected')).toHaveLength(4);
  });

  it('ne laisse passer qu’un seul relâchement simultané', async () => {
    await reclamerTicket(contributeur, ticketOuvertId);

    const resultats = await Promise.allSettled([
      relacherTicket(contributeur, ticketOuvertId),
      relacherTicket(porteur, ticketOuvertId),
    ]);

    expect(resultats.filter((resultat) => resultat.status === 'fulfilled')).toHaveLength(1);
    expect(resultats.filter((resultat) => resultat.status === 'rejected')).toHaveLength(1);
  });
});

describe('relâcher', () => {
  it('rend le ticket à l’état ouvert et efface le réclamant', async () => {
    await reclamerTicket(contributeur, ticketOuvertId);
    const ticket = await relacherTicket(contributeur, ticketOuvertId);

    expect(ticket.statut).toBe('ouvert');
    expect(ticket.reclame_par).toBeNull();
    expect(ticket.reclame_le).toBeNull();
  });

  it('laisse le porteur du projet débloquer un ticket abandonné', async () => {
    await reclamerTicket(contributeur, ticketOuvertId);

    const ticket = await relacherTicket(porteur, ticketOuvertId);

    expect(ticket.statut).toBe('ouvert');
    expect(ticket.reclame_par).toBeNull();
  });

  it('refuse à un tiers de relâcher la réclamation d’autrui', async () => {
    await reclamerTicket(contributeur, ticketOuvertId);

    await expect(relacherTicket(tiers, ticketOuvertId)).rejects.toThrow(
      'Ce ticket ne peut pas être relâché.',
    );

    const ticket = await recupererTicket(anonyme, ticketOuvertId);
    expect(ticket?.reclame_par).toBe(contributeurId);
  });

  it('refuse un visiteur anonyme', async () => {
    await reclamerTicket(contributeur, ticketOuvertId);

    await expect(relacherTicket(anonyme, ticketOuvertId)).rejects.toThrow(
      'Ce ticket ne peut pas être relâché.',
    );
  });

  it('refuse de relâcher un ticket qui n’est pas réclamé', async () => {
    await expect(relacherTicket(contributeur, ticketOuvertId)).rejects.toThrow(
      'Ce ticket ne peut pas être relâché.',
    );
  });

  it('rend le ticket réclamable à nouveau', async () => {
    await reclamerTicket(contributeur, ticketOuvertId);
    await relacherTicket(contributeur, ticketOuvertId);

    const repris = await reclamerTicket(tiers, ticketOuvertId);

    expect(repris.reclame_par).toBe(tiersId);
  });
});

describe('ce que la réclamation ne permet pas', () => {
  it('ne laisse pas un contributeur modifier le ticket qu’il a réclamé', async () => {
    await reclamerTicket(contributeur, ticketOuvertId);

    const { data } = await contributeur
      .from('tickets')
      .update({ titre: 'Titre détourné' })
      .eq('id', ticketOuvertId)
      .select('id');

    // Réclamer donne le droit de travailler sur un ticket, pas de le réécrire :
    // c'est précisément ce qu'une politique `UPDATE` permissive aurait laissé
    // passer.
    expect(data ?? []).toEqual([]);

    const ticket = await recupererTicket(anonyme, ticketOuvertId);
    expect(ticket?.titre).not.toBe('Titre détourné');
  });
});
