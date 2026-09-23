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

- **SV-003** — CRUD Projets : création, liste filtrable par statut et page de détail. Feature
  `projects` organisée en couches (composants, Server Action, repository, schéma Zod) conformément
  à la section 18. Politiques Row Level Security : un projet sorti du brouillon est visible de
  tous, un brouillon reste privé, et seul le porteur crée, modifie ou supprime les siens. Clients
  Supabase de session et d'administration dans `lib/supabase/`. Tests d'intégration du repository
  sous trois identités (anonyme, porteur, tiers) et parcours end-to-end Playwright.

- **SV-001** — Authentification : inscription et connexion par e-mail et mot de passe, lien de
  connexion à usage unique (magic link) et bouton GitHub. Le profil `public.users` est créé par un
  trigger à l'inscription, quel que soit le chemin emprunté. Session rafraîchie par la couche
  `proxy`, en-tête affichant l'état de connexion, et redirection du formulaire de projet vers la
  page de connexion. Garde-fous : mot de passe d'au moins 12 caractères avec minuscule, majuscule
  et chiffre, messages d'erreur identiques que le compte existe ou non, et redirection de callback
  restreinte aux chemins internes.

### Corrigé

- **SV-002** — `users.vibe_score` passe de `text` à `numeric(5,2)` sur une échelle de 0 à 100,
  `NULL` tant qu'aucun calcul n'a eu lieu. Appliqué par une migration corrective ; la migration
  initiale reste inchangée.
