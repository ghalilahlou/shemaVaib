import type { TicketComplexite, TicketStatut } from '@schemavibe/shared-types';

/**
 * Le backlog de la plateforme, amorcé par la section 22 du cahier des charges.
 *
 * Les douze premiers tickets sont la transcription du backlog de démarrage. Les
 * suivants sont ouverts ici et non dans le cahier des charges, conformément à la
 * règle 6 de la section 24 : ce fichier est la source rejouable qui alimente la
 * plateforme, et tant qu'aucune instance durable n'existe — le projet distant
 * relève d'un chantier à venir — c'est le seul support qui survive à un
 * `supabase db reset`.
 *
 * La section 24, règle 6, prévoyait qu'une fois la base en place, ce backlog
 * soit importé dans la plateforme et que le tableau de suivi du cahier des
 * charges devienne une archive figée. C'est ce que ces données permettent.
 *
 * Les identifiants sont **fixes et écrits en dur**, et non tirés au hasard à
 * l'import : c'est ce qui rend l'opération rejouable. Un import relancé met à
 * jour les mêmes lignes au lieu d'en créer de nouvelles, et les liens déjà
 * établis — patterns, messages, soumissions — survivent.
 *
 * Les contextes et critères ci-dessous ne sont pas une reconstitution
 * optimiste : ils décrivent ce qui a réellement été livré et vérifié, ticket par
 * ticket. Le critère de test reprend celui qui a effectivement servi à clore le
 * ticket.
 */

export interface TicketDuBacklog {
  /** Identifiant fixe, gage d'idempotence de l'import. */
  id: string;
  /** Référence humaine, telle qu'elle apparaît en section 22. */
  reference: string;
  titre: string;
  contexte: string;
  criteres_acceptation: string;
  critere_test: string;
  complexite: TicketComplexite;
  statut: TicketStatut;
  /** Nom du pattern suggéré, tel qu'il figure dans la bibliothèque (section 5.2). */
  pattern: string;
  /** Références des tickets qui bloquent celui-ci (colonne « Dépend de »). */
  depend_de: string[];
}

/** Nom du projet créé par l'import. */
export const NOM_PROJET = 'SchemaVibe' as const;

/** Identifiant fixe du projet, pour la même raison que celui des tickets. */
export const ID_PROJET = '5c8e0a1a-0000-4000-8000-000000000001' as const;

function identifiant(rang: number): string {
  return `5c8e0a1a-0000-4000-8000-1000000000${rang.toString().padStart(2, '0')}`;
}

