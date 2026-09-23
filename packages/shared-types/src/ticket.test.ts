import { describe, expect, it } from 'vitest';
import {
  evaluerDefinitionOfReady,
  ticketInsertSchema,
  type DefinitionOfReadyEntree,
} from './ticket.js';

/**
 * Tests unitaires de la Definition of Ready (sections 5.1 et 21).
 *
 * C'est la règle qui décide si un ticket peut quitter le brouillon. Elle est
 * vérifiée deux fois — ici en logique pure, et par une contrainte Postgres pour
 * ce qui tient dans une colonne — donc elle mérite d'être couverte des deux
 * côtés.
 */

const ticketComplet: DefinitionOfReadyEntree = {
  contexte: 'Les visiteurs ne peuvent pas filtrer la liste des tickets par statut.',
  criteres_acceptation: 'Un filtre par statut est disponible et conserve la sélection.',
  critere_test: 'Test e2e : filtrer sur « ouvert » ne laisse que des tickets ouverts.',
  complexite: 'S',
  source: 'manuel',
  score_confiance: null,
  nombre_patterns_suggeres: 1,
};

describe('evaluerDefinitionOfReady', () => {
  it('accepte un ticket qui réunit tous les éléments requis', () => {
    expect(evaluerDefinitionOfReady(ticketComplet)).toEqual({ pret: true, motifs: [] });
  });

  it.each([
    ['contexte', { contexte: null }, 'contexte_manquant'],
    ['critères d’acceptation', { criteres_acceptation: null }, 'criteres_acceptation_manquants'],
    ['critère de test', { critere_test: null }, 'critere_test_manquant'],
    ['complexité', { complexite: null }, 'complexite_manquante'],
    ['pattern suggéré', { nombre_patterns_suggeres: 0 }, 'aucun_pattern_suggere'],
  ] as const)('refuse un ticket sans %s', (_libelle, surcharge, motif) => {
    const resultat = evaluerDefinitionOfReady({ ...ticketComplet, ...surcharge });

    expect(resultat.pret).toBe(false);
    expect(resultat.motifs).toContain(motif);
  });

  it('traite une chaîne vide ou faite d’espaces comme un champ manquant', () => {
    const resultat = evaluerDefinitionOfReady({ ...ticketComplet, contexte: '   ' });

    expect(resultat.pret).toBe(false);
    expect(resultat.motifs).toContain('contexte_manquant');
  });

  it('exige un score de confiance sur un ticket généré automatiquement', () => {
    const resultat = evaluerDefinitionOfReady({
      ...ticketComplet,
      source: 'genere_ia',
      score_confiance: null,
    });

    expect(resultat.pret).toBe(false);
    expect(resultat.motifs).toContain('score_confiance_manquant');
  });

  it('accepte un ticket généré automatiquement qui affiche son score', () => {
    const resultat = evaluerDefinitionOfReady({
      ...ticketComplet,
      source: 'genere_ia',
      score_confiance: 0.82,
    });

    expect(resultat).toEqual({ pret: true, motifs: [] });
  });

  it('remonte tous les motifs à la fois, pas seulement le premier', () => {
    const resultat = evaluerDefinitionOfReady({
      contexte: null,
      criteres_acceptation: null,
      critere_test: null,
      complexite: null,
      source: 'manuel',
      score_confiance: null,
      nombre_patterns_suggeres: 0,
    });

    expect(resultat.motifs).toHaveLength(5);
  });
});

describe('ticketInsertSchema', () => {
  it('accepte un ticket minimal, réduit à son projet et son titre', () => {
    const resultat = ticketInsertSchema.safeParse({
      projet_id: '3f3b2a1e-0c5d-4a7b-9e21-6d8f4c2b1a90',
      titre: 'Ajouter un filtre par statut',
    });

    expect(resultat.success).toBe(true);
  });

  it('refuse un titre vide', () => {
    const resultat = ticketInsertSchema.safeParse({
      projet_id: '3f3b2a1e-0c5d-4a7b-9e21-6d8f4c2b1a90',
      titre: '   ',
    });

    expect(resultat.success).toBe(false);
  });

  it('refuse un identifiant de projet qui n’est pas un UUID', () => {
    const resultat = ticketInsertSchema.safeParse({
      projet_id: 'pas-un-uuid',
      titre: 'Ajouter un filtre par statut',
    });

    expect(resultat.success).toBe(false);
  });

  it('refuse un score de confiance hors de l’intervalle [0, 1]', () => {
    const resultat = ticketInsertSchema.safeParse({
      projet_id: '3f3b2a1e-0c5d-4a7b-9e21-6d8f4c2b1a90',
      titre: 'Ajouter un filtre par statut',
      score_confiance: 1.5,
    });

    expect(resultat.success).toBe(false);
  });
});
