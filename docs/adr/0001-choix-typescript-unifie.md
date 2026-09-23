# 0001. Choix d'une stack TypeScript unifiée

Date : 2026-09-23
Statut : accepté

## Contexte

SchemaVibe se compose de trois modules : une application web (frontend et logique serveur), un
serveur MCP consommé directement par Claude Code et Cursor, et une couche de persistance. Trois
options étaient sur la table (section 17 du cahier des charges) : TypeScript de bout en bout
(Next.js + Supabase + serveur MCP Node), un backend Python/FastAPI avec un frontend séparé, ou un
monolithe Django.

Deux contraintes ont pesé plus que les autres. D'une part, le dashboard « pulse » (section 5.4)
repose sur Supabase Realtime, dont le client JavaScript est le plus complet. D'autre part, le
développement est très largement assisté par IA : chaque jeu de conventions supplémentaire
augmente mécaniquement le risque qu'un module dérive par rapport aux autres — la « dérive
architecturale » documentée en section 25.

## Décision

TypeScript sur l'ensemble du projet : Next.js (App Router, Server Actions) pour le web, Node.js
pour le serveur MCP avec le SDK officiel `@modelcontextprotocol/sdk`, Supabase comme couche de
persistance. Les types et schémas Zod communs vivent dans `packages/shared-types` et sont importés
par les deux applications.

## Conséquences

- Un seul jeu de conventions, un seul outillage (ESLint, Prettier, tsconfig partagé) sur tout le
  monorepo, et un seul environnement d'exécution à installer.
- Les types du domaine ne sont écrits qu'une fois et sont partagés entre le web et le serveur MCP,
  ce qui supprime une classe entière de désynchronisations entre les deux.
- Le SDK MCP officiel Node/TS étant le plus mature, le serveur MCP suit l'évolution du protocole
  sans couche d'adaptation.
- En contrepartie, tout traitement qui bénéficierait de l'écosystème Python (analyse de code,
  traitement de données) devra soit être réécrit en TypeScript, soit être isolé derrière un service
  séparé — ce qui réintroduirait le second langage que cette décision cherche à éviter.
