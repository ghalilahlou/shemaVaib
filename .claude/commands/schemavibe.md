---
description: Outils SchemaVibe. Usage : /schemavibe scan [chemin] · /schemavibe work <id>
allowed-tools: mcp__schemavibe__scan_repo, mcp__schemavibe__claim_ticket
---

Sous-commande demandée : `$ARGUMENTS`

## scan

Si la sous-commande est `scan`, appelle l'outil MCP `scan_repo` du serveur
`schemavibe` sur le chemin donné en second argument, ou sur le répertoire de
travail courant si aucun chemin n'est fourni.

Présente ensuite le constat ainsi :

1. Les signaux, tels que l'outil les formule, sans en ajouter ni en retrancher.
2. Les TODO relevés, avec leur fichier et leur ligne.
3. Une phrase rappelant qu'aucun ticket n'a été créé.

Tu peux proposer au porteur du projet ce que ces signaux suggèrent comme
tickets, mais **ne crée rien** : `scan_repo` observe, et la création passera par
`create_tickets`, qui exigera une confirmation explicite (section 8 du cahier
des charges). N'invente aucune mesure que l'outil n'a pas rendue.

## work

Si la sous-commande est `work`, le second argument est l'identifiant du ticket
(l'UUID qui figure dans l'adresse de sa page). S'il manque, demande-le et
n'appelle rien.

Appelle l'outil MCP `claim_ticket` avec cet identifiant. Taper la commande vaut
consentement à réclamer ce ticket-là, et lui seul : ne réclame jamais un autre
ticket de ta propre initiative.

Si l'outil refuse, rapporte son message tel quel et arrête-toi. Un refus pour
jeton ou adresse manquants se corrige en définissant `SCHEMAVIBE_URL` et
`SCHEMAVIBE_TOKEN` (jeton créé depuis `/parametres/jetons`) avant de relancer
Claude Code.

Si l'outil réussit :

1. Dis en une phrase au nom de qui le ticket est tenu, et s'il vient d'être
   réclamé ou si c'est une reprise.
2. Reprends le titre, les critères d'acceptation et le critère de test, sans les
   reformuler : ce sont eux qui décident si le ticket est terminé.
3. Signale les tickets bloquants non fusionnés, s'il y en a, avant toute chose.
4. Nomme les patterns suggérés et applique-les dans la suite du travail.
5. S'il y a des tentatives précédentes, lis leurs résumés pour ne pas refaire ce
   qui a échoué.
6. Propose un plan de travail court, puis attends le feu vert avant de modifier
   des fichiers.

Le ticket reste réclamé tant qu'il n'est pas relâché ou soumis : la soumission
passera par `/schemavibe submit`, pas encore disponible.

## Autre sous-commande

Si `$ARGUMENTS` est vide ou ne commence ni par `scan` ni par `work`, indique
que seules ces deux sous-commandes existent pour l'instant, les outils
`create_tickets` et `submit_solution` restant à construire.
