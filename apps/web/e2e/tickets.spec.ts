import { expect, test, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../lib/supabase/database.types';

/**
 * SV-004 — parcours end-to-end des tickets (section 21).
 *
 * Le critère de test du ticket demande « le parcours de création complet ». Il
 * est pris au pied de la lettre : on part de l'inscription, on crée le projet,
 * puis on tente de publier un ticket incomplet — refusé, motifs à l'appui —
 * avant de le compléter et de le publier réellement.
 */

const MOT_DE_PASSE = 'MotDePasseDeTest12345';

let admin: SupabaseClient<Database>;
const comptes: string[] = [];

/**
 * Pattern choisi dans la bibliothèque posée par la migration de SV-008. Le test
 * n'en crée aucun : c'est précisément ce qu'il doit démontrer — une base fraîche
 * suffit désormais à satisfaire la Definition of Ready.
 */
const PATTERN_NOM = 'Spec-First';

function adresseUnique(prefixe: string): string {
  return `${prefixe}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}@schemavibe.test`;
}

test.beforeAll(async () => {
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
  const email = adresseUnique('porteur-tickets');

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

/** Crée un projet actif et rend son identifiant, lu depuis l'URL de détail. */
async function creerProjetActif(page: Page, nom: string): Promise<string> {
  await page.goto('/projets/nouveau');
  await page.getByLabel('Nom du projet').fill(nom);
  await page.getByLabel('Statut').selectOption('actif');
  await page.getByRole('button', { name: 'Créer le projet' }).click();
  await expect(page.getByTestId('formulaire-succes')).toBeVisible();

  await page.goto('/projets');
  await page.getByRole('link', { name: nom }).click();
  await expect(page).toHaveURL(/\/projets\/[0-9a-f-]{36}$/);

  return page.url().split('/').pop()!;
}

test('parcours complet : brouillon refusé à la publication, puis ticket publié', async ({
  page,
}) => {
  await sInscrire(page, 'Porteuse tickets');
  const projetId = await creerProjetActif(page, `Projet tickets ${Date.now().toString(36)}`);

  await page.getByTestId('nouveau-ticket').click();
  await expect(page).toHaveURL(`/projets/${projetId}/tickets/nouveau`);

  // Première tentative : publier un ticket incomplet.
  const titre = `Ajouter un filtre par statut ${Date.now().toString(36)}`;
  await page.getByLabel('Titre').fill(titre);
  await page.getByLabel('Publier le ticket', { exact: false }).check();
  await page.getByRole('button', { name: 'Enregistrer le ticket' }).click();

  await expect(page.getByTestId('ticket-erreur')).toBeVisible();
  const motifs = page.getByTestId('ticket-motifs');
  await expect(motifs).toContainText('Le contexte est vide.');
  await expect(motifs).toContainText('Les critères d’acceptation sont vides.');
  await expect(motifs).toContainText('Le critère de test est vide.');
  await expect(motifs).toContainText('La complexité n’est pas estimée.');
  await expect(motifs).toContainText('Aucun pattern n’est suggéré.');

  // Seconde tentative : la Definition of Ready est réunie.
  await page.getByLabel('Titre').fill(titre);
  await page
    .getByLabel('Contexte', { exact: true })
    .fill('La liste des tickets ne se filtre pas par statut.');
  await page
    .getByLabel('Critères d’acceptation')
    .fill('Un filtre par statut existe et conserve la sélection.');
  await page
    .getByLabel('Critère de test')
    .fill('Test e2e : filtrer sur « ouvert » ne laisse que des tickets ouverts.');
  await page.getByLabel('Complexité').selectOption('S');
  await page.getByLabel(PATTERN_NOM, { exact: false }).check();
  await page.getByLabel('Publier le ticket', { exact: false }).check();
  await page.getByRole('button', { name: 'Enregistrer le ticket' }).click();

  await expect(page.getByTestId('ticket-succes')).toContainText('Ticket publié.');

  // Le ticket existe vraiment et il est public.
  await page.getByRole('link', { name: 'Le consulter' }).click();
  await expect(page.getByRole('heading', { name: titre, level: 1 })).toBeVisible();
  await expect(page.getByTestId('ticket-statut')).toHaveText('Ouvert');
  await expect(page.getByTestId('ticket-patterns')).toContainText(PATTERN_NOM);

  await page.context().clearCookies();
  await page.goto('/tickets?statut=ouvert');
  await expect(page.getByRole('link', { name: titre })).toBeVisible();
});

test('un ticket incomplet s’enregistre en brouillon et n’est pas public', async ({ page }) => {
  await sInscrire(page, 'Porteuse brouillons');
  const projetId = await creerProjetActif(page, `Projet brouillons ${Date.now().toString(36)}`);

  const titre = `Idée à creuser ${Date.now().toString(36)}`;

  await page.goto(`/projets/${projetId}/tickets/nouveau`);
  await page.getByLabel('Titre').fill(titre);
  await page.getByRole('button', { name: 'Enregistrer le ticket' }).click();

  await expect(page.getByTestId('ticket-succes')).toContainText('Ticket enregistré en brouillon.');

  // Le porteur voit son brouillon et sait ce qui lui manque.
  await page.getByRole('link', { name: 'Le consulter' }).click();
  await expect(page.getByTestId('ticket-statut')).toHaveText('Brouillon');
  await expect(page.getByTestId('definition-of-ready')).toContainText('Aucun pattern');

  // Un visiteur anonyme ne le voit pas.
  await page.context().clearCookies();
  await page.goto('/tickets');
  await expect(page.getByRole('link', { name: titre })).toHaveCount(0);
});

test('la liste des tickets se filtre par statut et par projet', async ({ page }) => {
  await sInscrire(page, 'Porteuse filtres');
  const nomProjet = `Projet filtres ${Date.now().toString(36)}`;
  const projetId = await creerProjetActif(page, nomProjet);

  const titre = `Ticket filtrable ${Date.now().toString(36)}`;

  await page.goto(`/projets/${projetId}/tickets/nouveau`);
  await page.getByLabel('Titre').fill(titre);
  await page.getByLabel('Contexte', { exact: true }).fill('Un contexte suffisant.');
  await page.getByLabel('Critères d’acceptation').fill('Des critères explicites.');
  await page.getByLabel('Critère de test').fill('Un critère de test explicite.');
  await page.getByLabel('Complexité').selectOption('M');
  await page.getByLabel(PATTERN_NOM, { exact: false }).check();
  await page.getByLabel('Publier le ticket', { exact: false }).check();
  await page.getByRole('button', { name: 'Enregistrer le ticket' }).click();
  await expect(page.getByTestId('ticket-succes')).toBeVisible();

  await page.goto('/tickets?statut=ouvert');
  await expect(page.getByRole('link', { name: titre })).toBeVisible();

  await page.goto('/tickets?statut=fusionne');
  await expect(page.getByRole('link', { name: titre })).toHaveCount(0);

  await page.goto(`/tickets?projet=${projetId}`);
  await expect(page.getByRole('link', { name: titre })).toBeVisible();
});

test('un tiers ne peut pas ouvrir le formulaire de ticket d’un projet qu’il ne porte pas', async ({
  page,
}) => {
  await sInscrire(page, 'Porteuse du projet');
  const projetId = await creerProjetActif(page, `Projet gardé ${Date.now().toString(36)}`);

  await page.getByTestId('deconnexion').click();
  await expect(page.getByTestId('lien-connexion')).toBeVisible();

  await sInscrire(page, 'Tiers entreprenant');

  const reponse = await page.goto(`/projets/${projetId}/tickets/nouveau`);
  expect(reponse?.status()).toBe(404);
});
