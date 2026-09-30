import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../lib/supabase/database.types';
import {
  creerClientAdmin,
  creerClientAnonyme,
  creerClientConnecte,
  creerUtilisateurDeTest,
  supprimerUtilisateurDeTest,
} from '../helpers/supabase';

/**
 * SV-017 — ce que les deux fonctions laissées exécutables par anon révèlent.
 *
 * `projet_est_public` et `est_proprietaire_du_projet` restent appelables sous
 * /rest/v1/rpc/, parce que les politiques RLS s'évaluent avec les droits de
 * l'appelant. L'avertissement du linter est accepté au motif qu'elles ne disent
 * rien que la RLS ne rende déjà lisible : ce fichier transforme ce motif en
 * affirmation vérifiée, pour qu'il ne reste pas une simple promesse de
 * commentaire.
 *
 * Chaque absence d'information est précédée de son témoin positif : une
 * fonction qui répondrait toujours « faux » passerait aussi bien.
 */

let admin: SupabaseClient<Database>;
let anonyme: SupabaseClient<Database>;
let porteur: SupabaseClient<Database>;
let tiers: SupabaseClient<Database>;
let porteurId: string;
let tiersId: string;
let projetPublic: string;
let brouillon: string;

async function creerProjetDe(proprietaireId: string, statut: 'actif' | 'brouillon') {
  const { data, error } = await admin
    .from('projects')
    .insert({ proprietaire_id: proprietaireId, nom: `SV-017 ${statut}`, statut })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`Création du projet de test impossible : ${error?.message ?? 'inconnu'}`);
  }

  return data.id;
}

async function projetEstPublic(client: SupabaseClient<Database>, projet: string) {
  const { data, error } = await client.rpc('projet_est_public', { projet });
  expect(error).toBeNull();
  return data;
}

async function estProprietaire(client: SupabaseClient<Database>, projet: string) {
  const { data, error } = await client.rpc('est_proprietaire_du_projet', { projet });
  expect(error).toBeNull();
  return data;
}

beforeAll(async () => {
  admin = creerClientAdmin();
  anonyme = creerClientAnonyme();
  porteurId = await creerUtilisateurDeTest(admin, 'Porteuse SV-017');
  tiersId = await creerUtilisateurDeTest(admin, 'Tiers SV-017');
  porteur = await creerClientConnecte(porteurId);
  tiers = await creerClientConnecte(tiersId);
  projetPublic = await creerProjetDe(porteurId, 'actif');
  brouillon = await creerProjetDe(porteurId, 'brouillon');
});

afterAll(async () => {
  await supprimerUtilisateurDeTest(admin, porteurId);
  await supprimerUtilisateurDeTest(admin, tiersId);
});

describe('projet_est_public, appelée par un anonyme', () => {
  it('reconnaît un projet publié — le témoin positif', async () => {
    expect(await projetEstPublic(anonyme, projetPublic)).toBe(true);
  });

  it('ne distingue pas un brouillon d’un identifiant inexistant', async () => {
    const pourLeBrouillon = await projetEstPublic(anonyme, brouillon);
    const pourUnInconnu = await projetEstPublic(anonyme, crypto.randomUUID());

    expect(pourLeBrouillon).toBe(false);
    expect(pourUnInconnu).toBe(pourLeBrouillon);
  });
});

describe('est_proprietaire_du_projet', () => {
  it('répond vrai au porteur sur son propre projet — le témoin positif', async () => {
    expect(await estProprietaire(porteur, brouillon)).toBe(true);
  });

  it('ne dit rien à un tiers du brouillon d’autrui', async () => {
    expect(await estProprietaire(tiers, brouillon)).toBe(false);
    expect(await estProprietaire(tiers, crypto.randomUUID())).toBe(false);
  });

  it('ne dit rien à un anonyme', async () => {
    expect(await estProprietaire(anonyme, brouillon)).toBe(false);
    expect(await estProprietaire(anonyme, projetPublic)).toBe(false);
  });
});
