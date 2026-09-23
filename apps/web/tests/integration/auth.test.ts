import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../lib/supabase/database.types';
import { recupererUtilisateurConnecte } from '../../features/auth/repository/session-repository';
import { creerProjet, listerProjets } from '../../features/projects/repository/projects-repository';
import {
  creerClientAdmin,
  creerClientAnonyme,
  creerClientConnecte,
  creerUtilisateurDeTest,
  supprimerUtilisateurDeTest,
} from '../helpers/supabase';

/**
 * SV-001 — tests d'intégration de l'authentification, contre l'instance
 * Supabase locale (section 21 du cahier des charges).
 *
 * Ils reprennent les trois identités déjà utilisées pour les politiques RLS de
 * SV-003 — visiteur anonyme, porteur, tiers connecté — et les appliquent cette
 * fois au flux d'authentification lui-même : qui obtient une session, ce que
 * cette session débloque, et ce qu'elle ne débloque pas.
 */

const MOT_DE_PASSE = 'MotDePasseDeTest12345';

let admin: SupabaseClient<Database>;
let anonyme: SupabaseClient<Database>;
let porteurId: string;
let tiersId: string;

beforeAll(async () => {
  admin = creerClientAdmin();
  anonyme = creerClientAnonyme();
  porteurId = await creerUtilisateurDeTest(admin, 'Porteuse SV-001');
  tiersId = await creerUtilisateurDeTest(admin, 'Tiers SV-001');
});

afterAll(async () => {
  await supprimerUtilisateurDeTest(admin, porteurId);
  await supprimerUtilisateurDeTest(admin, tiersId);
});

describe('création du profil à l’inscription', () => {
  it('crée automatiquement la ligne public.users', async () => {
    const { data, error } = await admin
      .from('users')
      .select('id, nom, xp, vibe_score')
      .eq('id', porteurId)
      .single();

    expect(error).toBeNull();
    expect(data?.id).toBe(porteurId);
    expect(data?.xp).toBe(0);
    expect(data?.vibe_score).toBeNull();
  });

  it('reprend le nom transmis en métadonnée du compte', async () => {
    const email = `inscription-${crypto.randomUUID()}@schemavibe.test`;
    const { data } = await admin.auth.admin.createUser({
      email,
      password: MOT_DE_PASSE,
      email_confirm: true,
      user_metadata: { nom: 'Nom venu du formulaire' },
    });

    const { data: profil } = await admin
      .from('users')
      .select('nom')
      .eq('id', data.user!.id)
      .single();

    expect(profil?.nom).toBe('Nom venu du formulaire');

    await supprimerUtilisateurDeTest(admin, data.user!.id);
  });

  it('retombe sur la partie locale de l’adresse quand aucun nom n’est fourni', async () => {
    const identifiant = crypto.randomUUID();
    const { data } = await admin.auth.admin.createUser({
      email: `sans-nom-${identifiant}@schemavibe.test`,
      password: MOT_DE_PASSE,
      email_confirm: true,
    });

    const { data: profil } = await admin
      .from('users')
      .select('nom')
      .eq('id', data.user!.id)
      .single();

    expect(profil?.nom).toBe(`sans-nom-${identifiant}`);

    await supprimerUtilisateurDeTest(admin, data.user!.id);
  });

  it('supprime le profil quand le compte est supprimé', async () => {
    const jetable = await creerUtilisateurDeTest(admin, 'Compte jetable');

    await supprimerUtilisateurDeTest(admin, jetable);

    const { data } = await admin.from('users').select('id').eq('id', jetable);
    expect(data).toEqual([]);
  });
});

