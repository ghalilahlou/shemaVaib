import { expect, test, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../lib/supabase/database.types';

/**
 * SV-005 — réclamation d'un ticket, vue depuis le navigateur.
 *
 * Les trois identités du cahier des charges y passent : le visiteur anonyme ne
 * voit aucun bouton, le contributeur réclame et relâche, le porteur du projet
 * peut débloquer un ticket qu'un autre a abandonné.
 */

const MOT_DE_PASSE = 'MotDePasseDeTest12345';
const PATTERN_NOM = 'Spec-First';

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
  const email = `reclamation-${suffixe()}@schemavibe.test`;

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

/**
 * Déconnecte, et n'en rend la main qu'une fois l'en-tête revenu à l'état
 * anonyme. Sans cette attente, l'inscription suivante part avant que les
 * cookies ne soient effacés.
 */
async function seDeconnecter(page: Page): Promise<void> {
  await page.getByTestId('deconnexion').click();
  await expect(page.getByTestId('lien-connexion')).toBeVisible();
}

/** Crée un projet actif puis un ticket publié dessus, et rend l'URL du ticket. */
async function creerTicketPublie(page: Page, titre: string): Promise<string> {
  const nomProjet = `Projet réclamation ${suffixe()}`;

  await page.goto('/projets/nouveau');
  await page.getByLabel('Nom du projet').fill(nomProjet);
  await page.getByLabel('Statut').selectOption('actif');
  await page.getByRole('button', { name: 'Créer le projet' }).click();
  await expect(page.getByTestId('formulaire-succes')).toBeVisible();

  await page.goto('/projets');
  await page.getByRole('link', { name: nomProjet }).click();
  await page.getByTestId('nouveau-ticket').click();

  await page.getByLabel('Titre').fill(titre);
  await page.getByLabel('Contexte', { exact: true }).fill('Un contexte suffisant.');
  await page.getByLabel('Critères d’acceptation').fill('Des critères explicites.');
  await page.getByLabel('Critère de test').fill('Un critère de test explicite.');
  await page.getByLabel('Complexité').selectOption('M');
  await page.getByLabel(PATTERN_NOM, { exact: false }).check();
  await page.getByLabel('Publier le ticket', { exact: false }).check();
  await page.getByRole('button', { name: 'Enregistrer le ticket' }).click();
  await expect(page.getByTestId('ticket-succes')).toContainText('Ticket publié.');

  await page.getByRole('link', { name: 'Le consulter' }).click();
  await expect(page).toHaveURL(/\/tickets\/[0-9a-f-]{36}$/);

  return page.url();
}

test('un visiteur anonyme ne se voit proposer aucune réclamation', async ({ page }) => {
  await sInscrire(page, 'Porteuse anonyme');
  const urlTicket = await creerTicketPublie(page, `Ticket visible ${suffixe()}`);

  await page.context().clearCookies();
  await page.goto(urlTicket);

  await expect(page.getByTestId('reclamation-etat')).toContainText(
    'personne ne l’a encore réclamé',
  );
  await expect(page.getByTestId('reclamer')).toHaveCount(0);
  await expect(page.getByTestId('relacher')).toHaveCount(0);
});

test('un contributeur réclame un ticket, puis le relâche', async ({ page }) => {
  await sInscrire(page, 'Porteuse du ticket');
  const urlTicket = await creerTicketPublie(page, `Ticket à réclamer ${suffixe()}`);

  await seDeconnecter(page);

  await sInscrire(page, 'Contributeur motivé');
  await page.goto(urlTicket);

  await page.getByTestId('reclamer').click();

  await expect(page.getByTestId('ticket-statut')).toHaveText('Réclamé');
  await expect(page.getByTestId('reclamation-etat')).toContainText(
    'Réclamé par Contributeur motivé',
  );
  await expect(page.getByTestId('reclamer')).toHaveCount(0);

  // Le réclamant se désiste : le ticket redevient disponible.
  await page.getByTestId('relacher').click();

  await expect(page.getByTestId('ticket-statut')).toHaveText('Ouvert');
  await expect(page.getByTestId('reclamer')).toBeVisible();
});

test('un tiers ne peut pas relâcher la réclamation d’un autre', async ({ page }) => {
  await sInscrire(page, 'Porteuse du projet gardé');
  const urlTicket = await creerTicketPublie(page, `Ticket gardé ${suffixe()}`);

  await seDeconnecter(page);
  await sInscrire(page, 'Premier réclamant');
  await page.goto(urlTicket);
  await page.getByTestId('reclamer').click();
  await expect(page.getByTestId('ticket-statut')).toHaveText('Réclamé');

  await seDeconnecter(page);
  await sInscrire(page, 'Tiers opportuniste');
  await page.goto(urlTicket);

  // Le ticket n'est plus réclamable, et le tiers n'a pas à pouvoir le libérer.
  await expect(page.getByTestId('reclamation-etat')).toContainText('Réclamé par Premier réclamant');
  await expect(page.getByTestId('reclamer')).toHaveCount(0);
  await expect(page.getByTestId('relacher')).toHaveCount(0);
});

test('le porteur du projet peut débloquer un ticket abandonné', async ({ page }) => {
  await sInscrire(page, 'Porteuse débloqueuse');
  const urlTicket = await creerTicketPublie(page, `Ticket abandonné ${suffixe()}`);

  await seDeconnecter(page);
  await sInscrire(page, 'Contributeur évaporé');
  await page.goto(urlTicket);
  await page.getByTestId('reclamer').click();
  await expect(page.getByTestId('ticket-statut')).toHaveText('Réclamé');

  // Le contributeur ne revient jamais. Sans cette issue, le ticket resterait
  // bloqué indéfiniment.
  await seDeconnecter(page);
  await page.goto('/connexion');

  const { data } = await admin.auth.admin.listUsers();
  const porteur = data.users.find(
    (utilisateur) => utilisateur.user_metadata?.nom === 'Porteuse débloqueuse',
  );

  await page.getByLabel('Adresse e-mail').first().fill(porteur!.email!);
  await page.getByLabel('Mot de passe').fill(MOT_DE_PASSE);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByTestId('session-utilisateur')).toHaveText('Porteuse débloqueuse');

  await page.goto(urlTicket);
  await expect(page.getByTestId('relacher')).toBeVisible();
  await page.getByTestId('relacher').click();

  await expect(page.getByTestId('ticket-statut')).toHaveText('Ouvert');
  await expect(page.getByTestId('reclamation-etat')).toContainText(
    'personne ne l’a encore réclamé',
  );
});

