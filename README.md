# SchemaVibe

SchemaVibe transforme le vibe coding en un workflow collaboratif, traçable et gamifié : des
projets vivants exposent des tickets précis, résolus avec l'outil de vibe coding du choix de chacun,
en s'appuyant sur des patterns éprouvés et un contrôle qualité automatisé.

La vision, l'architecture, les conventions et le backlog font foi dans
[`docs/schemavibe-cahier-des-charges.md`](docs/schemavibe-cahier-des-charges.md). Ce README ne
couvre que l'installation et le démarrage.

## Prérequis

| Outil   | Version                             |
| ------- | ----------------------------------- |
| Node.js | ≥ 22 (voir `.nvmrc`)                |
| pnpm    | 9.15.9                              |
| Docker  | requis par la CLI Supabase en local |

## Installation

```bash
pnpm install
```

## Structure du monorepo

```
apps/web/            Application Next.js (App Router, TypeScript strict)
apps/mcp-server/     Serveur MCP SchemaVibe (Node/TS), déployé séparément
packages/shared-types/  Types et schémas Zod partagés
docs/                Cahier des charges et ADR
```

## Commandes

Exécutées à la racine, elles s'appliquent à l'ensemble des modules du workspace.

| Commande            | Effet                                                   |
| ------------------- | ------------------------------------------------------- |
| `pnpm build`        | Build de tous les modules                               |
| `pnpm lint`         | ESLint sur tous les modules (zéro avertissement toléré) |
| `pnpm typecheck`    | Vérification des types                                  |
| `pnpm test`         | Tests des modules qui en déclarent                      |
| `pnpm format`       | Formatage Prettier                                      |
| `pnpm format:check` | Vérification du formatage                               |

Le démarrage de l'application web et de sa base Supabase locale est décrit dans
[`apps/web/README.md`](apps/web/README.md).

## Intégration continue

`.github/workflows/ci.yml` exécute `format:check`, `lint`, `typecheck` et `build` à chaque push et
sur chaque pull request.

## Contribution

Une branche = un ticket = une pull request. Commits au format Conventional Commits préfixés par
l'ID du ticket (ex. `feat(SV-004): ajouter le CRUD tickets`). Les conventions complètes sont en
section 19 du cahier des charges.