describe('recupererUtilisateurConnecte', () => {
  it('rend null pour un visiteur anonyme', async () => {
    expect(await recupererUtilisateurConnecte(anonyme)).toBeNull();
  });

  it('rend l’utilisateur et son profil pour une session valide', async () => {
    const porteur = await creerClientConnecte(porteurId);
    const utilisateur = await recupererUtilisateurConnecte(porteur);

    expect(utilisateur?.id).toBe(porteurId);
    expect(utilisateur?.profil?.nom).toBe('Porteuse SV-001');
  });

  it('distingue deux sessions concurrentes', async () => {
    const porteur = await creerClientConnecte(porteurId);
    const tiers = await creerClientConnecte(tiersId);

    const identitePorteur = await recupererUtilisateurConnecte(porteur);
    const identiteTiers = await recupererUtilisateurConnecte(tiers);

    expect(identitePorteur?.id).toBe(porteurId);
    expect(identiteTiers?.id).toBe(tiersId);
    expect(identitePorteur?.id).not.toBe(identiteTiers?.id);
  });

  it('rend null après déconnexion', async () => {
    const porteur = await creerClientConnecte(porteurId);
    expect(await recupererUtilisateurConnecte(porteur)).not.toBeNull();

    await porteur.auth.signOut();

    expect(await recupererUtilisateurConnecte(porteur)).toBeNull();
  });
});

describe('connexion par mot de passe', () => {
  it('refuse un mot de passe erroné', async () => {
    const client = creerClientAnonyme();
    const { error } = await client.auth.signInWithPassword({
      email: `inconnu-${crypto.randomUUID()}@schemavibe.test`,
      password: 'MauvaisMotDePasse123',
    });

    expect(error).not.toBeNull();
  });

  it('refuse un mot de passe qui ne respecte pas les garde-fous', async () => {
    const client = creerClientAnonyme();
    const { error } = await client.auth.signUp({
      email: `faible-${crypto.randomUUID()}@schemavibe.test`,
      password: 'court',
    });

    expect(error).not.toBeNull();
  });

  it('accepte un mot de passe conforme et ouvre une session', async () => {
    const client = creerClientAnonyme();
    const email = `conforme-${crypto.randomUUID()}@schemavibe.test`;

    const { data, error } = await client.auth.signUp({
      email,
      password: MOT_DE_PASSE,
      options: { data: { nom: 'Inscrit conforme' } },
    });

    expect(error).toBeNull();
    expect(data.user).not.toBeNull();

    const utilisateur = await recupererUtilisateurConnecte(client);
    expect(utilisateur?.profil?.nom).toBe('Inscrit conforme');

    await supprimerUtilisateurDeTest(admin, data.user!.id);
  });
});

/**
 * Le cœur du ticket : la Server Action de création de projet (SV-003) refusait
 * proprement faute de session. Il ne suffit pas qu'elle continue à refuser sans
 * session — il faut qu'elle réussisse avec.
 */
describe('ce qu’une session débloque sur SV-003', () => {
  it('un visiteur anonyme ne peut toujours pas créer de projet', async () => {
    await expect(
      creerProjet(anonyme, porteurId, {
        nom: 'Projet sans session',
        repo_url: null,
        statut: 'actif',
      }),
    ).rejects.toThrow('Impossible de créer le projet.');
  });

  it('une session valide transforme ce refus en création réussie', async () => {
    const porteur = await creerClientConnecte(porteurId);

    const projet = await creerProjet(porteur, porteurId, {
      nom: 'Projet créé avec session',
      repo_url: null,
      statut: 'actif',
    });

    expect(projet.proprietaire_id).toBe(porteurId);

    const visibles = await listerProjets(anonyme, { statut: 'actif' });
    expect(visibles.map((candidat) => candidat.id)).toContain(projet.id);
  });

  it('une session ne permet pas de créer un projet pour un tiers', async () => {
    const tiers = await creerClientConnecte(tiersId);

    await expect(
      creerProjet(tiers, porteurId, {
        nom: 'Projet au nom d’autrui',
        repo_url: null,
        statut: 'actif',
      }),
    ).rejects.toThrow('Impossible de créer le projet.');
  });
});
