/**
 * Point d'entrée du serveur MCP SchemaVibe (section 8 du cahier des charges).
 *
 * Les outils exposés (`scan_repo`, `create_tickets`, `claim_ticket`,
 * `submit_solution`) sont implémentés dans `src/tools/` à partir du ticket
 * SV-011. Ce fichier ne fait pour l'instant que poser la structure du module.
 */

export const MCP_SERVER_NAME = 'schemavibe' as const;
export const MCP_SERVER_VERSION = '0.1.0' as const;
