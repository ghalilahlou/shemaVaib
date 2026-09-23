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
import { chargerEvenementsRecents } from '../../features/pulse/repository/pulse-repository';
import { trierEtDedupliquer, type EvenementPulse } from '../../features/pulse/evenement';
import {
  creerClientAdmin,
  creerClientAnonyme,
  creerClientConnecte,
  creerUtilisateurDeTest,
  supprimerUtilisateurDeTest,
} from '../helpers/supabase';

/**
 * SV-007 — chargement initial du pulse.
 *
 * Le temps réel est couvert par `pulse-realtime.test.ts` ; ce fichier vérifie
 * que la page part du bon état, et que la RLS y filtre exactement comme dans la
 * diffusion.
 */

const DIFF = 'https://github.com/ghalilahlou/shemaVaib/pull/1/files';
const APERCU = 'https://apercu.schemavibe.test/pr-1';

let admin: SupabaseClient<Database>;
let anonyme: SupabaseClient<Database>;
let porteurId: string;
let porteur: SupabaseClient<Database>;
let contributeurId: string;
let contributeur: SupabaseClient<Database>;
let projetId: string;
let patternId: string;

function formulaire(titre: string, projet = projetId) {
  return {
    projet_id: projet,
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
  porteurId = await creerUtilisateurDeTest(admin, 'Porteuse pulse');
  contributeurId = await creerUtilisateurDeTest(admin, 'Contributeur pulse');
  porteur = await creerClientConnecte(porteurId);
  contributeur = await creerClientConnecte(contributeurId);

  const projet = await creerProjet(porteur, porteurId, {
    nom: 'Projet pulse',
    repo_url: null,
    statut: 'actif',
  });
  projetId = projet.id;
  patternId = (await listerPatterns(anonyme)).find((pattern) => pattern.nom === 'Spec-First')!.id;
});

afterAll(async () => {
  await supprimerUtilisateurDeTest(admin, porteurId);
  await supprimerUtilisateurDeTest(admin, contributeurId);
});

describe('trierEtDedupliquer', () => {
  const evenement = (cle: string, date: string): EvenementPulse => ({
    genre: 'statut_ticket',
    cle,
    survenu_le: date,
    ticket_id: 'ticket',
    titre: 'Titre',
    statut: 'ouvert',
  });

  it('trie du plus récent au plus ancien', () => {
    const tries = trierEtDedupliquer([
      evenement('a', '2026-09-20T10:00:00Z'),
      evenement('b', '2026-09-24T10:00:00Z'),
      evenement('c', '2026-09-22T10:00:00Z'),
    ]);

    expect(tries.map((element) => element.cle)).toEqual(['b', 'c', 'a']);
  });

  it('ne garde qu’une entrée par clé, la plus récente', () => {
    const tries = trierEtDedupliquer([
      evenement('ticket:1', '2026-09-20T10:00:00Z'),
      evenement('ticket:1', '2026-09-24T10:00:00Z'),
    ]);

    // Un ticket qui change deux fois de statut n'occupe qu'une ligne, dans son
    // état courant.
    expect(tries).toHaveLength(1);
    expect(tries[0]?.survenu_le).toBe('2026-09-24T10:00:00Z');
  });
});

describe('chargerEvenementsRecents', () => {
  it('rend les tickets publiés du projet, du plus récent au plus ancien', async () => {
    const premier = await creerTicket(porteur, formulaire('Pulse premier'), 'ouvert');
    const second = await creerTicket(porteur, formulaire('Pulse second'), 'ouvert');

    const evenements = await chargerEvenementsRecents(anonyme, projetId);
    const cles = evenements.map((evenement) => evenement.cle);

    expect(cles).toContain(`ticket:${premier.id}`);
    expect(cles).toContain(`ticket:${second.id}`);
    expect(cles.indexOf(`ticket:${second.id}`)).toBeLessThan(cles.indexOf(`ticket:${premier.id}`));

    await supprimerTicket(porteur, premier.id);
    await supprimerTicket(porteur, second.id);
  });

  it('inclut les soumissions avec leur auteur', async () => {
    const ticket = await creerTicket(porteur, formulaire('Pulse soumission'), 'ouvert');
    await reclamerTicket(contributeur, ticket.id);
    await soumettreSolution(contributeur, {
      ticketId: ticket.id,
      diffUrl: DIFF,
      previewUrl: APERCU,
      resumeMd: null,
    });

    const evenements = await chargerEvenementsRecents(anonyme, projetId);
    const soumission = evenements.find(
      (evenement) => evenement.genre === 'soumission' && evenement.ticket_id === ticket.id,
    );

    expect(soumission).toBeDefined();
    expect(soumission?.genre === 'soumission' ? soumission.auteur : null).toBe(
      'Contributeur pulse',
    );
    expect(soumission?.titre).toBe('Pulse soumission');

    await supprimerTicket(porteur, ticket.id);
  });

  it('cache à un anonyme les brouillons de ticket, mais les montre au porteur', async () => {
    const brouillon = await creerTicket(
      porteur,
      {
        projet_id: projetId,
        titre: 'Pulse brouillon',
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

    const vuAnonyme = await chargerEvenementsRecents(anonyme, projetId);
    const vuPorteur = await chargerEvenementsRecents(porteur, projetId);

    expect(vuAnonyme.map((evenement) => evenement.cle)).not.toContain(`ticket:${brouillon.id}`);
    expect(vuPorteur.map((evenement) => evenement.cle)).toContain(`ticket:${brouillon.id}`);

    await supprimerTicket(porteur, brouillon.id);
  });

  it('ne montre rien d’un projet non publié à un anonyme', async () => {
    const projetPrive = await creerProjet(porteur, porteurId, {
      nom: 'Projet pulse privé',
      repo_url: null,
      statut: 'brouillon',
    });

    const ticket = await creerTicket(porteur, formulaire('Pulse privé', projetPrive.id), 'ouvert');

    expect(await chargerEvenementsRecents(anonyme, projetPrive.id)).toEqual([]);
    expect((await chargerEvenementsRecents(porteur, projetPrive.id)).length).toBeGreaterThan(0);

    await supprimerTicket(porteur, ticket.id);
  });

  it('ne mélange pas l’activité de deux projets', async () => {
    const autreProjet = await creerProjet(porteur, porteurId, {
      nom: 'Autre projet pulse',
      repo_url: null,
      statut: 'actif',
    });

    const ici = await creerTicket(porteur, formulaire('Ticket d’ici'), 'ouvert');
    const ailleurs = await creerTicket(
      porteur,
      formulaire('Ticket d’ailleurs', autreProjet.id),
      'ouvert',
    );

    const evenements = await chargerEvenementsRecents(anonyme, projetId);
    const cles = evenements.map((evenement) => evenement.cle);

    expect(cles).toContain(`ticket:${ici.id}`);
    expect(cles).not.toContain(`ticket:${ailleurs.id}`);

    await supprimerTicket(porteur, ici.id);
    await supprimerTicket(porteur, ailleurs.id);
  });
});
