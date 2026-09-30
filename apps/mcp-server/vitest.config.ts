import { defineConfig } from 'vitest/config';

/**
 * Tests de contrat du serveur MCP (section 21).
 *
 * Ils créent de vrais dépôts temporaires et lancent git dessus, et les outils
 * d'écriture visent la Supabase locale : les chronos sont donc plus généreux
 * qu'un test unitaire ordinaire, et les fichiers tournent en série parce qu'ils
 * partagent une seule base.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/environnement.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