test('réclamer un ticket déjà pris affiche un refus compréhensible', async ({ page, browser }) => {
  await sInscrire(page, 'Porteuse du ticket disputé');
  const urlTicket = await creerTicketPublie(page, `Ticket disputé ${suffixe()}`);

  await seDeconnecter(page);
  await sInscrire(page, 'Contributeur lent');

  // La page est chargée alors que le ticket est encore libre.
  await page.goto(urlTicket);
  await expect(page.getByTestId('reclamer')).toBeVisible();

  // Entre-temps, quelqu'un d'autre le réclame. Un contexte de navigation
  // distinct, et non un simple onglet : deux onglets d'un même contexte
  // partagent leurs cookies, et la seconde session écraserait la première.
  const autreContexte = await browser.newContext();
  const autreVisiteur = await autreContexte.newPage();

  await sInscrire(autreVisiteur, 'Contributeur rapide');
  await autreVisiteur.goto(urlTicket);
  await autreVisiteur.getByTestId('reclamer').click();
  await expect(autreVisiteur.getByTestId('ticket-statut')).toHaveText('Réclamé');

  await autreContexte.close();

  // Le premier clique sur un bouton devenu caduc : le refus doit être explicite.
  await page.getByTestId('reclamer').click();

  await expect(page.getByTestId('reclamation-erreur')).toContainText(
    'vient d’être réclamé par quelqu’un d’autre',
  );
});
