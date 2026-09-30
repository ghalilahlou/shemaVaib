import { expect, test, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../lib/supabase/database.types';
import { lienDuDernierCourriel } from './outils/courriel';

/**
 * SV-021 — mot de passe oublié et page de profil, de bout en bout.
 *
 * Le parcours qui compte : un lien de réinitialisation reçu par e-mail mène au
 * choix d'un nouveau mot de passe, après quoi l'ancien ne connecte plus et le
 * nouveau si. Tester l'un sans l'autre ne prouverait pas qu'un mot de passe a
 * réellement changé.
 */

const ANCIEN = 'AncienMotDePasse12345';
const NOUVEAU = 'NouveauMotDePasse67890';

let admin: SupabaseClient<Database>;
const comptes: string[] = [];

function adresseUnique(prefixe: string): string {
  return `${prefixe}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}@schemavibe.test`;
}

async function creerCompte(email: string, nom: string): Promise<void> {
  const { data } = await admin.auth.admin.createUser({
    email,
    password: ANCIEN,
    email_confirm: true,
    user_metadata: { nom },
  });
  comptes.push(data.user!.id);
}

async function seConnecter(page: Page, email: string, motDePasse: string): Promise<void> {
  await page.goto('/connexion');
  await page.getByLabel('Adresse e-mail').first().fill(email);
  await page.getByLabel('Mot de passe').fill(motDePasse);
  await page.getByRole('button', { name: 'Se connecter' }).click();
}

test.beforeAll(() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !cle) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis.');
  }

  admin = createClient<Database>(url, cle, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
});

test.afterAll(async () => {
  for (const id of comptes) {
    await admin.auth.admin.deleteUser(id);
  }
});

test('un lien de réinitialisation remplace réellement le mot de passe', async ({
  page,
  request,
}) => {
  const email = adresseUnique('reinitialisation');
  await creerCompte(email, 'Mémoire courte');

  await page.goto('/connexion');
  await page.getByRole('link', { name: 'Mot de passe oublié ?' }).click();
  // Sans cette attente, le champ se remplit encore sur la page de connexion,
  // que la navigation remplace aussitôt.
  await expect(page).toHaveURL(/\/mot-de-passe-oublie$/);
  await page.getByLabel('Adresse e-mail').fill(email);
  await page.getByRole('button', { name: 'Recevoir un lien' }).click();
  await expect(page.getByTestId('auth-succes')).toContainText('Si un compte existe');

  await page.goto(await lienDuDernierCourriel(request, email));
  await expect(page).toHaveURL(/\/mot-de-passe\/nouveau$/);

  await page.getByLabel('Nouveau mot de passe').fill(NOUVEAU);
  await page.getByLabel('Confirmer le mot de passe').fill(NOUVEAU);
  await page.getByRole('button', { name: 'Enregistrer le mot de passe' }).click();

  await expect(page).toHaveURL(/\/profil\?mot_de_passe=modifie$/);
  await expect(page.getByText('Mot de passe modifié.')).toBeVisible();

  await page.getByTestId('deconnexion').click();
  await expect(page.getByTestId('lien-connexion')).toBeVisible();

  // L'ancien ne connecte plus...
  await seConnecter(page, email, ANCIEN);
  await expect(page.getByTestId('auth-erreur')).toBeVisible();

  // ...le nouveau, si.
  await seConnecter(page, email, NOUVEAU);
  await expect(page.getByTestId('session-utilisateur')).toHaveText('Mémoire courte');
});

test('la demande de réinitialisation répond pareil pour une adresse inconnue', async ({ page }) => {
  await page.goto('/mot-de-passe-oublie');
  await page.getByLabel('Adresse e-mail').fill(adresseUnique('jamais-inscrit'));
  await page.getByRole('button', { name: 'Recevoir un lien' }).click();

  await expect(page.getByTestId('auth-succes')).toContainText('Si un compte existe');
});

test('deux saisies différentes du nouveau mot de passe sont refusées', async ({ page }) => {
  const email = adresseUnique('confirmation');
  await creerCompte(email, 'Doigts rapides');
  await seConnecter(page, email, ANCIEN);
  await expect(page.getByTestId('session-utilisateur')).toBeVisible();

  await page.goto('/mot-de-passe/nouveau');
  await page.getByLabel('Nouveau mot de passe').fill(NOUVEAU);
  await page.getByLabel('Confirmer le mot de passe').fill(`${NOUVEAU}x`);
  await page.getByRole('button', { name: 'Enregistrer le mot de passe' }).click();

  await expect(page.getByText('Les deux mots de passe ne sont pas identiques.')).toBeVisible();
  await expect(page).toHaveURL(/\/mot-de-passe\/nouveau$/);
});

test('le profil exige une session et y ramène après connexion', async ({ page }) => {
  const email = adresseUnique('profil-protege');
  await creerCompte(email, 'Retour au profil');

  await page.goto('/profil');
  await expect(page).toHaveURL(/\/connexion\?next=%2Fprofil$/);

  await page.getByLabel('Adresse e-mail').first().fill(email);
  await page.getByLabel('Mot de passe').fill(ANCIEN);
  await page.getByRole('button', { name: 'Se connecter' }).click();

  await expect(page).toHaveURL(/\/profil$/);
  await expect(page.getByTestId('vibe-score-gauge')).toHaveAttribute('data-score', 'absent');
});

test('le nom modifié sur le profil apparaît dans l’en-tête', async ({ page }) => {
  const email = adresseUnique('renommage');
  await creerCompte(email, 'Ancien nom');
  await seConnecter(page, email, ANCIEN);
  await expect(page.getByTestId('session-utilisateur')).toHaveText('Ancien nom');

  await page.getByTestId('session-utilisateur').click();
  await expect(page).toHaveURL(/\/profil$/);

  await page.getByLabel('Nom public').fill('Nouveau nom');
  await page.getByRole('button', { name: 'Enregistrer' }).click();

  await expect(page.getByText('Nom mis à jour.')).toBeVisible();
  await expect(page.getByTestId('session-utilisateur')).toHaveText('Nouveau nom');
});
