import { describe, expect, it } from 'vitest';
import { userSchema, VIBE_SCORE_MAX, VIBE_SCORE_MIN } from './user.js';

/**
 * Le schéma Zod doit refléter exactement la contrainte Postgres posée par la
 * migration `20260923140000_vibe_score_numerique.sql` : un nombre entre 0 et
 * 100, ou NULL tant qu'aucun calcul n'a eu lieu.
 */

const utilisateur = {
  id: '3f3b2a1e-0c5d-4a7b-9e21-6d8f4c2b1a90',
  nom: 'Contributrice',
  xp: 120,
  vibe_score: null,
  cree_le: '2026-09-23T10:00:00Z',
  maj_le: '2026-09-23T10:00:00Z',
};

describe('userSchema.vibe_score', () => {
  it('accepte NULL', () => {
    expect(userSchema.safeParse(utilisateur).success).toBe(true);
  });

  it.each([VIBE_SCORE_MIN, 42.5, VIBE_SCORE_MAX])('accepte la valeur %s', (vibeScore) => {
    expect(userSchema.safeParse({ ...utilisateur, vibe_score: vibeScore }).success).toBe(true);
  });

  it.each([-0.01, 100.01, 250])('refuse la valeur %s', (vibeScore) => {
    expect(userSchema.safeParse({ ...utilisateur, vibe_score: vibeScore }).success).toBe(false);
  });

  it('refuse une chaîne de caractères, l’ancien type de la colonne', () => {
    expect(userSchema.safeParse({ ...utilisateur, vibe_score: '87.45' }).success).toBe(false);
  });

  it('refuse un xp négatif', () => {
    expect(userSchema.safeParse({ ...utilisateur, xp: -1 }).success).toBe(false);
  });
});
