# apps/web

Application Next.js de SchemaVibe (App Router, TypeScript strict) et emplacement des migrations
Supabase. Ce fichier ne couvre que ce qui est propre à ce module ; l'installation du monorepo est
décrite dans le [README racine](../../README.md).

## Base Supabase locale

Docker doit tourner. Depuis ce dossier :

```bash
pnpm db:start    # démarre la stack Supabase locale
pnpm db:status   # affiche les URL et les clés générées
pnpm db:reset    # rejoue les migrations puis charge supabase/seed.sql
pnpm db:stop     # arrête la stack
```

L'API locale écoute sur `http://127.0.0.1:54321`, le studio sur `http://127.0.0.1:54323`. Le serveur
MCP Supabase pour Claude Code est exposé sur `http://127.0.0.1:54321/mcp` (section 20 du cahier des
charges).

## Variables d'environnement

Copier `.env.example` en `.env.local`, puis y reporter les clés affichées par `pnpm db:status`.

| Variable                        | Rôle                                      |
| ------------------------------- | ----------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | URL de l'API Supabase                     |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clé publique, utilisable côté navigateur  |
| `SUPABASE_SERVICE_ROLE_KEY`     | Clé privilégiée, jamais exposée au client |

## Développement

```bash
pnpm dev     # serveur de développement sur http://localhost:3000
pnpm build   # build de production
pnpm lint
pnpm typecheck
```

## Organisation

```
app/             Routes (pages, layouts)
features/        Modules métier : components/ · actions/ · repository/ · schema.ts
components/ui/   Composants partagés (design system)
lib/             Client Supabase, helpers
supabase/        config.toml, migrations/, seed.sql
```

Règle stricte (section 18) : seule la couche `repository/` d'une feature appelle
`supabase.from(...)`. Aucun composant ni Server Action n'accède directement au client Supabase.
