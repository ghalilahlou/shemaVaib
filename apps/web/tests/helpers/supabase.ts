import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../lib/supabase/database.types';

/**
 * Clients Supabase pour les tests d'intégration.
 *
 * Volontairement distincts de `lib/supabase/admin.ts` : celui-ci importe
 * `server-only`, qui lève une erreur hors du runtime Next.js. Le harnais de
 * test a donc sa propre fabrique, ce qui garde le garde-fou intact côté
 * application.
 */

function lireVariable(nom: string): string {
  const valeur = process.env[nom];

  if (!valeur) {
    throw new Error(
      `${nom} est absent. Lancer \`pnpm db:start\` puis reporter les valeurs de ` +
        '`pnpm db:status` dans apps/web/.env.local.',
    );
  }

  return valeur;
}

/** Client à privilèges élevés : contourne la RLS, sert à préparer les données. */
export function creerClientAdmin(): SupabaseClient<Database> {
  return createClient<Database>(
    lireVariable('NEXT_PUBLIC_SUPABASE_URL'),
    lireVariable('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/** Client anonyme : soumis à la RLS, sert à vérifier ce qui est réellement exposé. */
export function creerClientAnonyme(): SupabaseClient<Database> {
  return createClient<Database>(
    lireVariable('NEXT_PUBLIC_SUPABASE_URL'),
    lireVariable('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/**
 * Mot de passe commun aux utilisateurs de test. Il ne protège rien : ces comptes
 * n'existent que le temps d'un `vitest run` sur une base locale jetable.
 */
const MOT_DE_PASSE_DE_TEST = 'MotDePasseDeTest12345';

/** Adresses des comptes de test, pour pouvoir ouvrir une session ensuite. */
const emailsParUtilisateur = new Map<string, string>();

/**
 * Crée un utilisateur complet — entrée `auth.users` et profil `public.users` —
 * et rend son identifiant. Les tests s'en servent comme propriétaire de projet.
 */
export async function creerUtilisateurDeTest(
  admin: SupabaseClient<Database>,
  nom: string,
): Promise<string> {
  const email = `test-${crypto.randomUUID()}@schemavibe.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: MOT_DE_PASSE_DE_TEST,
    email_confirm: true,
  });

  if (error || !data.user) {
    throw new Error(
      `Création de l’utilisateur de test impossible : ${error?.message ?? 'inconnu'}`,
    );
  }

  // Le profil est créé par le trigger `creer_profil_a_l_inscription` (SV-001) ;
  // il ne reste qu'à lui donner le nom attendu par le test.
  const { error: erreurProfil } = await admin.from('users').update({ nom }).eq('id', data.user.id);

  if (erreurProfil) {
    throw new Error(`Mise à jour du profil de test impossible : ${erreurProfil.message}`);
  }

  emailsParUtilisateur.set(data.user.id, email);

  return data.user.id;
}

/**
 * Client authentifié comme l'utilisateur indiqué : soumis à la RLS avec ses
 * droits réels. C'est ce qui permet de vérifier que le porteur voit ses
 * brouillons et qu'un tiers ne les voit pas.
 */
export async function creerClientConnecte(userId: string): Promise<SupabaseClient<Database>> {
  const email = emailsParUtilisateur.get(userId);

  if (!email) {
    throw new Error(`Aucun utilisateur de test connu pour l’identifiant ${userId}.`);
  }

  const client = creerClientAnonyme();
  const { error } = await client.auth.signInWithPassword({
    email,
    password: MOT_DE_PASSE_DE_TEST,
  });

  if (error) {
    throw new Error(`Ouverture de session impossible : ${error.message}`);
  }

  return client;
}

/** Supprime un utilisateur de test ; le profil et ses projets tombent en cascade. */
export async function supprimerUtilisateurDeTest(
  admin: SupabaseClient<Database>,
  userId: string,
): Promise<void> {
  await admin.auth.admin.deleteUser(userId);
}
