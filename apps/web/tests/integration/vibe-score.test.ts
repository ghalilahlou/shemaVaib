import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../lib/supabase/database.types.js';
import {
  creerClientAdmin,
  creerUtilisateurDeTest,
  supprimerUtilisateurDeTest,
} from '../helpers/supabase.js';

/**
 * Le Vibe Score est un score composite (section 16) stocké en `numeric(5,2)`
 * sur une échelle de 0 à 100, et non en texte comme le laissait entendre le
 * diagramme de la section 9. Ces tests verrouillent la correction apportée par
 * la migration `20260923140000_vibe_score_numerique.sql`.
 */

let admin: SupabaseClient<Database>;
let utilisateurId: string;

beforeAll(async () => {
  admin = creerClientAdmin();
  utilisateurId = await creerUtilisateurDeTest(admin, 'Contributrice notée');
});

afterAll(async () => {
  await supprimerUtilisateurDeTest(admin, utilisateurId);
});

describe('users.vibe_score', () => {
  it('vaut NULL tant qu’aucun calcul n’a eu lieu', async () => {
    const { data, error } = await admin
      .from('users')
      .select('vibe_score')
      .eq('id', utilisateurId)
      .single();

    expect(error).toBeNull();
    expect(data?.vibe_score).toBeNull();
  });

  it('accepte une valeur décimale et la conserve au centième', async () => {
    const { data, error } = await admin
      .from('users')
      .update({ vibe_score: 87.45 })
      .eq('id', utilisateurId)
      .select('vibe_score')
      .single();

    expect(error).toBeNull();
    expect(data?.vibe_score).toBe(87.45);
  });

  it.each([0, 100])('accepte la borne %s de l’échelle', async (valeur) => {
    const { error } = await admin
      .from('users')
      .update({ vibe_score: valeur })
      .eq('id', utilisateurId);

    expect(error).toBeNull();
  });

  it.each([-1, 100.01, 250])('refuse la valeur %s, hors de l’échelle 0-100', async (valeur) => {
    const { error } = await admin
      .from('users')
      .update({ vibe_score: valeur })
      .eq('id', utilisateurId);

    expect(error).not.toBeNull();
  });

  it('peut être remis à NULL', async () => {
    const { data, error } = await admin
      .from('users')
      .update({ vibe_score: null })
      .eq('id', utilisateurId)
      .select('vibe_score')
      .single();

    expect(error).toBeNull();
    expect(data?.vibe_score).toBeNull();
  });
});
