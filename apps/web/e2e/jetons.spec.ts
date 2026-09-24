import { expect, test, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { CHEMIN_SESSION_MCP, sessionMcpSchema } from '@schemavibe/shared-types';
import type { Database } from '../lib/supabase/database.types';

/**
 * SV-014 — parcours end-to-end des jetons d'accès.
 *
 * Ce que les tests d'intégration ne peuvent pas voir : que le secret s'affiche
 * réellement dans la page, une seule fois, et que le jeton ainsi obtenu — celui
 * qu'une personne copierait dans la configuration de son éditeur — ouvre bien
 * une session auprès de la plateforme servie.
 */

const MOT_DE_PASSE = 'MotDePasseDeTest12345';

let admin: SupabaseClient<Database>;
const comptes: string[] = [];

function suffixe(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

test.beforeAll(() => {
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
});

test.afterAll(async () => {
  for (const compte of comptes) {
    await admin.auth.admin.deleteUser(compte);
  }
});

async function sInscrire(page: Page, nom: string): Promise<void> {
  const email = `jetons-${suffixe()}@schemavibe.test`;

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

/** Crée un jeton depuis la page et rend le secret affiché. */
async function creerJeton(page: Page, libelle: string): Promise<string> {
  await page.goto('/parametres/jetons');
  await page.getByLabel('Nom du jeton').fill(libelle);
  await page.getByTestId('creer-jeton').click();

  const bloc = page.getByTestId('jeton-secret');
  await expect(bloc).toBeVisible();

  const secret = await bloc.locator('code').innerText();

  expect(secret.startsWith('svb_')).toBe(true);

  return secret;
}

test('un visiteur anonyme est renvoyé vers la connexion', async ({ page }) => {
  await page.goto('/parametres/jetons');

  await expect(page).toHaveURL(/\/connexion/);
});

test('le secret s’affiche une fois, puis plus jamais', async ({ page }) => {
  await sInscrire(page, 'Porteuse de jetons e2e');

  const libelle = `Poste ${suffixe()}`;
  await creerJeton(page, libelle);

  // Revisiter la page, et non la recharger : recharger rejouerait le POST de la
  // Server Action, donc créerait un second jeton. C'est le parcours réel qu'on
  // veut décrire — on quitte la page, on y revient.
  await page.goto('/projets');
  await page.goto('/parametres/jetons');

  // Le jeton reste listé — c'est son secret qui a disparu, pas lui.
  await expect(page.getByTestId('liste-jetons')).toContainText(libelle);
  await expect(page.getByTestId('jeton-secret')).toHaveCount(0);
});

test('le jeton affiché ouvre une session auprès de la plateforme', async ({ page, request }) => {
  await sInscrire(page, 'Porteuse branchée');

  const secret = await creerJeton(page, `Éditeur ${suffixe()}`);

  const reponse = await request.post(CHEMIN_SESSION_MCP, {
    headers: { authorization: `Bearer ${secret}` },
  });

  expect(reponse.status()).toBe(200);
  expect(sessionMcpSchema.safeParse(await reponse.json()).success).toBe(true);
});

test('la révocation depuis la page ferme réellement l’accès', async ({ page, request }) => {
  await sInscrire(page, 'Porteuse révoquante');

  const secret = await creerJeton(page, `À révoquer ${suffixe()}`);

  // Prouver d'abord que l'accès existait : sans cela, le refus qui suit ne
  // dirait rien.
  const avant = await request.post(CHEMIN_SESSION_MCP, {
    headers: { authorization: `Bearer ${secret}` },
  });
  expect(avant.status()).toBe(200);

  await page.goto('/parametres/jetons');
  await page.getByTestId('revoquer-jeton').first().click();
  await expect(page.getByTestId('jeton').first()).toHaveAttribute('data-revoque', 'oui');

  const apres = await request.post(CHEMIN_SESSION_MCP, {
    headers: { authorization: `Bearer ${secret}` },
  });

  expect(apres.status()).toBe(401);
});
