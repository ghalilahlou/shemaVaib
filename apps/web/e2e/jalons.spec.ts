import { expect, test, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../lib/supabase/database.types';

/**
 * SV-009 — jalons et roadmap vus depuis le navigateur.
 *
 * La santé dépendant du temps écoulé, les tickets datés sont insérés
 * directement : passer par l'interface ne permettrait pas de simuler deux
 * semaines d'inactivité.
 */

const MOT_DE_PASSE = 'MotDePasseDeTest12345';

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
  const email = `jalons-${suffixe()}@schemavibe.test`;

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

async function creerProjetActif(page: Page): Promise<string> {
  const nom = `Projet roadmap ${suffixe()}`;

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

/** Insère un ticket rattaché à un jalon, daté de N jours dans le passé. */
async function insererTicketDate(options: {
  projetId: string;
  jalonId: string;
  titre: string;
  jours: number;
  statut?: 'ouvert' | 'fusionne';
}): Promise<void> {
  const date = new Date(Date.now() - options.jours * 86_400_000).toISOString();

  const { error } = await admin.from('tickets').insert({
    projet_id: options.projetId,
    jalon_id: options.jalonId,
    titre: options.titre,
    contexte: 'Un contexte suffisant.',
    criteres_acceptation: 'Des critères explicites.',
    critere_test: 'Un critère de test explicite.',
    complexite: 'S',
    statut: options.statut ?? 'ouvert',
    cree_le: date,
    maj_le: date,
  });

  if (error) {
    throw new Error(`Insertion du ticket daté impossible : ${error.message}`);
  }
}

/** Rend l'identifiant du jalon dont le thème est donné, pour ce projet. */
async function idDuJalon(projetId: string, theme: string): Promise<string> {
  const { data } = await admin
    .from('milestones')
    .select('id')
    .eq('projet_id', projetId)
    .eq('theme', theme)
    .single();

  return data!.id;
}

test('le porteur crée un jalon, qui apparaît à jour et vide', async ({ page }) => {
  await sInscrire(page, 'Porteuse roadmap');
  const projetId = await creerProjetActif(page);

  await page.getByTestId('lien-jalons').click();
  await expect(page).toHaveURL(`/projets/${projetId}/jalons`);
  await expect(page.getByTestId('jalons-vide')).toBeVisible();

  await page.getByLabel('Thème').fill('Sécurisation');
  await page.getByTestId('creer-jalon').click();

  await expect(page.getByTestId('jalon-succes')).toBeVisible();
  await expect(page.getByTestId('jalons-liste')).toContainText('Sécurisation');
  await expect(page.getByTestId('jalon-progression')).toHaveText('0 %');
  await expect(page.getByTestId('jalon-sante')).toHaveText('À jour');
});

test('la progression reflète les tickets achevés', async ({ page }) => {
  await sInscrire(page, 'Porteuse progression');
  const projetId = await creerProjetActif(page);

  await page.goto(`/projets/${projetId}/jalons`);
  await page.getByLabel('Thème').fill('Stabilisation');
  await page.getByTestId('creer-jalon').click();
  await expect(page.getByTestId('jalon-succes')).toBeVisible();

  const jalonId = await idDuJalon(projetId, 'Stabilisation');
  await insererTicketDate({ projetId, jalonId, titre: 'Fait', jours: 1, statut: 'fusionne' });
  await insererTicketDate({ projetId, jalonId, titre: 'À faire', jours: 1 });

  await page.reload();

  await expect(page.getByTestId('jalon-progression')).toHaveText('50 %');
  await expect(page.getByTestId('jalons-liste')).toContainText('1 sur 2 tickets');
});

test('la santé se dégrade avec l’inactivité, sans qu’aucune écriture n’ait lieu', async ({
  page,
}) => {
  await sInscrire(page, 'Porteuse santé');
  const projetId = await creerProjetActif(page);

  await page.goto(`/projets/${projetId}/jalons`);
  await page.getByLabel('Thème').fill('Jalon délaissé');
  await page.getByTestId('creer-jalon').click();
  await expect(page.getByTestId('jalon-succes')).toBeVisible();

  const jalonId = await idDuJalon(projetId, 'Jalon délaissé');

  // Huit jours d'inactivité : à risque.
  await insererTicketDate({ projetId, jalonId, titre: 'Ticket en souffrance', jours: 8 });
  await page.reload();
  await expect(page.getByTestId('jalon-sante')).toHaveText('À risque');

  // Quinze jours : bloqué. Aucune écriture n'a eu lieu entre les deux — c'est
  // précisément ce qu'une colonne stockée n'aurait pas su faire.
  await admin.from('tickets').delete().eq('jalon_id', jalonId);
  await insererTicketDate({ projetId, jalonId, titre: 'Ticket abandonné', jours: 15 });
  await page.reload();
  await expect(page.getByTestId('jalon-sante')).toHaveText('Bloqué');
});

test('un visiteur anonyme voit la roadmap d’un projet public, sans formulaire', async ({
  page,
}) => {
  await sInscrire(page, 'Porteuse publique');
  const projetId = await creerProjetActif(page);

  await page.goto(`/projets/${projetId}/jalons`);
  await page.getByLabel('Thème').fill('Jalon public');
  await page.getByTestId('creer-jalon').click();
  await expect(page.getByTestId('jalon-succes')).toBeVisible();

  await page.context().clearCookies();
  await page.goto(`/projets/${projetId}/jalons`);

  await expect(page.getByTestId('jalons-liste')).toContainText('Jalon public');
  await expect(page.getByTestId('formulaire-jalon')).toHaveCount(0);
});

test('un tiers connecté ne peut pas créer de jalon sur le projet d’autrui', async ({
  page,
  browser,
}) => {
  await sInscrire(page, 'Porteuse gardienne');
  const projetId = await creerProjetActif(page);

  const autreContexte = await browser.newContext();
  const tiers = await autreContexte.newPage();
  await sInscrire(tiers, 'Tiers entreprenant');
  await tiers.goto(`/projets/${projetId}/jalons`);

  // La page reste consultable — le projet est public — mais sans formulaire.
  await expect(tiers.getByTestId('jalons-vide')).toBeVisible();
  await expect(tiers.getByTestId('formulaire-jalon')).toHaveCount(0);

  await autreContexte.close();
});

test('la roadmap d’un projet en brouillon est introuvable pour un anonyme', async ({ page }) => {
  await sInscrire(page, 'Porteuse discrète');

  const nom = `Projet discret ${suffixe()}`;
  await page.goto('/projets/nouveau');
  await page.getByLabel('Nom du projet').fill(nom);
  await page.getByRole('button', { name: 'Créer le projet' }).click();
  await expect(page.getByTestId('formulaire-succes')).toBeVisible();

  // L'identifiant est lu en base plutôt que déduit de l'URL : un clic qui
  // n'aurait pas navigué produirait un identifiant fantaisiste et ferait
  // échouer le test pour une raison sans rapport avec ce qu'il vérifie.
  const { data: projet } = await admin.from('projects').select('id').eq('nom', nom).single();
  const projetId = projet!.id;

  await page.goto(`/projets/${projetId}/jalons`);
  await expect(page.getByTestId('jalons-vide')).toBeVisible();

  await page.context().clearCookies();
  const reponse = await page.goto(`/projets/${projetId}/jalons`);
  expect(reponse?.status()).toBe(404);
});
