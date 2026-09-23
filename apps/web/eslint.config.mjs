import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettierConfig from 'eslint-config-prettier';

/**
 * ESLint pour `apps/web` : préréglages Next.js, complétés par les conventions
 * de la section 19 du cahier des charges. Les règles communes au monorepo sont
 * dans `eslint.config.base.mjs` à la racine ; elles sont reprises ici
 * explicitement pour éviter d'enregistrer deux fois le plugin TypeScript que
 * `eslint-config-next/typescript` fournit déjà.
 */
const eslintConfig = defineConfig([
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'supabase/.temp/**']),
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },
  prettierConfig,
]);

export default eslintConfig;
