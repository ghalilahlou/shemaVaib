import { z } from 'zod';
import { jalonSanteSchema } from './enums.js';

/** Longueur maximale du thème d'un jalon, alignée sur la contrainte Postgres. */
export const MAX_MILESTONE_THEME_LENGTH = 120;

/**
 * Un jalon regroupe des tickets autour d'un thème, pas d'une date (section 11) :
 * `date_cible` reste facultative, et `sante` est recalculée à partir de la
 * vélocité des tickets rattachés.
 */
export const milestoneSchema = z.object({
  id: z.uuid(),
  projet_id: z.uuid(),
  theme: z.string().trim().min(1).max(MAX_MILESTONE_THEME_LENGTH),
  date_cible: z.iso.date().nullable(),
  sante: jalonSanteSchema,
  cree_le: z.string(),
  maj_le: z.string(),
});

export type Milestone = z.infer<typeof milestoneSchema>;

export const milestoneInsertSchema = milestoneSchema
  .omit({ id: true, cree_le: true, maj_le: true })
  .partial({ date_cible: true, sante: true });

export type MilestoneInsert = z.infer<typeof milestoneInsertSchema>;

export const milestoneUpdateSchema = milestoneInsertSchema.partial().omit({ projet_id: true });

export type MilestoneUpdate = z.infer<typeof milestoneUpdateSchema>;
