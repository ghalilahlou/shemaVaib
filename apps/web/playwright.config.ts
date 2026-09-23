import { config } from 'dotenv';
import { defineConfig, devices } from '@playwright/test';

// Mêmes variables que les tests d'intégration : URL et clés de la Supabase locale.
config({ path: '.env.local', quiet: true });

/**
 * Tests end-to-end (section 21 du cahier des charges).
 *
 * Ils tournent contre l'application réelle et l'instance Supabase locale :
 * `pnpm db:start` doit être en route. Playwright démarre lui-même le serveur
 * Next.js, et le réutilise s'il tourne déjà.
 */
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: BASE_URL,
    locale: 'fr-FR',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // `build:deps` d'abord : `apps/web` consomme `packages/shared-types` via son
    // `dist/`, qui n'existe pas sur un clone neuf.
    command: 'pnpm -C ../.. run build:deps && pnpm run build && pnpm run start',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
