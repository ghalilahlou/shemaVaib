import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../lib/supabase/database.types';
import { modifierMonNom } from '../../features/profile/repository/profil-repository';
import {
  creerClientAdmin,
  creerClientAnonyme,
  creerClientConnecte,
  creerUtilisateurDeTest,
  supprimerUtilisateurDeTest,
} from '../helpers/supabase';

/**
 * SV-021 — un utilisateur ne modifie que son nom.
 *
 * Avant ce ticket, la politique `users_maj_de_son_profil` laissait chacun
 * réécrire toute sa ligne, `xp` et `vibe_score` compris. L'absence de politique
 * d'écriture est désormais la protection (section 18) : ce fichier tente
 * l'écriture et constate qu'elle n'a rien changé, après avoir prouvé que la même
 * session peut bel et bien modifier son nom par la voie prévue.
 */

let admin: SupabaseClient<Database>;
let userId: string;
let moi: SupabaseClient<Database>;

async function profil() {
  const { data, error } = await admin
    .from('users')
    .select('nom, xp, vibe_score')
    .eq('id', userId)
    .single();

  if (error) throw error;

  return data;
}

beforeAll(async () => {
  admin = creerClientAdmin();
  userId = await creerUtilisateurDeTest(admin, 'Profil SV-021');
  moi = await creerClientConnecte(userId);
});

afterAll(async () => {
  await supprimerUtilisateurDeTest(admin, userId);
});

describe('modifier son nom', () => {
  it('passe par modifier_mon_nom — le témoin positif', async () => {
    const mis = await modifierMonNom(moi, '  Nouveau nom  ');

    expect(mis.nom).toBe('Nouveau nom');
    expect((await profil()).nom).toBe('Nouveau nom');
  });

  it('refuse un nom vide', async () => {
    await expect(modifierMonNom(moi, '   ')).rejects.toThrow();
    expect((await profil()).nom).toBe('Nouveau nom');
  });

  it('est refusé à un visiteur anonyme', async () => {
    const { error } = await creerClientAnonyme().rpc('modifier_mon_nom', { nom: 'Intrus' });

    expect(error).not.toBeNull();
  });
});

describe('ce qu’un utilisateur ne peut plus écrire lui-même', () => {
  it('ni son xp ni son vibe_score', async () => {
    const avant = await profil();

    await moi.from('users').update({ xp: 999_999, vibe_score: 100 }).eq('id', userId);

    expect(await profil()).toEqual(avant);
  });

  it('ni même son nom, hors de la fonction dédiée', async () => {
    const avant = await profil();

    await moi.from('users').update({ nom: 'Écrit directement' }).eq('id', userId);

    expect(await profil()).toEqual(avant);
  });

  it('alors que le rôle de service le peut toujours', async () => {
    const { error } = await admin.from('users').update({ xp: 42 }).eq('id', userId);

    expect(error).toBeNull();
    expect((await profil()).xp).toBe(42);
  });
});
