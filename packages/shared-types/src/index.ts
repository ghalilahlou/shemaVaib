/**
 * Types et schémas partagés entre `apps/web` et `apps/mcp-server`.
 *
 * Principe schema-first (section 18 du cahier des charges) : chaque entité
 * possède un schéma Zod unique dont les types TypeScript sont dérivés, jamais
 * l'inverse. Les entités du modèle de données (section 9) sont ajoutées ici au
 * fil des tickets SV-002 et suivants.
 */

export const SCHEMAVIBE_SHARED_TYPES_VERSION = '0.1.0' as const;
