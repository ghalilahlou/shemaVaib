/**
 * Types et schémas partagés entre `apps/web` et `apps/mcp-server`.
 *
 * Principe schema-first (section 18 du cahier des charges) : chaque entité du
 * modèle de données (section 9) possède un schéma Zod unique, dont les types
 * TypeScript sont dérivés — jamais l'inverse. Ce schéma est le même pour le
 * formulaire client, la Server Action et le repository.
 */

export const SCHEMAVIBE_SHARED_TYPES_VERSION = '0.1.0' as const;

export * from './enums.js';
export * from './user.js';
export * from './project.js';
export * from './milestone.js';
export * from './ticket.js';
export * from './submission.js';
export * from './pattern.js';
export * from './message.js';
