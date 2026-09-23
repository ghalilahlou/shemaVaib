import { z } from 'zod';
import { ticketPatternRoleSchema } from './enums.js';

/** Longueur maximale du nom d'un pattern, alignée sur la contrainte Postgres. */
export const MAX_PATTERN_NAME_LENGTH = 80;

/**
 * Un pattern de vibe coding : une pratique de prompting documentée et
 * réutilisable (section 5.2). Le référentiel est public en lecture.
 */
export const patternSchema = z.object({
  id: z.uuid(),
  nom: z.string().trim().min(1).max(MAX_PATTERN_NAME_LENGTH),
  categorie: z.string().trim().min(1).max(60),
  principe: z.string().nullable(),
  cas_usage: z.string().nullable(),
  cree_le: z.string(),
  maj_le: z.string(),
});

export type Pattern = z.infer<typeof patternSchema>;

export const patternInsertSchema = patternSchema
  .omit({ id: true, cree_le: true, maj_le: true })
  .partial({ principe: true, cas_usage: true });

export type PatternInsert = z.infer<typeof patternInsertSchema>;

/**
 * Lien entre un ticket et un pattern. Le rôle distingue le pattern suggéré à la
 * création de celui effectivement utilisé à la résolution — c'est cette
 * distinction qui alimente la base de connaissance empirique de la section 5.2.
 */
export const ticketPatternSchema = z.object({
  ticket_id: z.uuid(),
  pattern_id: z.uuid(),
  role: ticketPatternRoleSchema,
  cree_le: z.string(),
});

export type TicketPattern = z.infer<typeof ticketPatternSchema>;

export const ticketPatternInsertSchema = ticketPatternSchema
  .omit({ cree_le: true })
  .partial({ role: true });

export type TicketPatternInsert = z.infer<typeof ticketPatternInsertSchema>;
