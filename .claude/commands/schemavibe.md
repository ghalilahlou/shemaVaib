---
description: Outils SchemaVibe. Usage : /schemavibe scan [chemin] · /schemavibe work <id> · /schemavibe submit [id]
allowed-tools: mcp__schemavibe__scan_repo, mcp__schemavibe__create_tickets, mcp__schemavibe__claim_ticket, mcp__schemavibe__submit_solution
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
tickets. N'invente aucune mesure que l'outil n'a pas rendue.

S'il veut les créer, `scan_repo` n'y suffit pas : il observe. La création passe
par `create_tickets` et ne se fait **jamais sans confirmation explicite**
(section 8 du cahier des charges) :

1. Demande l'identifiant du projet cible, que la personne doit porter.
2. Rédige chaque ticket selon la Definition of Ready : contexte, critères
   d'acceptation vérifiables (jamais « améliorer X »), critère de test,
   complexité S/M/L, et au moins un pattern de la bibliothèque.
3. Appelle `create_tickets` **sans** `confirmer` et montre l'aperçu tel quel :
   ce qui serait publié, ce qui resterait en brouillon et pourquoi.
4. Seulement sur un accord clair, rappelle l'outil avec les mêmes arguments et
   `confirmer: true`. Toute modification demandée repart de l'étape 3.

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
passe par `/schemavibe submit`.

## submit

Si la sous-commande est `submit`, le ticket est celui donné en second argument,
ou à défaut celui pris avec `/schemavibe work` dans cette session. Si aucun des
deux n'existe, demande l'identifiant et n'appelle rien.

1. **Liens.** Il faut le lien du diff et celui de l'aperçu live. Si la branche
   a une pull request, `gh pr view --json url` donne le premier ; sinon,
   demande-les. N'invente jamais un lien.
2. **Tests.** Lance la commande de test du projet et retiens la commande, son
   issue et la fin de sa sortie. Si aucun test n'a pu être lancé, dis-le et
   n'envoie pas `tests_locaux`.
3. **Décisions.** Formule les décisions réellement prises pendant la session,
   une par entrée, pour un relecteur qui n'a pas suivi la conversation.
4. **Aperçu.** Appelle `submit_solution` **sans** `confirmer` : rien n'est
   écrit. Montre le résumé rendu tel quel, et signale les fichiers non
   commités s'il y en a — ils ne sont pas dans le diff.
5. **Confirmation.** Demande explicitement s'il faut soumettre. Seulement sur un
   accord clair, rappelle l'outil avec les mêmes arguments et `confirmer: true`.
   Toute modification demandée entre les deux repart de l'étape 4.

Si l'outil refuse, rapporte son message tel quel et arrête-toi.

## Autre sous-commande

Si `$ARGUMENTS` est vide ou ne commence ni par `scan`, ni par `work`, ni par
`submit`, indique que ce sont les trois sous-commandes disponibles, la création
de tickets se faisant à la suite d'un `scan`.
