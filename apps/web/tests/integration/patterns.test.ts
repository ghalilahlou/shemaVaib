import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { evaluerDefinitionOfReady } from '@schemavibe/shared-types';
import type { Database } from '../../lib/supabase/database.types';
import {
  listerPatterns,
  creerTicket,
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
 * SV-008 — bibliothèque de patterns (section 5.2).
 *
 * Le cas qui avait bloqué SV-004 est vérifié explicitement : sur une base
 * fraîche, sans qu'aucun test ne crée de pattern au préalable, un ticket doit
 * pouvoir satisfaire la Definition of Ready et être publié.
 */

/** Les huit patterns de la section 5.2, dans l'ordre du tableau. */
const PATTERNS_ATTENDUS = [
  'Spec-First',
  'Modular Prompting',
  'Test-Gated Iteration',
  'Context Anchoring',
  'Review-Refine Loop',
  'Guardrail Prompting',
  'Multi-Agent Orchestration',
  'Regression Radius',
] as const;

let admin: SupabaseClient<Database>;
let anonyme: SupabaseClient<Database>;
let porteurId: string;
let porteur: SupabaseClient<Database>;
let projetId: string;

beforeAll(async () => {
  admin = creerClientAdmin();
  anonyme = creerClientAnonyme();
  porteurId = await creerUtilisateurDeTest(admin, 'Porteuse SV-008');
  porteur = await creerClientConnecte(porteurId);

  const projet = await creerProjet(porteur, porteurId, {
    nom: 'Projet SV-008',
    repo_url: null,
    statut: 'actif',
  });
  projetId = projet.id;
});

afterAll(async () => {
  await supprimerUtilisateurDeTest(admin, porteurId);
});

describe('la bibliothèque est posée par migration', () => {
  it('contient les huit patterns de la section 5.2', async () => {
    const patterns = await listerPatterns(anonyme);
    const noms = patterns.map((pattern) => pattern.nom);

    for (const attendu of PATTERNS_ATTENDUS) {
      expect(noms).toContain(attendu);
    }
  });

  it('renseigne le principe et le cas d’usage de chacun', async () => {
    const patterns = await listerPatterns(anonyme);
    const documentes = patterns.filter((pattern) =>
      (PATTERNS_ATTENDUS as readonly string[]).includes(pattern.nom),
    );

    expect(documentes).toHaveLength(PATTERNS_ATTENDUS.length);
    for (const pattern of documentes) {
      expect(pattern.principe?.trim()).toBeTruthy();
      expect(pattern.cas_usage?.trim()).toBeTruthy();
      expect(pattern.categorie.trim()).toBeTruthy();
    }
  });

  it('inclut Regression Radius, ajouté à la section 5.2 par la veille (v0.6)', async () => {
    const patterns = await listerPatterns(anonyme);
    const regression = patterns.find((pattern) => pattern.nom === 'Regression Radius');

    expect(regression?.principe).toContain('zones adjacentes');
  });

  it('expose la bibliothèque sans être connecté', async () => {
    const patterns = await listerPatterns(anonyme);

    expect(patterns.length).toBeGreaterThanOrEqual(PATTERNS_ATTENDUS.length);
  });

  it('n’autorise pas un visiteur à modifier le référentiel', async () => {
    const { error } = await anonyme
      .from('patterns')
      .insert({ nom: 'Pattern intrus', categorie: 'execution' });

    expect(error).not.toBeNull();
  });

  it('reste insensible à un rejeu de la migration', async () => {
    // L'insertion est écrite `on conflict (nom) do update` : rejouer la
    // migration ne doit ni dupliquer les lignes ni changer leur identifiant, ce
    // qui casserait les tickets qui les référencent.
    const avant = await listerPatterns(anonyme);
    const specFirst = avant.find((pattern) => pattern.nom === 'Spec-First');

    const { error } = await admin.from('patterns').upsert(
      {
        nom: 'Spec-First',
        categorie: 'planification',
        principe: 'Rédiger un mini cahier des charges avant de prompter',
        cas_usage: 'Tickets complexes ou multi-fichiers',
      },
      { onConflict: 'nom' },
    );

    const apres = await listerPatterns(anonyme);

    expect(error).toBeNull();
    expect(apres).toHaveLength(avant.length);
    expect(apres.find((pattern) => pattern.nom === 'Spec-First')?.id).toBe(specFirst?.id);
  });
});

/**
 * Le cas qui avait bloqué SV-004 : sans bibliothèque, la Definition of Ready
 * était inatteignable et aucun ticket ne pouvait être publié.
 */
describe('une base fraîche permet désormais de publier un ticket', () => {
  it('sans qu’aucun pattern n’ait été créé par le test', async () => {
    const patterns = await listerPatterns(porteur);
    const choisi = patterns.find((pattern) => pattern.nom === 'Spec-First');

    expect(choisi, 'la bibliothèque doit être peuplée par la migration').toBeDefined();

    const conformite = evaluerDefinitionOfReady({
      contexte: 'Le filtre par statut manque sur la liste des tickets.',
      criteres_acceptation: 'Un filtre par statut existe et conserve la sélection.',
      critere_test: 'Test e2e : filtrer sur « ouvert » ne laisse que des tickets ouverts.',
      complexite: 'S',
      source: 'manuel',
      score_confiance: null,
      nombre_patterns_suggeres: 1,
    });

    expect(conformite.pret).toBe(true);

    const ticket = await creerTicket(
      porteur,
      {
        projet_id: projetId,
        titre: 'Ticket publié grâce à la bibliothèque',
        contexte: 'Le filtre par statut manque sur la liste des tickets.',
        criteres_acceptation: 'Un filtre par statut existe et conserve la sélection.',
        critere_test: 'Test e2e : filtrer sur « ouvert » ne laisse que des tickets ouverts.',
        complexite: 'S',
        priorite: 'normale',
        source: 'manuel',
        patterns_suggeres: [choisi!.id],
        publier: true,
      },
      'ouvert',
    );

    expect(ticket.statut).toBe('ouvert');

    const detaille = await recupererTicket(anonyme, ticket.id);
    expect(detaille?.patterns_suggeres[0]?.nom).toBe('Spec-First');
    expect(detaille?.patterns_suggeres[0]?.principe).toContain('cahier des charges');

    await supprimerTicket(porteur, ticket.id);
  });
});
