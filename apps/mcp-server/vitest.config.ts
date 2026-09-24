import { defineConfig } from 'vitest/config';

/**
 * Tests de contrat du serveur MCP (section 21).
 *
 * Ils créent de vrais dépôts temporaires et lancent git dessus : les chronos
 * sont donc plus généreux qu'un test unitaire ordinaire.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
