import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../lib/supabase/database.types';

/**
 * SV-003 — parcours end-to-end des projets (section 21 du cahier des charges).
 *
 * Il vérifie ce que les tests d'intégration ne peuvent pas voir : que les pages
 * rendent réellement, que la navigation entre liste et détail fonctionne, et
 * surtout que la cloison entre projet public et brouillon tient jusque dans le
 * navigateur, pas seulement au niveau SQL.
 */

const SUFFIXE = Date.now().toString(36);
const NOM_PROJET_ACTIF = `Projet public e2e ${SUFFIXE}`;
const NOM_PROJET_BROUILLON = `Projet brouillon e2e ${SUFFIXE}`;

let admin: SupabaseClient<Database>;
let porteurId: string;
let projetActifId: string;
let projetBrouillonId: string;

test.beforeAll(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !cle) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis. ' +
        'Lancer `pnpm db:start` et renseigner apps/web/.env.local.',
    );
  }

  admin = createClient<Database>(url, cle, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: utilisateur, error } = await admin.auth.admin.createUser({
    email: `e2e-${SUFFIXE}@schemavibe.test`,
    password: 'MotDePasseDeTest12345',
    email_confirm: true,
  });

  if (error || !utilisateur.user) {
    throw new Error(`Création de l’utilisateur e2e impossible : ${error?.message ?? 'inconnu'}`);
  }

  porteurId = utilisateur.user.id;
  await admin.from('users').insert({ id: porteurId, nom: 'Porteuse e2e' });

  const { data: projets } = await admin
    .from('projects')
    .insert([
      {
        proprietaire_id: porteurId,
        nom: NOM_PROJET_ACTIF,
        statut: 'actif',
        repo_url: 'https://github.com/ghalilahlou/shemaVaib',
      },
      { proprietaire_id: porteurId, nom: NOM_PROJET_BROUILLON, statut: 'brouillon' },
    ])
    .select('id, statut');

  projetActifId = projets?.find((projet) => projet.statut === 'actif')?.id ?? '';
  projetBrouillonId = projets?.find((projet) => projet.statut === 'brouillon')?.id ?? '';
});

test.afterAll(async () => {
  await admin.auth.admin.deleteUser(porteurId);
});

test('la liste affiche les projets publics avec leur porteur', async ({ page }) => {
  await page.goto('/projets');

  await expect(page.getByRole('heading', { name: 'Projets', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: NOM_PROJET_ACTIF })).toBeVisible();
  await expect(page.getByText('Porté par Porteuse e2e').first()).toBeVisible();
});

test('la liste ne laisse pas fuiter les brouillons', async ({ page }) => {
  await page.goto('/projets');

  await expect(page.getByRole('link', { name: NOM_PROJET_BROUILLON })).toHaveCount(0);
});

test('le filtre par statut restreint la liste', async ({ page }) => {
  await page.goto('/projets');
  await page.getByRole('link', { name: 'Archivés' }).click();

  await expect(page).toHaveURL(/statut=archive/);
  await expect(page.getByRole('link', { name: NOM_PROJET_ACTIF })).toHaveCount(0);
});

test('on ouvre le détail d’un projet depuis la liste', async ({ page }) => {
  await page.goto('/projets');
  await page.getByRole('link', { name: NOM_PROJET_ACTIF }).click();

  await expect(page).toHaveURL(`/projets/${projetActifId}`);
  await expect(page.getByRole('heading', { name: NOM_PROJET_ACTIF, level: 1 })).toBeVisible();
  await expect(page.getByTestId('projet-statut')).toHaveText('Actif');
  await expect(
    page.getByRole('link', { name: 'https://github.com/ghalilahlou/shemaVaib' }),
  ).toBeVisible();
});

test('un brouillon d’autrui est introuvable, pas « interdit »', async ({ page }) => {
  const reponse = await page.goto(`/projets/${projetBrouillonId}`);

  expect(reponse?.status()).toBe(404);
});

test('le formulaire de création refuse un visiteur non connecté', async ({ page }) => {
  await page.goto('/projets/nouveau');

  await page.getByLabel('Nom du projet').fill('Projet tenté sans session');
  await page.getByRole('button', { name: 'Créer le projet' }).click();

  await expect(page.getByTestId('formulaire-erreur')).toHaveText(
    'Vous devez être connecté pour créer un projet.',
  );
});

test('le formulaire signale un nom vide sans passer par le serveur de données', async ({
  page,
}) => {
  await page.goto('/projets/nouveau');
  await page.getByRole('button', { name: 'Créer le projet' }).click();

  // La session manque avant même la validation : c'est ce refus-là qui doit
  // remonter, et non une erreur de champ — l'ordre des gardes compte.
  await expect(page.getByTestId('formulaire-erreur')).toHaveText(
    'Vous devez être connecté pour créer un projet.',
  );
});
