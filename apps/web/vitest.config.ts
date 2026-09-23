import { defineConfig } from 'vitest/config';

/**
 * Les tests d'intégration tournent contre l'instance Supabase locale
 * (section 21 du cahier des charges) : ils supposent `pnpm db:start` puis
 * `pnpm db:reset`. Ils sont en série, parce qu'ils partagent une seule base.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup-integration.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
