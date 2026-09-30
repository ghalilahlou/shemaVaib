import { expect, type APIRequestContext } from '@playwright/test';

/** Mailpit, le serveur mail de la stack Supabase locale. */
export const MAILPIT_URL = 'http://127.0.0.1:54324';

/**
 * Lien de vérification du dernier courriel reçu par cette adresse — magic link,
 * confirmation ou réinitialisation de mot de passe, qui passent tous par
 * `/auth/v1/verify`.
 *
 * Mailpit rend les messages du plus récent au plus ancien.
 */
export async function lienDuDernierCourriel(
  request: APIRequestContext,
  email: string,
): Promise<string> {
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

  return lien![0].replaceAll('&amp;', '&');
}
