import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../lib/supabase/database.types';

/**
 * SV-008 — la bibliothèque de patterns vue depuis le navigateur.
 *
 * Ce fichier ne crée aucune donnée de référence : tout ce qu'il vérifie provient
 * de la migration. C'est la démonstration attendue — sur une base fraîche, le
 * formulaire de ticket construit en SV-004 propose des patterns, et la
 * Definition of Ready devient atteignable sans intervention préalable.
 */

const MOT_DE_PASSE = 'MotDePasseDeTest12345';

/** Les huit patterns de la section 5.2. */
const PATTERNS = [
  'Spec-First',
  'Modular Prompting',
  'Test-Gated Iteration',
  'Context Anchoring',
  'Review-Refine Loop',
  'Guardrail Prompting',
  'Multi-Agent Orchestration',
  'Regression Radius',
] as const;

let admin: SupabaseClient<Database>;
const comptes: string[] = [];

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

test('le formulaire de ticket propose les huit patterns de la section 5.2', async ({ page }) => {
  const suffixe = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `patterns-${suffixe}@schemavibe.test`;

  await page.goto('/inscription');
  await page.getByLabel('Nom').fill('Porteuse patterns');
  await page.getByLabel('Adresse e-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(MOT_DE_PASSE);
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page.getByTestId('session-utilisateur')).toHaveText('Porteuse patterns');

  const { data } = await admin.auth.admin.listUsers();
  const compte = data.users.find((utilisateur) => utilisateur.email === email);
  if (compte) comptes.push(compte.id);

  const nomProjet = `Projet patterns ${suffixe}`;
  await page.goto('/projets/nouveau');
  await page.getByLabel('Nom du projet').fill(nomProjet);
  await page.getByLabel('Statut').selectOption('actif');
  await page.getByRole('button', { name: 'Créer le projet' }).click();
  await expect(page.getByTestId('formulaire-succes')).toBeVisible();

  await page.goto('/projets');
  await page.getByRole('link', { name: nomProjet }).click();
  await page.getByTestId('nouveau-ticket').click();

  // Le message « bibliothèque vide » de SV-004 ne doit plus apparaître.
  await expect(page.getByTestId('patterns-vides')).toHaveCount(0);

  const liste = page.getByTestId('patterns-disponibles');
  await expect(liste).toBeVisible();

  for (const pattern of PATTERNS) {
    await expect(liste).toContainText(pattern);
  }

  // Le principe est affiché sous chaque pattern : le porteur choisit en
  // connaissance de cause, sans avoir à ouvrir le cahier des charges.
  await expect(liste).toContainText('Rédiger un mini cahier des charges avant de prompter');
  await expect(liste).toContainText('Contraintes de sécurité embarquées dans le prompt');
});
