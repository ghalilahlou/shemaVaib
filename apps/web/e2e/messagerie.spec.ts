import { expect, test, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../lib/supabase/database.types';

/**
 * SV-010 — messagerie vue depuis le navigateur.
 *
 * Deux exigences : un fil avance sans rechargement, et ce qu'il laisse voir
 * reste ce que la Row Level Security autorise — y compris pour un message
 * publié pendant qu'on regarde.
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
  const email = `messagerie-${suffixe()}@schemavibe.test`;

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

async function creerProjet(page: Page, statut: 'actif' | 'brouillon'): Promise<string> {
  const nom = `Projet messagerie ${suffixe()}`;

  await page.goto('/projets/nouveau');
  await page.getByLabel('Nom du projet').fill(nom);
  await page.getByLabel('Statut').selectOption(statut);
  await page.getByRole('button', { name: 'Créer le projet' }).click();
  await expect(page.getByTestId('formulaire-succes')).toBeVisible();

  const { data } = await admin.from('projects').select('id').eq('nom', nom).single();

  return data!.id;
}

async function creerTicketPublie(page: Page, projetId: string): Promise<string> {
  const titre = `Ticket messagerie ${suffixe()}`;

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

  const { data } = await admin.from('tickets').select('id').eq('titre', titre).single();

  return data!.id;
}

test('le canal d’un projet accepte un message et l’affiche signé', async ({ page }) => {
  await sInscrire(page, 'Porteuse canal');
  const projetId = await creerProjet(page, 'actif');

  await page.goto(`/projets/${projetId}`);
  await page.getByTestId('lien-discussions').click();
  await expect(page).toHaveURL(`/projets/${projetId}/discussions`);
  await expect(page.getByTestId('fil-vide')).toBeVisible();

  await page.getByLabel('Votre message').fill('Première annonce du projet.');
  await page.getByTestId('envoyer-message').click();

  await expect(page.getByTestId('fil-messages')).toContainText('Première annonce du projet.');
  await expect(page.getByTestId('message-auteur').first()).toHaveText('Porteuse canal');
});

test('le fil d’un ticket est distinct du canal du projet', async ({ page }) => {
  await sInscrire(page, 'Porteuse fils');
  const projetId = await creerProjet(page, 'actif');
  const ticketId = await creerTicketPublie(page, projetId);

  await page.goto(`/projets/${projetId}/discussions`);
  await page.getByLabel('Votre message').fill('Message de canal.');
  await page.getByTestId('envoyer-message').click();
  await expect(page.getByTestId('fil-messages')).toContainText('Message de canal.');

  await page.goto(`/tickets/${ticketId}`);
  await expect(page.getByTestId('fil-vide')).toBeVisible();
  await page.getByLabel('Votre message').fill('Question sur ce ticket.');
  await page.getByTestId('envoyer-message').click();
  await expect(page.getByTestId('fil-messages')).toContainText('Question sur ce ticket.');
  await expect(page.getByTestId('fil-messages')).not.toContainText('Message de canal.');

  await page.goto(`/projets/${projetId}/discussions`);
  await expect(page.getByTestId('fil-messages')).not.toContainText('Question sur ce ticket.');
});

test('un visiteur anonyme lit sans pouvoir écrire', async ({ page }) => {
  await sInscrire(page, 'Porteuse lisible');
  const projetId = await creerProjet(page, 'actif');

  await page.goto(`/projets/${projetId}/discussions`);
  await page.getByLabel('Votre message').fill('Annonce publique.');
  await page.getByTestId('envoyer-message').click();
  await expect(page.getByTestId('fil-messages')).toContainText('Annonce publique.');

  await page.context().clearCookies();
  await page.goto(`/projets/${projetId}/discussions`);

  await expect(page.getByTestId('fil-messages')).toContainText('Annonce publique.');
  await expect(page.getByTestId('formulaire-message')).toHaveCount(0);
  await expect(page.getByTestId('fil-lecture-seule')).toBeVisible();
});

test('le fil avance sans rechargement', async ({ page, browser }) => {
  await sInscrire(page, 'Porteuse directe');
  const projetId = await creerProjet(page, 'actif');

  await page.goto(`/projets/${projetId}/discussions`);
  await expect(page.getByTestId('fil-connexion')).toHaveAttribute('data-connecte', 'true');

  // Quelqu'un d'autre écrit depuis un contexte de navigation distinct.
  const autreContexte = await browser.newContext();
  const autre = await autreContexte.newPage();
  await sInscrire(autre, 'Contributeur direct');
  await autre.goto(`/projets/${projetId}/discussions`);
  await autre.getByLabel('Votre message').fill('Message arrivé en direct.');
  await autre.getByTestId('envoyer-message').click();
  await expect(autre.getByTestId('fil-messages')).toContainText('Message arrivé en direct.');

  // La page de la porteuse n'a pas été rechargée.
  await expect(page.getByTestId('fil-messages')).toContainText('Message arrivé en direct.');
  // Le nom de l'auteur est résolu dans un second temps.
  await expect(page.getByTestId('fil-messages')).toContainText('Contributeur direct');

  await autreContexte.close();
});

test('un message publié en direct sur un projet privé ne parvient pas à l’anonyme', async ({
  page,
  browser,
}) => {
  await sInscrire(page, 'Porteuse discrète');
  const projetPublicId = await creerProjet(page, 'actif');
  const projetPriveId = await creerProjet(page, 'brouillon');

  // Le visiteur anonyme écoute le canal public.
  const contexteAnonyme = await browser.newContext();
  const anonyme = await contexteAnonyme.newPage();
  await anonyme.goto(`/projets/${projetPublicId}/discussions`);
  await expect(anonyme.getByTestId('fil-connexion')).toHaveAttribute('data-connecte', 'true');

  // La porteuse écrit dans son projet privé, puis dans le canal public.
  await page.goto(`/projets/${projetPriveId}/discussions`);
  await expect(page.getByTestId('fil-connexion')).toHaveAttribute('data-connecte', 'true');
  await page.getByLabel('Votre message').fill('Ceci ne doit pas sortir.');
  await page.getByTestId('envoyer-message').click();
  await expect(page.getByTestId('fil-messages')).toContainText('Ceci ne doit pas sortir.');

  await page.goto(`/projets/${projetPublicId}/discussions`);
  await page.getByLabel('Votre message').fill('Ceci est public.');
  await page.getByTestId('envoyer-message').click();

  // Le second message sert de repère : s'il arrive et que le premier n'est
  // toujours pas là, l'absence n'est pas un simple retard de diffusion.
  await expect(anonyme.getByTestId('fil-messages')).toContainText('Ceci est public.');
  await expect(anonyme.getByTestId('fil-messages')).not.toContainText('Ceci ne doit pas sortir.');

  await contexteAnonyme.close();
});

test('un message vide est refusé', async ({ page }) => {
  await sInscrire(page, 'Porteuse silencieuse');
  const projetId = await creerProjet(page, 'actif');

  await page.goto(`/projets/${projetId}/discussions`);
  await page.getByTestId('envoyer-message').click();

  await expect(page.getByTestId('message-erreur')).toContainText('Écrivez quelque chose');
  await expect(page.getByTestId('fil-vide')).toBeVisible();
});
