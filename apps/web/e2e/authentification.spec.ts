import { expect, test, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../lib/supabase/database.types';

/**
 * SV-001 — parcours end-to-end de l'authentification (section 21).
 *
 * Trois identités, comme pour les politiques RLS de SV-003 : le visiteur
 * anonyme, le porteur connecté, et un tiers connecté. Le test qui compte le plus
 * est celui qui va jusqu'au bout — inscription, puis création d'un projet
 * réellement réussie dans le navigateur, là où SV-003 ne savait que refuser.
 */

const MOT_DE_PASSE = 'MotDePasseDeTest12345';
const MAILPIT_URL = 'http://127.0.0.1:54324';

let admin: SupabaseClient<Database>;
const comptesACreerPuisSupprimer: string[] = [];

function adresseUnique(prefixe: string): string {
  return `${prefixe}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}@schemavibe.test`;
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
  for (const id of comptesACreerPuisSupprimer) {
    await admin.auth.admin.deleteUser(id);
  }
});

/** Retient l'identifiant du compte portant cette adresse, pour le nettoyage. */
async function retenirCompte(email: string): Promise<void> {
  const { data } = await admin.auth.admin.listUsers();
  const compte = data.users.find((utilisateur) => utilisateur.email === email);

  if (compte) {
    comptesACreerPuisSupprimer.push(compte.id);
  }
}

/**
 * Inscrit un compte et n'en rend la main qu'une fois la session réellement
 * établie. Sans cette attente, la navigation suivante part avant que les
 * cookies ne soient posés, et le test échoue pour une raison qui n'a rien à
 * voir avec ce qu'il vérifie.
 */
async function sInscrire(page: Page, nom: string, email: string): Promise<void> {
  await page.goto('/inscription');
  await page.getByLabel('Nom').fill(nom);
  await page.getByLabel('Adresse e-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(MOT_DE_PASSE);
  await page.getByRole('button', { name: 'Créer mon compte' }).click();

  await expect(page.getByTestId('session-utilisateur')).toHaveText(nom);
  await retenirCompte(email);
}

test('un visiteur anonyme voit les liens de connexion et d’inscription', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByTestId('lien-connexion')).toBeVisible();
  await expect(page.getByTestId('lien-inscription')).toBeVisible();
  await expect(page.getByTestId('session-utilisateur')).toHaveCount(0);
});

test('un visiteur anonyme est redirigé vers la connexion depuis le formulaire de projet', async ({
  page,
}) => {
  await page.goto('/projets/nouveau');

  await expect(page).toHaveURL(/\/connexion/);
  await expect(page.getByRole('heading', { name: 'Se connecter', level: 1 })).toBeVisible();
});

test('le formulaire d’inscription refuse un mot de passe trop faible', async ({ page }) => {
  await page.goto('/inscription');

  await page.getByLabel('Nom').fill('Mot de passe faible');
  await page.getByLabel('Adresse e-mail').fill(adresseUnique('faible'));
  await page.getByLabel('Mot de passe').fill('court');
  await page.getByRole('button', { name: 'Créer mon compte' }).click();

  await expect(page.getByText('au moins 12 caractères')).toBeVisible();
  await expect(page).toHaveURL(/\/inscription/);
});

test('le formulaire d’inscription refuse un mot de passe sans majuscule ni chiffre', async ({
  page,
}) => {
  await page.goto('/inscription');

  await page.getByLabel('Nom').fill('Mot de passe simple');
  await page.getByLabel('Adresse e-mail').fill(adresseUnique('simple'));
  await page.getByLabel('Mot de passe').fill('motdepasselongmaissimple');
  await page.getByRole('button', { name: 'Créer mon compte' }).click();

  await expect(page.getByText('une minuscule, une majuscule et un chiffre')).toBeVisible();
});

test('la connexion ne dit pas si l’adresse existe ou non', async ({ page }) => {
  await page.goto('/connexion');

  await page.getByLabel('Adresse e-mail').first().fill(adresseUnique('inexistant'));
  await page.getByLabel('Mot de passe').fill('MauvaisMotDePasse123');
  await page.getByRole('button', { name: 'Se connecter' }).click();

  await expect(page.getByTestId('auth-erreur')).toHaveText(
    'Adresse e-mail ou mot de passe incorrect.',
  );
});

test('la demande de magic link répond pareil pour une adresse inconnue', async ({ page }) => {
  await page.goto('/connexion');

  await page.getByLabel('Recevoir un lien de connexion').fill(adresseUnique('jamais-inscrit'));
  await page.getByTestId('magic-link-envoyer').click();

  await expect(page.getByTestId('auth-succes')).toContainText('Si un compte existe');
});

/**
 * Le test qui valide la Definition of Ready du ticket : le refus propre codé en
 * SV-003 doit se transformer en succès dès qu'une session existe.
 */
