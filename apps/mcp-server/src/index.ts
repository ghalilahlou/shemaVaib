#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  resumerEnTexte,
  scanRepoInputSchema,
  scanRepoOutputSchema,
  scannerDepot,
} from './tools/scan-repo.js';

/**
 * Serveur MCP SchemaVibe (section 8 du cahier des charges).
 *
 * Un seul serveur pour tous les outils compatibles MCP — Claude Code, Cursor et
 * les autres — plutôt qu'une intégration par éditeur.
 *
 * Il n'expose pour l'instant que `scan_repo`, qui lit et n'écrit rien.
 * `create_tickets`, `claim_ticket` et `submit_solution` viendront avec leurs
 * propres tickets ; la règle qu'ils devront respecter est déjà posée : jamais
 * de création sans confirmation explicite.
 */

export const MCP_SERVER_NAME = 'schemavibe' as const;
export const MCP_SERVER_VERSION = '0.1.0' as const;

export function creerServeur(): McpServer {
  const serveur = new McpServer({ name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION });

  serveur.registerTool(
    'scan_repo',
    {
      title: 'Analyser un dépôt local',
      description:
        'Analyse un dépôt local — densité de commits récents, présence de tests, TODO non ' +
        'résolus — et rend un constat structuré. Lecture seule : cet outil ne crée aucun ticket ' +
        'et n’écrit rien sur la plateforme SchemaVibe.',
      inputSchema: scanRepoInputSchema,
      outputSchema: scanRepoOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ chemin }) => {
      const resultat = await scannerDepot(chemin);

      return {
        content: [{ type: 'text' as const, text: resumerEnTexte(resultat) }],
        structuredContent: resultat,
      };
    },
  );

  return serveur;
}

/** Démarre le serveur sur l'entrée et la sortie standard. */
async function demarrer(): Promise<void> {
  const serveur = creerServeur();
  await serveur.connect(new StdioServerTransport());
}

// Le serveur ne démarre que lorsqu'il est lancé comme programme : importé par
// un test, il se contente d'exposer `creerServeur`.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  demarrer().catch((erreur: unknown) => {
    console.error('Le serveur MCP SchemaVibe n’a pas pu démarrer :', erreur);
    process.exit(1);
  });
}
