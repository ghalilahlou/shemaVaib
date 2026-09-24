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

- **SV-004** — CRUD Tickets : création, liste filtrable par statut et par projet, page de détail.
  La Definition of Ready (section 5.1) est arbitrée par `evaluerDefinitionOfReady`, unique écriture
  de la règle, et adossée à une contrainte Postgres. Un ticket incomplet s'enregistre en
  brouillon ; c'est la demande de publication qui échoue, en énumérant ce qui manque. Politiques
  RLS : un ticket hérite de la visibilité de son projet, et seul le porteur le crée ou le modifie.

- **SV-008** — Bibliothèque de patterns : les 8 patterns de la section 5.2 (nom, catégorie,
  principe, cas d'usage) sont posés par une migration idempotente plutôt que par `seed.sql`, afin
  d'exister dans tous les environnements et non seulement en local. Ils sont proposés à la
  sélection dans le formulaire de ticket, principe affiché sous chacun, et détaillés sur la page
  du ticket. Une base fraîche permet désormais de publier un ticket sans préparation préalable.

- **SV-005** — Réclamer un ticket : un ticket publié peut être réclamé par un utilisateur
  authentifié, puis relâché par son réclamant ou par le porteur du projet. La réclamation passe
  par une fonction de base de données en compare-and-swap plutôt que par un `UPDATE` : deux
  réclamations simultanées ne laissent passer que la première, et réclamer ne donne aucun droit
  de modification sur le ticket.

- **SV-006** — Soumission de solution : le réclamant courant d'un ticket y rattache une solution
  (lien du diff et de l'aperçu obligatoires, résumé libre facultatif), ce qui fait passer le ticket
  au statut « soumis ». Plusieurs soumissions successives sont possibles, conformément à la boucle
  Review-Refine, et l'historique survit au relâchement du ticket. La transition d'état sert de garde
  à l'insertion : aucune soumission ne peut être créée par qui ne tient pas le ticket.

- **SV-007** — Dashboard pulse : une page d'activité par projet, listant les changements de statut
  des tickets et les nouvelles soumissions du plus récent au plus ancien, mise à jour en direct par
  un canal Supabase Realtime sans aucun sondage. La Row Level Security filtre la diffusion comme la
  lecture : un visiteur anonyme ne reçoit rien d'un ticket ou d'un projet en brouillon, y compris
  pour un événement survenu pendant qu'il regarde.

- **SV-009** — Jalons et roadmap : CRUD des jalons, rattachement de tickets existants, dépendances
  explicites entre tickets avec refus des cycles. La progression et la santé (à jour, à risque,
  bloqué) sont calculées à la lecture par la vue `jalons_avec_sante`, selon la définition
  opérationnelle de la section 11. Un jalon hérite de la visibilité de son projet.

- **SV-010** — Messagerie : canal par projet et fil par ticket, mis à jour en direct. Un message
  suit la visibilité de ce qui le porte ; tout utilisateur authentifié voyant la discussion peut y
  écrire, et sous son seul nom. Un message envoyé ne peut être ni modifié ni supprimé.

- **SV-011** — Serveur MCP, outil `scan_repo` : analyse locale d'un dépôt (densité de commits
  récents, présence de tests, TODO non résolus) rendue sous forme structurée, en lecture seule.
  Commande Claude Code `/schemavibe scan`. Test de contrat contre des dépôts fixture et test de
  protocole à travers un client MCP réel.

- **SV-012** — Import du backlog de démarrage dans la plateforme (section 24, règle 6) : un script
  rejouable crée le projet SchemaVibe et y importe les douze tickets livrés, avec leur statut, leur
  complexité, leur pattern suggéré et leurs dépendances, plus deux tickets candidats ouverts. Les
  identifiants sont fixes : relancer l'import met à jour les mêmes lignes sans détacher ce qui leur
  est rattaché.

### Corrigé

- **SV-002** — `users.vibe_score` passe de `text` à `numeric(5,2)` sur une échelle de 0 à 100,
  `NULL` tant qu'aucun calcul n'a eu lieu. Appliqué par une migration corrective ; la migration
  initiale reste inchangée.