test('inscription, puis création d’un projet réellement réussie', async ({ page }) => {
  const email = adresseUnique('porteur');

  await page.goto('/inscription');
  await page.getByLabel('Nom').fill('Porteuse end-to-end');
  await page.getByLabel('Adresse e-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(MOT_DE_PASSE);
  await page.getByRole('button', { name: 'Créer mon compte' }).click();

  // L'inscription mène directement à la liste des projets, session ouverte.
  await expect(page).toHaveURL(/\/projets$/);
  await expect(page.getByTestId('session-utilisateur')).toHaveText('Porteuse end-to-end');

  await retenirCompte(email);

  const nomProjet = `Projet créé après inscription ${Date.now().toString(36)}`;

  await page.goto('/projets/nouveau');
  await expect(page).toHaveURL(/\/projets\/nouveau/);

  await page.getByLabel('Nom du projet').fill(nomProjet);
  await page.getByLabel('Statut').selectOption('actif');
  await page.getByRole('button', { name: 'Créer le projet' }).click();

  await expect(page.getByTestId('formulaire-succes')).toHaveText('Projet créé.');

  // Le projet existe vraiment et il est public : un visiteur anonyme le voit.
  await page.context().clearCookies();
  await page.goto('/projets');
  await expect(page.getByRole('link', { name: nomProjet })).toBeVisible();
});

test('déconnexion, puis retour à l’état anonyme', async ({ page }) => {
  const email = adresseUnique('deconnexion');

  await page.goto('/inscription');
  await page.getByLabel('Nom').fill('Compte à déconnecter');
  await page.getByLabel('Adresse e-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(MOT_DE_PASSE);
  await page.getByRole('button', { name: 'Créer mon compte' }).click();

  await expect(page.getByTestId('session-utilisateur')).toBeVisible();
  await retenirCompte(email);

  await page.getByTestId('deconnexion').click();

  await expect(page.getByTestId('lien-connexion')).toBeVisible();
  await expect(page.getByTestId('session-utilisateur')).toHaveCount(0);

  await page.goto('/projets/nouveau');
  await expect(page).toHaveURL(/\/connexion/);
});

test('un tiers connecté ne voit pas le brouillon du porteur', async ({ page }) => {
  const emailPorteur = adresseUnique('porteur-brouillon');
  const emailTiers = adresseUnique('tiers');
  const nomBrouillon = `Brouillon privé ${Date.now().toString(36)}`;

  // Le porteur crée un brouillon.
  await sInscrire(page, 'Porteur du brouillon', emailPorteur);

  await page.goto('/projets/nouveau');
  await page.getByLabel('Nom du projet').fill(nomBrouillon);
  await page.getByRole('button', { name: 'Créer le projet' }).click();
  await expect(page.getByTestId('formulaire-succes')).toHaveText('Projet créé.');

  // Le porteur voit son brouillon.
  await page.goto('/projets');
  await expect(page.getByRole('link', { name: nomBrouillon })).toBeVisible();

  // Un tiers connecté ne le voit pas.
  await page.getByTestId('deconnexion').click();
  await expect(page.getByTestId('lien-connexion')).toBeVisible();

  await sInscrire(page, 'Tiers curieux', emailTiers);

  await page.goto('/projets');
  await expect(page.getByRole('link', { name: nomBrouillon })).toHaveCount(0);
});

test('un magic link connecte réellement son destinataire', async ({ page, request }) => {
  const email = adresseUnique('magic');

  // Le compte doit exister : la demande de lien ne crée pas d'utilisateur.
  const { data } = await admin.auth.admin.createUser({
    email,
    password: MOT_DE_PASSE,
    email_confirm: true,
    user_metadata: { nom: 'Destinataire du lien' },
  });
  comptesACreerPuisSupprimer.push(data.user!.id);

  await page.goto('/connexion');
  await page.getByLabel('Recevoir un lien de connexion').fill(email);
  await page.getByTestId('magic-link-envoyer').click();
  await expect(page.getByTestId('auth-succes')).toBeVisible();

  // Mailpit, le serveur mail de la stack Supabase locale, garde le message.
  const boite = await request.get(`${MAILPIT_URL}/api/v1/search?query=to:${email}`);
  const resultats = (await boite.json()) as { messages: { ID: string }[] };
  expect(resultats.messages.length).toBeGreaterThan(0);

  const messageId = resultats.messages[0]!.ID;
  const message = await request.get(`${MAILPIT_URL}/api/v1/message/${messageId}`);
  const corps = (await message.json()) as { Text: string; HTML: string };

  const lien = /http:\/\/127\.0\.0\.1:54321\/auth\/v1\/verify\?[^\s"<]+/.exec(
    `${corps.Text}\n${corps.HTML}`,
  );
  expect(lien, 'le courriel doit contenir un lien de vérification').not.toBeNull();

  await page.goto(lien![0].replaceAll('&amp;', '&'));

  await expect(page.getByTestId('session-utilisateur')).toHaveText('Destinataire du lien');
});
