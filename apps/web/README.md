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

| Variable                        | Rôle                                                        |
| ------------------------------- | ----------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | URL de l'API Supabase                                       |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clé publique, utilisable côté navigateur                    |
| `SUPABASE_SERVICE_ROLE_KEY`     | Clé privilégiée, jamais exposée au client                   |
| `NEXT_PUBLIC_SITE_URL`          | Adresse publique du site, base des liens envoyés par e-mail |

En développement, `NEXT_PUBLIC_SITE_URL` retombe sur `http://127.0.0.1:3000`. En production, elle
est obligatoire (voir [Déploiement](#déploiement)).

## Développement

```bash
pnpm dev     # serveur de développement sur http://localhost:3000
pnpm build   # build de production
pnpm lint
pnpm typecheck
```

## Importer le backlog dans la plateforme

Le backlog de démarrage vit désormais dans la base, et non plus seulement dans le cahier des
charges (section 24, règle 6). L'import vise l'instance désignée par `.env.local`.

```bash
pnpm import:backlog -- porteur@exemple.test
```

Le compte indiqué doit déjà exister — inscrivez-vous sur `/inscription` d'abord. Il devient
propriétaire du projet. L'opération est rejouable : les identifiants des tickets sont fixes, un
second import met à jour les mêmes lignes plutôt que d'en créer de nouvelles.

## Déploiement

### Ce que le serveur vérifie au démarrage

En production, `instrumentation.ts` contrôle la configuration avant la première requête. S'il
manque une variable, si `NEXT_PUBLIC_SITE_URL` est en `http` hors de la machine locale ou porte un
chemin, le serveur journalise la liste des problèmes et répond 500 à toute requête. Un déploiement
incomplet se voit tout de suite, au lieu d'envoyer des liens de connexion vers `127.0.0.1`.

Les variables `NEXT_PUBLIC_*` sont **figées au build** : définissez-les avant de construire, pas
seulement au démarrage.

### Projet Supabase distant

1. **Migrations.** Toutes celles de `supabase/migrations/`, dans l'ordre (`supabase link` puis
   `supabase db push`, ou le MCP Supabase). `list_migrations` doit en compter autant que le
   dossier.
2. **Authentification** (tableau de bord, Authentication) :
   - _Site URL_ : la valeur de `NEXT_PUBLIC_SITE_URL`.
   - _Redirect URLs_ : `https://<domaine>/auth/callback**`. Le joker couvre le paramètre
     `?next=…` qui ramène à la page demandée (SV-016).
   - _Confirm email_ activé. L'inscription demande alors de confirmer l'adresse au lieu
     d'ouvrir une session (SV-016).
   - _Secure password change_ activé : sans lui, une session volée suffit à changer le mot de
     passe (SV-021).
   - _SMTP_ personnalisé : l'envoi par défaut de Supabase est plafonné à quelques e-mails par
     heure, ce qui ne suffit pas aux liens magiques, confirmations et réinitialisations.
   - _GitHub_ (facultatif) : une OAuth App dont l'URL de rappel est
     `https://<ref>.supabase.co/auth/v1/callback`.
3. **Linter de sécurité.** Les avis restants doivent tous être des fonctions exécutables à
   dessein ; voir SV-017 dans le CHANGELOG.

### Application Next.js

Racine du projet : `apps/web`, dans un monorepo pnpm. Le build par défaut (`next build`) suffit. Il
compile au passage `packages/shared-types` (`pnpm -C ../.. run build:deps`) si l'hébergeur ne le
fait pas. Variables : les quatre du tableau ci-dessus, avec les valeurs du projet distant.

La plateforme sert les en-têtes de sécurité déclarés dans `next.config.ts` (`X-Frame-Options`,
`Strict-Transport-Security`…). `e2e/deploiement.spec.ts` vérifie qu'ils sont réellement émis par
le build de production.

### Mise en service

1. Inscrivez le compte qui portera le projet SchemaVibe, sur le site déployé.
2. Importez le backlog contre le projet distant. Les variables passées en ligne de commande
   priment sur `.env.local` :

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co \
   SUPABASE_SERVICE_ROLE_KEY=<clé de service> \
   pnpm import:backlog -- porteur@exemple.test
   ```

3. Pour le serveur MCP, chaque contributeur crée un jeton sur `/parametres/jetons` et définit
   `SCHEMAVIBE_URL` (l'adresse du site) et `SCHEMAVIBE_TOKEN`. Le serveur tourne en local, lancé
   par Claude Code ou Cursor : il n'a pas à être hébergé.

## Tests

Les tests d'intégration et end-to-end tournent contre l'instance Supabase locale : `pnpm db:start`
doit être en route.

```bash
pnpm test        # unitaires et intégration (Vitest)
pnpm test:e2e    # parcours end-to-end (Playwright)
pnpm test:e2e:ui # les mêmes, en mode interactif
```

Au premier lancement des tests end-to-end, installer le navigateur :
`pnpm exec playwright install chromium`.

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
