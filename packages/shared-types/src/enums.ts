import { z } from 'zod';

/**
 * Énumérations du domaine, miroir exact des types énumérés Postgres créés par
 * la migration `20260923120000_schema_initial.sql`.
 *
 * Toute valeur ajoutée ici doit l'être aussi côté base, et réciproquement :
 * c'est le seul endroit du code TypeScript qui fait foi sur ces listes.
 */

export const projetStatutSchema = z.enum(['brouillon', 'actif', 'en_pause', 'archive']);
export type ProjetStatut = z.infer<typeof projetStatutSchema>;

export const jalonSanteSchema = z.enum(['a_jour', 'a_risque', 'bloque']);
export type JalonSante = z.infer<typeof jalonSanteSchema>;

export const ticketStatutSchema = z.enum([
  'brouillon',
  'ouvert',
  'reclame',
  'en_revue',
  'fusionne',
  'ferme',
]);
export type TicketStatut = z.infer<typeof ticketStatutSchema>;

export const ticketSourceSchema = z.enum(['manuel', 'scan_mcp', 'decouverte_github', 'genere_ia']);
export type TicketSource = z.infer<typeof ticketSourceSchema>;

export const ticketPrioriteSchema = z.enum(['basse', 'normale', 'haute', 'critique']);
export type TicketPriorite = z.infer<typeof ticketPrioriteSchema>;

export const ticketComplexiteSchema = z.enum(['S', 'M', 'L']);
export type TicketComplexite = z.infer<typeof ticketComplexiteSchema>;

export const ticketPatternRoleSchema = z.enum(['suggere', 'utilise']);
export type TicketPatternRole = z.infer<typeof ticketPatternRoleSchema>;

export const soumissionResultatSchema = z.enum(['en_attente', 'succes', 'echec']);
export type SoumissionResultat = z.infer<typeof soumissionResultatSchema>;
