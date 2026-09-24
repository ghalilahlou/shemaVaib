---
description: Outils SchemaVibe. Usage : /schemavibe scan [chemin]
allowed-tools: mcp__schemavibe__scan_repo
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

## Autre sous-commande

Si `$ARGUMENTS` est vide ou ne commence pas par `scan`, indique que seule
`scan` existe pour l'instant, les outils `create_tickets`, `claim_ticket` et
`submit_solution` restant à construire.
