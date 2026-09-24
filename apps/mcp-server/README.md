# apps/mcp-server

Serveur MCP de SchemaVibe (section 8 du cahier des charges). Un seul serveur pour tous les outils
compatibles MCP — Claude Code, Cursor et les autres — plutôt qu'une intégration par éditeur.

Ce fichier ne couvre que ce qui est propre à ce module ; l'installation du monorepo est décrite dans
le [README racine](../../README.md).

## Outils exposés

| Outil             | État         |
| ----------------- | ------------ |
| `scan_repo`       | disponible   |
| `create_tickets`  | à construire |
| `claim_ticket`    | à construire |
| `submit_solution` | à construire |

`scan_repo` analyse un dépôt local — densité de commits récents, présence de tests, TODO non
résolus — et rend un constat structuré. Il est en **lecture seule** : il ne crée aucun ticket et
n'écrit rien sur la plateforme. Sa sortie porte le champ `pousse_vers_la_plateforme`, toujours
`false`, pour que ce soit explicite dans les données et pas seulement dans la documentation.

## Construire et lancer

Le serveur communique sur l'entrée et la sortie standard : il n'est pas fait pour être lancé à la
main, mais démarré par le client MCP.

```bash
pnpm build   # compile vers dist/
pnpm test    # tests de contrat et de protocole
pnpm lint
pnpm typecheck
```

## Brancher le serveur dans Claude Code

Le dépôt contient déjà l'enregistrement, dans [`.mcp.json`](../../.mcp.json) à la racine :

```json
{
  "mcpServers": {
    "schemavibe": {
      "type": "stdio",
      "command": "node",
      "args": ["apps/mcp-server/dist/index.js"]
    }
  }
}
```

Le serveur étant lancé depuis la racine du dépôt, `dist/` doit exister : `pnpm build` d'abord.

Claude Code demande d'approuver tout serveur déclaré au niveau du projet au premier démarrage. La
commande `/mcp` en dresse ensuite la liste et son état.

## La commande `/schemavibe scan`

[`.claude/commands/schemavibe.md`](../../.claude/commands/schemavibe.md) définit la commande. Elle
appelle `scan_repo` sur le chemin fourni, ou sur le répertoire courant à défaut :

```
/schemavibe scan
/schemavibe scan ../un-autre-projet
```

## Tests

Deux niveaux, pour deux risques différents.

Le **test de contrat** (`tests/scan-repo.test.ts`) crée de vrais dépôts temporaires — un actif et
testé, un vibe-codé abandonné, un export sans git — et vérifie que la sortie respecte le schéma
déclaré. Les dates de commits y sont fixées à la création, jamais reculées après coup (section 21).

Le **test de protocole** (`tests/protocole.test.ts`) branche un vrai client MCP sur le serveur et
appelle l'outil à travers lui. Un outil peut produire le bon résultat et rester inutilisable : mal
déclaré, mal nommé, ou renvoyant une structure que le SDK rejette. C'est de ce câblage-là que
Claude Code dépend.
