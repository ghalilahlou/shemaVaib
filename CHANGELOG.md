# Changelog

Toutes les modifications livrées sont consignées ici, une entrée par ticket fusionné
(section 23 du cahier des charges). Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).

## [Non publié]

### Ajouté

- **SV-000** — Initialisation du projet : monorepo pnpm workspaces (`apps/web`,
  `apps/mcp-server`, `packages/shared-types`), application Next.js en App Router avec TypeScript
  strict, CLI Supabase configurée en local, ESLint + Prettier alignés sur les conventions de la
  section 19, et CI GitHub Actions exécutant format, lint, typecheck et build.
