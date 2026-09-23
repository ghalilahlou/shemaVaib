import { expect, test, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../lib/supabase/database.types';

/**
 * SV-006 — soumission d'une solution, vue depuis le navigateur.
 *
 * Le parcours complet est celui de la boucle Review-Refine (section 5.2) :
 * réclamer, soumettre, puis soumettre à nouveau après retour.
 */

const MOT_DE_PASSE = 'MotDePasseDeTest12345';
const PATTERN_NOM = 'Spec-First';
const DIFF = 'https://github.com/ghalilahlou/shemaVaib/pull/1/files';
const APERCU = 'https://apercu.schemavibe.test/pr-1';

let admin: SupabaseClient<Database>;
const comptes: string[] = [];

function suffixe(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
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

async function sInscrire(page: Page, nom: string): Promise<void> {
  const email = `soumission-${suffixe()}@schemavibe.test`;

  await page.goto('/inscription');
  await page.getByLabel('Nom').fill(nom);
  await page.getByLabel('Adresse e-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(MOT_DE_PASSE);
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page.getByTestId('session-utilisateur')).toHaveText(nom);

  const { data } = await admin.auth.admin.listUsers();
  const compte = data.users.find((utilisateur) => utilisateur.email === email);
  if (compte) comptes.push(compte.id);
}

async function seDeconnecter(page: Page): Promise<void> {
  await page.getByTestId('deconnexion').click();
  await expect(page.getByTestId('lien-connexion')).toBeVisible();
}

/** Crée un projet actif et un ticket publié dessus, et rend l'URL du ticket. */
async function creerTicketPublie(page: Page): Promise<string> {
  const nomProjet = `Projet soumission ${suffixe()}`;

  await page.goto('/projets/nouveau');
  await page.getByLabel('Nom du projet').fill(nomProjet);
  await page.getByLabel('Statut').selectOption('actif');
  await page.getByRole('button', { name: 'Créer le projet' }).click();
  await expect(page.getByTestId('formulaire-succes')).toBeVisible();

  await page.goto('/projets');
  await page.getByRole('link', { name: nomProjet }).click();
  await page.getByTestId('nouveau-ticket').click();

  await page.getByLabel('Titre').fill(`Ticket à résoudre ${suffixe()}`);
  await page.getByLabel('Contexte', { exact: true }).fill('Un contexte suffisant.');
  await page.getByLabel('Critères d’acceptation').fill('Des critères explicites.');
  await page.getByLabel('Critère de test').fill('Un critère de test explicite.');
  await page.getByLabel('Complexité').selectOption('M');
  await page.getByLabel(PATTERN_NOM, { exact: false }).check();
  await page.getByLabel('Publier le ticket', { exact: false }).check();
  await page.getByRole('button', { name: 'Enregistrer le ticket' }).click();
  await expect(page.getByTestId('ticket-succes')).toBeVisible();

  await page.getByRole('link', { name: 'Le consulter' }).click();
  await expect(page).toHaveURL(/\/tickets\/[0-9a-f-]{36}$/);

  return page.url();
}

test('parcours complet : réclamer, soumettre, puis soumettre à nouveau', async ({ page }) => {
  await sInscrire(page, 'Porteuse soumission');
  const urlTicket = await creerTicketPublie(page);

  await seDeconnecter(page);
  await sInscrire(page, 'Contributeur soumettant');
  await page.goto(urlTicket);

  // Sans réclamation, aucun formulaire de soumission.
  await expect(page.getByTestId('formulaire-soumission')).toHaveCount(0);
  await expect(page.getByTestId('soumissions-vide')).toBeVisible();

  await page.getByTestId('reclamer').click();
  await expect(page.getByTestId('ticket-statut')).toHaveText('Réclamé');
  await expect(page.getByTestId('formulaire-soumission')).toBeVisible();

  // Première soumission.
  await page.getByLabel('Lien vers le diff').fill(DIFF);
  await page.getByLabel('Lien vers l’aperçu live').fill(APERCU);
  await page.getByLabel('Résumé', { exact: false }).fill('Trois fichiers modifiés, deux tests.');
  await page.getByTestId('soumettre').click();

  await expect(page.getByTestId('soumission-succes')).toBeVisible();
  await expect(page.getByTestId('ticket-statut')).toHaveText('Soumis');
  await expect(page.getByTestId('soumissions-liste')).toContainText('Tentative 1');
  await expect(page.getByTestId('soumission-resume')).toContainText('deux tests');

  // Seconde soumission : la boucle Review-Refine suppose qu'on repasse.
  await page.getByLabel('Lien vers le diff').fill(`${DIFF}?v=2`);
  await page.getByLabel('Lien vers l’aperçu live').fill(`${APERCU}?v=2`);
  await page.getByLabel('Résumé', { exact: false }).fill('Retour de revue pris en compte.');
  await page.getByTestId('soumettre').click();

  await expect(page.getByTestId('soumissions-liste')).toContainText('Tentative 2');
  await expect(page.getByTestId('soumissions-liste')).toContainText('Retour de revue');

  // Les soumissions d'un ticket public sont publiques.
  await page.context().clearCookies();
  await page.goto(urlTicket);
  await expect(page.getByTestId('soumissions-liste')).toContainText('Tentative 2');
  await expect(page.getByTestId('formulaire-soumission')).toHaveCount(0);
});

test('le formulaire exige le diff et l’aperçu', async ({ page }) => {
  await sInscrire(page, 'Porteuse liens');
  const urlTicket = await creerTicketPublie(page);

  await seDeconnecter(page);
  await sInscrire(page, 'Contributeur pressé');
  await page.goto(urlTicket);
  await page.getByTestId('reclamer').click();
  await expect(page.getByTestId('formulaire-soumission')).toBeVisible();

  await page.getByTestId('soumettre').click();

  await expect(page.getByText('Le lien vers le diff est obligatoire.')).toBeVisible();
  await expect(page.getByText('Le lien vers l’aperçu est obligatoire.')).toBeVisible();
  await expect(page.getByTestId('soumissions-vide')).toBeVisible();
});

test('un tiers ne se voit proposer aucun formulaire de soumission', async ({ page }) => {
  await sInscrire(page, 'Porteuse gardée');
  const urlTicket = await creerTicketPublie(page);

  await seDeconnecter(page);
  await sInscrire(page, 'Réclamant en titre');
  await page.goto(urlTicket);
  await page.getByTestId('reclamer').click();
  await expect(page.getByTestId('ticket-statut')).toHaveText('Réclamé');

  await seDeconnecter(page);
  await sInscrire(page, 'Tiers curieux');
  await page.goto(urlTicket);

  await expect(page.getByTestId('formulaire-soumission')).toHaveCount(0);
});

test('un ticket relâché après soumission garde son historique', async ({ page }) => {
  await sInscrire(page, 'Porteuse historienne');
  const urlTicket = await creerTicketPublie(page);

  await seDeconnecter(page);
  await sInscrire(page, 'Contributeur partant');
  await page.goto(urlTicket);
  await page.getByTestId('reclamer').click();

  await page.getByLabel('Lien vers le diff').fill(DIFF);
  await page.getByLabel('Lien vers l’aperçu live').fill(APERCU);
  await page.getByTestId('soumettre').click();
  await expect(page.getByTestId('soumission-succes')).toBeVisible();

  // Le contributeur se désiste. Sa tentative reste attachée au ticket :
  // l'historique fait partie de ce qu'un ticket expose (section 5.1).
  await page.getByTestId('relacher').click();

  await expect(page.getByTestId('ticket-statut')).toHaveText('Ouvert');
  await expect(page.getByTestId('soumissions-liste')).toContainText('Tentative 1');
  await expect(page.getByTestId('formulaire-soumission')).toHaveCount(0);
  await expect(page.getByTestId('reclamer')).toBeVisible();
});

test('soumettre sur un ticket repris entre-temps affiche un refus explicite', async ({
  page,
  browser,
}) => {
  await sInscrire(page, 'Porteuse arbitre');
  const urlTicket = await creerTicketPublie(page);

  await seDeconnecter(page);
  await sInscrire(page, 'Contributeur distrait');
  await page.goto(urlTicket);
  await page.getByTestId('reclamer').click();
  await expect(page.getByTestId('formulaire-soumission')).toBeVisible();

  // Le porteur libère le ticket depuis un autre contexte de navigation, pendant
  // que le contributeur remplit son formulaire.
  const autreContexte = await browser.newContext();
  const autreVisiteur = await autreContexte.newPage();
  await autreVisiteur.goto('/connexion');

  const { data } = await admin.auth.admin.listUsers();
  const porteur = data.users.find(
    (utilisateur) => utilisateur.user_metadata?.nom === 'Porteuse arbitre',
  );

  await autreVisiteur.getByLabel('Adresse e-mail').first().fill(porteur!.email!);
  await autreVisiteur.getByLabel('Mot de passe').fill(MOT_DE_PASSE);
  await autreVisiteur.getByRole('button', { name: 'Se connecter' }).click();
  await expect(autreVisiteur.getByTestId('session-utilisateur')).toBeVisible();

  await autreVisiteur.goto(urlTicket);
  await autreVisiteur.getByTestId('relacher').click();
  await expect(autreVisiteur.getByTestId('ticket-statut')).toHaveText('Ouvert');
  await autreContexte.close();

  // Le contributeur envoie son formulaire, devenu caduc.
  await page.getByLabel('Lien vers le diff').fill(DIFF);
  await page.getByLabel('Lien vers l’aperçu live').fill(APERCU);
  await page.getByTestId('soumettre').click();

  await expect(page.getByTestId('soumission-erreur')).toContainText('n’est plus réclamé par vous');
});
