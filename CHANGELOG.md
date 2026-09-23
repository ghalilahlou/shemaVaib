# Changelog

Toutes les modifications livrées sont consignées ici, une entrée par ticket fusionné
(section 23 du cahier des charges). Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).

## [Non publié]

### Ajouté

- **SV-000** — Initialisation du projet : monorepo pnpm workspaces (`apps/web`,
  `apps/mcp-server`, `packages/shared-types`), application Next.js en App Router avec TypeScript
  strict, CLI Supabase configurée en local, ESLint + Prettier alignés sur les conventions de la
  section 19, et CI GitHub Actions exécutant format, lint, typecheck et build.
- **SV-002** — Schéma de données initial : migration Supabase créant les 7 entités de la
  section 9 (users, projects, milestones, tickets, submissions, messages, patterns) et la table de
  liaison `ticket_patterns`. La base porte elle-même la Definition of Ready, l'exclusivité du
  contexte d'un message, la cohérence jalon/projet et l'horodatage. Row Level Security activée sur
  toutes les tables. Schémas Zod partagés dans `packages/shared-types`, types TypeScript générés
  depuis la base, et harnais de test Vitest (unitaire et intégration).

### Corrigé

- **SV-002** — `users.vibe_score` passe de `text` à `numeric(5,2)` sur une échelle de 0 à 100,
  `NULL` tant qu'aucun calcul n'a eu lieu. Appliqué par une migration corrective ; la migration
  initiale reste inchangée.
