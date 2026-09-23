import { expect, test, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../lib/supabase/database.types';

/**
 * SV-007 — le pulse vu depuis le navigateur.
 *
 * Deux choses seulement, mais les bonnes : la page se met à jour sans être
 * rechargée, et ce qu'elle affiche à un visiteur anonyme reste ce que la RLS
 * l'autorise à voir — y compris pour un événement survenu pendant qu'il regarde.
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
  const email = `pulse-${suffixe()}@schemavibe.test`;

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

/** Crée un projet au statut voulu et rend son identifiant. */
async function creerProjet(page: Page, statut: 'actif' | 'brouillon'): Promise<string> {
  const nom = `Projet pulse ${suffixe()}`;

  await page.goto('/projets/nouveau');
  await page.getByLabel('Nom du projet').fill(nom);
  await page.getByLabel('Statut').selectOption(statut);
  await page.getByRole('button', { name: 'Créer le projet' }).click();
  await expect(page.getByTestId('formulaire-succes')).toBeVisible();

  await page.goto('/projets?statut=' + statut);
  await page.getByRole('link', { name: nom }).click();
  await expect(page).toHaveURL(/\/projets\/[0-9a-f-]{36}$/);

  return page.url().split('/').pop()!;
}

/** Crée un ticket publié sur le projet courant et rend son identifiant. */
async function creerTicketPublie(page: Page, projetId: string, titre: string): Promise<string> {
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

  await page.getByRole('link', { name: 'Le consulter' }).click();
  await expect(page).toHaveURL(/\/tickets\/[0-9a-f-]{36}$/);

  return page.url().split('/').pop()!;
}

test('le pulse affiche l’activité déjà survenue', async ({ page }) => {
  await sInscrire(page, 'Porteuse pulse initial');
  const projetId = await creerProjet(page, 'actif');
  const titre = `Ticket au pulse ${suffixe()}`;
  await creerTicketPublie(page, projetId, titre);

  await page.goto(`/projets/${projetId}/pulse`);

  await expect(page.getByRole('heading', { name: 'Pulse', level: 1 })).toBeVisible();
  await expect(page.getByTestId('pulse-flux')).toContainText(titre);
  await expect(page.getByTestId('pulse-statut-valeur').first()).toHaveText('Ouvert');
});

test('le pulse se met à jour sans rechargement', async ({ page, browser }) => {
  await sInscrire(page, 'Porteuse pulse direct');
  const projetId = await creerProjet(page, 'actif');
  const titre = `Ticket suivi en direct ${suffixe()}`;
  const ticketId = await creerTicketPublie(page, projetId, titre);

  // Le porteur regarde le pulse, déconnecté, comme un visiteur quelconque.
  await page.context().clearCookies();
  await page.goto(`/projets/${projetId}/pulse`);
  await expect(page.getByTestId('pulse-connexion')).toHaveAttribute('data-connecte', 'true');
  await expect(page.getByTestId('pulse-flux')).toContainText('Ouvert');

  // Un contributeur réclame puis soumet, depuis un autre contexte.
  const autreContexte = await browser.newContext();
  const contributeur = await autreContexte.newPage();
  await sInscrire(contributeur, 'Contributeur pulse');
  await contributeur.goto(`/tickets/${ticketId}`);
  await contributeur.getByTestId('reclamer').click();
  await expect(contributeur.getByTestId('ticket-statut')).toHaveText('Réclamé');

  // La page du visiteur n'a pas été rechargée : le changement doit y arriver seul.
  await expect(page.getByTestId('pulse-statut-valeur').first()).toHaveText('Réclamé');

  await contributeur.getByLabel('Lien vers le diff').fill(DIFF);
  await contributeur.getByLabel('Lien vers l’aperçu live').fill(APERCU);
  await contributeur.getByTestId('soumettre').click();
  await expect(contributeur.getByTestId('soumission-succes')).toBeVisible();

  await expect(page.getByTestId('pulse-soumission').first()).toContainText(
    'Nouvelle soumission sur',
  );
  await expect(page.getByTestId('pulse-statut-valeur').first()).toHaveText('Soumis');

  await autreContexte.close();
});

test('un visiteur anonyme ne voit rien d’un projet en brouillon', async ({ page }) => {
  await sInscrire(page, 'Porteuse pulse privé');
  const projetId = await creerProjet(page, 'brouillon');
  const titre = `Ticket privé ${suffixe()}`;
  await creerTicketPublie(page, projetId, titre);

  // Le porteur voit l'activité de son propre brouillon.
  await page.goto(`/projets/${projetId}/pulse`);
  await expect(page.getByTestId('pulse-flux')).toContainText(titre);

  // Un anonyme ne trouve même pas la page : le projet n'existe pas pour lui.
  await page.context().clearCookies();
  const reponse = await page.goto(`/projets/${projetId}/pulse`);
  expect(reponse?.status()).toBe(404);
});

test('un événement survenu en direct sur un ticket invisible ne parvient pas à l’anonyme', async ({
  page,
  browser,
}) => {
  // Un projet public, un ticket publié — le visiteur a donc bien un pulse à
  // regarder — et à côté un brouillon de ticket qu'il ne doit jamais voir, même
  // lorsqu'il bouge pendant qu'il regarde.
  await sInscrire(page, 'Porteuse pulse mixte');
  const projetId = await creerProjet(page, 'actif');
  const titrePublic = `Ticket public ${suffixe()}`;
  await creerTicketPublie(page, projetId, titrePublic);

  const titreBrouillon = `Brouillon invisible ${suffixe()}`;
  await page.goto(`/projets/${projetId}/tickets/nouveau`);
  await page.getByLabel('Titre').fill(titreBrouillon);
  await page.getByRole('button', { name: 'Enregistrer le ticket' }).click();
  await expect(page.getByTestId('ticket-succes')).toContainText('brouillon');
  await page.getByRole('link', { name: 'Le consulter' }).click();
  const brouillonId = page.url().split('/').pop()!;

  const porteurContexte = page.context();

  // Le visiteur anonyme ouvre le pulse dans un contexte neuf.
  const contexteAnonyme = await browser.newContext();
  const anonyme = await contexteAnonyme.newPage();
  await anonyme.goto(`/projets/${projetId}/pulse`);
  await expect(anonyme.getByTestId('pulse-connexion')).toHaveAttribute('data-connecte', 'true');
  await expect(anonyme.getByTestId('pulse-flux')).toContainText(titrePublic);
  await expect(anonyme.getByTestId('pulse-flux')).not.toContainText(titreBrouillon);

  // Le porteur modifie son brouillon pendant que l'anonyme regarde.
  await admin
    .from('tickets')
    .update({ priorite: 'critique', titre: `${titreBrouillon} modifié` })
    .eq('id', brouillonId);

  // Puis une modification visible, qui sert de repère : si elle arrive et que
  // le brouillon n'est toujours pas là, l'absence n'est pas un simple retard.
  await page.goto(`/projets/${projetId}/pulse`);
  const ticketPublicId = await porteurContexte
    .pages()[0]!
    .evaluate(() => document.querySelector('[data-testid="pulse-flux"] a')?.getAttribute('href'));

  await admin
    .from('tickets')
    .update({ priorite: 'haute' })
    .eq('id', (ticketPublicId ?? '').split('/').pop() ?? '');

  await expect(anonyme.getByTestId('pulse-flux')).toContainText(titrePublic);
  await expect(anonyme.getByTestId('pulse-flux')).not.toContainText('modifié');

  await contexteAnonyme.close();
});