export const BACKLOG_INITIAL: TicketDuBacklog[] = [
  {
    id: identifiant(0),
    reference: 'SV-000',
    titre: 'SV-000 — Initialisation du projet',
    contexte:
      'Poser les fondations techniques avant tout développement fonctionnel : rien ne peut être construit ni vérifié tant que la chaîne de build et de test n’existe pas.',
    criteres_acceptation:
      'Monorepo pnpm workspaces (apps/web, apps/mcp-server, packages/shared-types). Next.js en App Router avec TypeScript strict. CLI Supabase configurée en local. ESLint et Prettier alignés sur la section 19. CI GitHub Actions à chaque push.',
    critere_test: 'pnpm build et pnpm lint passent sans erreur sur un dépôt fraîchement cloné.',
    complexite: 'S',
    statut: 'fusionne',
    pattern: 'Spec-First',
    depend_de: [],
  },
  {
    id: identifiant(1),
    reference: 'SV-001',
    titre: 'SV-001 — Authentification',
    contexte:
      'Sans identité, aucune règle d’accès n’a de sens : la création de projet livrée en SV-003 refusait proprement faute de session.',
    criteres_acceptation:
      'Inscription et connexion par e-mail et mot de passe, lien de connexion à usage unique, et chemin OAuth GitHub. Le profil public est créé par la base à l’inscription, quel que soit le chemin emprunté. Mot de passe d’au moins 12 caractères, et messages d’erreur qui ne révèlent pas l’existence d’un compte.',
    critere_test:
      'Le refus de création de projet se transforme en succès dès qu’une session valide existe ; les trois identités — anonyme, porteur, tiers — sont couvertes en intégration et en end-to-end.',
    complexite: 'M',
    statut: 'fusionne',
    pattern: 'Guardrail Prompting',
    depend_de: ['SV-000'],
  },
  {
    id: identifiant(2),
    reference: 'SV-002',
    titre: 'SV-002 — Schéma de données initial',
    contexte:
      'Traduire le modèle de données logique de la section 9 en schéma réel, et y inscrire les règles métier plutôt que de les confier au seul code applicatif.',
    criteres_acceptation:
      'Les 7 entités de la section 9 et la table de liaison ticket_patterns. Definition of Ready portée par une contrainte. Un message rattaché à un projet ou à un ticket, jamais aux deux. Row Level Security activée sur toutes les tables.',
    critere_test:
      'Tests d’intégration contre l’instance Supabase locale : les entités existent, les contraintes refusent ce qu’elles doivent refuser, et aucune table n’est exposée par accident.',
    complexite: 'M',
    statut: 'fusionne',
    pattern: 'Spec-First',
    depend_de: ['SV-000'],
  },
  {
    id: identifiant(3),
    reference: 'SV-003',
    titre: 'SV-003 — CRUD Projets',
    contexte:
      'Première feature métier complète, et première mise à l’épreuve de l’architecture en couches de la section 18.',
    criteres_acceptation:
      'Créer, lister et consulter un projet. Liste filtrable par statut. Un projet sorti du brouillon est visible de tous ; un brouillon reste privé, et son existence n’est pas révélée.',
    critere_test:
      'Les fonctions du repository sont exercées sous trois identités successives, ce qui met à l’épreuve les politiques RLS elles-mêmes et pas seulement les requêtes.',
    complexite: 'M',
    statut: 'fusionne',
    pattern: 'Modular Prompting',
    depend_de: ['SV-002'],
  },
  {
    id: identifiant(4),
    reference: 'SV-004',
    titre: 'SV-004 — CRUD Tickets',
    contexte:
      'Permettre de créer, lister et consulter un ticket, avec la Definition of Ready de la section 5.1 appliquée et non seulement énoncée.',
    criteres_acceptation:
      'Formulaire portant les six éléments de la Definition of Ready. Un ticket incomplet s’enregistre en brouillon ; c’est la demande de publication qui échoue, en énumérant ce qui manque. Liste filtrable par statut et par projet, page de détail complète.',
    critere_test:
      'Un test d’intégration vérifie qu’un ticket incomplet reste bloqué en brouillon, à la création comme à la mise à jour ; un parcours end-to-end couvre la création complète.',
    complexite: 'M',
    statut: 'fusionne',
    pattern: 'Modular Prompting',
    depend_de: ['SV-002', 'SV-003'],
  },
  {
    id: identifiant(5),
    reference: 'SV-005',
    titre: 'SV-005 — Réclamer un ticket',
    contexte:
      'Un contributeur doit pouvoir s’attribuer un ticket ouvert, et un ticket abandonné ne doit pas rester bloqué indéfiniment.',
    criteres_acceptation:
      'Seul un ticket publié et visible est réclamable, par un utilisateur authentifié, une seule fois. Le réclamant ou le porteur du projet peut le relâcher. Réclamer ne donne aucun droit de modification sur le ticket.',
    critere_test:
      'Deux réclamations simultanées ne laissent passer que la première, vérifié par la négative : avec une version sans condition d’état, les deux aboutissent et les tests tombent.',
    complexite: 'S',
    statut: 'fusionne',
    pattern: 'Test-Gated Iteration',
    depend_de: ['SV-004'],
  },
  {
    id: identifiant(6),
    reference: 'SV-006',
    titre: 'SV-006 — Soumission de solution',
    contexte:
      'Le réclamant d’un ticket doit pouvoir y rattacher son travail : un lien vers le diff, un aperçu live, et un résumé de ce qui a été fait.',
    criteres_acceptation:
      'Lien du diff et de l’aperçu obligatoires, résumé libre facultatif. La soumission fait passer le ticket au statut « soumis ». Plusieurs soumissions successives sont possibles, la boucle Review-Refine supposant qu’on repasse. Le résultat qualité reste en attente, faute de porte automatisée.',
    critere_test:
      'Aucune soumission ne peut être créée par qui ne tient pas le ticket à cet instant, vérifié par la négative sur une version sans garde.',
    complexite: 'M',
    statut: 'fusionne',
    pattern: 'Review-Refine Loop',
    depend_de: ['SV-005'],
  },
  {
    id: identifiant(7),
    reference: 'SV-007',
    titre: 'SV-007 — Dashboard pulse',
    contexte:
      'Rendre un projet visible et vivant (section 5.4) : montrer son activité au fil de l’eau plutôt qu’au rechargement.',
    criteres_acceptation:
      'Une page d’activité par projet, listant les changements de statut des tickets et les nouvelles soumissions, du plus récent au plus ancien, mise à jour par un canal Supabase Realtime sans aucun sondage.',
    critere_test:
      'Un visiteur anonyme ne reçoit rien d’un ticket ou d’un projet en brouillon, y compris pour un événement survenu pendant qu’il écoute — et le canal est amorcé avant toute conclusion négative.',
    complexite: 'L',
    statut: 'fusionne',
    pattern: 'Modular Prompting',
    depend_de: ['SV-004', 'SV-006'],
  },
  {
    id: identifiant(8),
    reference: 'SV-008',
    titre: 'SV-008 — Bibliothèque de patterns',
    contexte:
      'La Definition of Ready exige au moins un pattern suggéré : sans référentiel, aucun ticket n’est publiable sur une base fraîche.',
    criteres_acceptation:
      'Les patterns de la section 5.2 avec leur catégorie, leur principe et leur cas d’usage, posés par une migration idempotente afin d’exister dans tous les environnements. Sélection possible depuis le formulaire de ticket, principe affiché sous chacun.',
    critere_test:
      'Un ticket est publié en s’appuyant sur la bibliothèque, sans qu’aucun pattern n’ait été créé par le test lui-même.',
    complexite: 'S',
    statut: 'fusionne',
    pattern: 'Spec-First',
    depend_de: ['SV-004'],
  },
  {
    id: identifiant(9),
    reference: 'SV-009',
    titre: 'SV-009 — Jalons et roadmap',
    contexte:
      'Regrouper les tickets par thème (section 11), avec des dépendances explicites et une santé qui se dégrade d’elle-même quand rien n’avance.',
    criteres_acceptation:
      'CRUD des jalons, rattachement de tickets existants, dépendances explicites entre tickets avec refus des cycles. Progression et santé calculées à la lecture par une vue, et non stockées : la santé dépend du temps écoulé, une colonne deviendrait fausse sans qu’aucune écriture n’ait lieu.',
    critere_test:
      'Chaque seuil de santé est franchi dans les deux sens, sur des tickets datés à leur création — un horodatage ne se recule pas après coup, les triggers l’annulent.',
    complexite: 'L',
    statut: 'fusionne',
    pattern: 'Multi-Agent Orchestration',
    depend_de: ['SV-004'],
  },
  {
    id: identifiant(10),
    reference: 'SV-010',
    titre: 'SV-010 — Messagerie',
    contexte:
      'Un seul système, deux contextes (section 12) : le canal général d’un projet et le fil dédié d’un ticket.',
    criteres_acceptation:
      'Un message suit la visibilité de ce qui le porte. Tout utilisateur authentifié voyant la discussion peut y écrire, et sous son seul nom. Les fils avancent en direct. Un message envoyé ne peut être ni modifié ni supprimé.',
    critere_test:
      'Un message publié dans un projet privé pendant qu’un visiteur anonyme regarde le canal public ne lui parvient jamais, un message public servant de repère pour distinguer l’absence du retard.',
    complexite: 'M',
    statut: 'fusionne',
    pattern: 'Modular Prompting',
    depend_de: ['SV-003', 'SV-004'],
  },
  {
    id: identifiant(11),
    reference: 'SV-011',
    titre: 'SV-011 — Serveur MCP : outil scan_repo (v1)',
    contexte:
      'Premier outil du serveur MCP (section 8) : permettre à Claude Code de scanner un dépôt local et d’en rendre un constat.',
    criteres_acceptation:
      'Outil conforme au SDK @modelcontextprotocol/sdk. Analyse de la densité de commits récents, de la présence de tests et des TODO non résolus. Résultat structuré, jamais poussé automatiquement. Commande Claude Code /schemavibe scan fonctionnelle en local.',
    critere_test:
      'Un test de contrat vérifie le schéma de sortie contre des dépôts fixture, et un test de protocole appelle l’outil à travers un vrai client MCP — un outil peut produire le bon résultat et rester inutilisable.',
    complexite: 'L',
    statut: 'fusionne',
    pattern: 'Guardrail Prompting',
    depend_de: ['SV-004'],
  },
  {
    id: identifiant(12),
    reference: 'SV-012',
    titre: 'SV-012 — Import du backlog de démarrage dans la plateforme',
    contexte:
      'La section 24, règle 6, prévoit qu’une fois la base en place, le backlog de démarrage soit importé dans la plateforme et que le tableau de suivi du cahier des charges devienne une archive figée. Tant que ce n’est pas fait, les outils MCP à venir n’auront aucun ticket réel à manipuler.',
    criteres_acceptation:
      'Un script rejouable importe les tickets du backlog de démarrage sous un projet dédié, avec leur statut, leur complexité, leur pattern suggéré et leurs dépendances. Un import relancé met à jour les mêmes lignes plutôt que d’en créer de nouvelles.',
    critere_test:
      'Un test d’intégration importe deux fois de suite et constate que le nombre de tickets, de liens de pattern et de dépendances est inchangé, et que les identifiants n’ont pas bougé.',
    complexite: 'S',
    statut: 'fusionne',
    pattern: 'Spec-First',
    depend_de: ['SV-004'],
  },
  {
    id: identifiant(13),
    reference: 'SV-013',
    titre: 'SV-013 — Exclure les fixtures de test du comptage TODO de scan_repo',
    contexte:
      'Passé sur son propre dépôt, scan_repo relève six marqueurs TODO dont cinq viennent des fixtures de ses propres tests (apps/mcp-server/tests/). Ce n’est pas de la dette technique, c’est du bruit produit par le détecteur lui-même — et le même bruit apparaîtra sur tout dépôt dont les tests contiennent des marqueurs délibérés.',
    criteres_acceptation:
      'Les fichiers de test sont écartés du comptage des TODO, selon les mêmes motifs que ceux déjà utilisés pour détecter la présence de tests. Le nombre de fichiers de test continue d’être rapporté ; seuls leurs TODO cessent de compter comme de la dette.',
    critere_test:
      'Un dépôt fixture dont le seul marqueur vit dans un fichier de test rend un comptage de zéro, tandis qu’un marqueur dans le code source reste compté.',
    complexite: 'S',
    statut: 'ouvert',
    pattern: 'Regression Radius',
    depend_de: ['SV-011'],
  },
  {
    id: identifiant(14),
    reference: 'SV-014',
    titre: 'SV-014 — Authentification du serveur MCP',
    contexte:
      'Les trois outils d’écriture de la section 8 — create_tickets, claim_ticket, submit_solution — doivent agir au nom de quelqu’un : toute l’autorisation de la plateforme repose sur la Row Level Security et sur auth.uid(). Confier une clé de service au serveur MCP contournerait d’un coup toutes les politiques écrites depuis SV-003 ; il lui faut donc une identité, et pas des privilèges.',
    criteres_acceptation:
      'Un jeton personnel est créé depuis la plateforme, montré une seule fois et conservé sous forme d’empreinte. Le serveur MCP l’échange contre une session courte portant l’identité de son émetteur, et n’obtient jamais plus de droits que cette personne. Le jeton est révocable, et sa révocation ferme l’accès.',
    critere_test:
      'Un jeton émis par une personne ouvre une session qui ne voit que ce que cette personne voit, puis, une fois révoqué, se voit refuser l’échange — la lecture réussie avant révocation prouvant que le refus n’est pas un faux négatif.',
    complexite: 'M',
    statut: 'ouvert',
    pattern: 'Guardrail Prompting',
    depend_de: ['SV-011'],
  },
];
