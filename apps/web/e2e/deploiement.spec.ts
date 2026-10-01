import { expect, test } from '@playwright/test';
import { EN_TETES_DE_SECURITE } from '../next.config';

/**
 * SV-022 — les en-têtes de sécurité sont réellement servis par le build de
 * production, et pas seulement déclarés dans la configuration.
 */

for (const chemin of ['/', '/connexion', '/api/mcp/session']) {
  test(`${chemin} porte les en-têtes de sécurité`, async ({ request }) => {
    const reponse = await request.fetch(chemin, {
      method: chemin.startsWith('/api') ? 'POST' : 'GET',
    });
    const enTetes = reponse.headers();

    for (const { key, value } of EN_TETES_DE_SECURITE) {
      expect(enTetes[key.toLowerCase()], key).toBe(value);
    }

    expect(enTetes['x-powered-by']).toBeUndefined();
  });
}
