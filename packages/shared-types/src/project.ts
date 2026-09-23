import { z } from 'zod';
import { projetStatutSchema } from './enums.js';

/** Longueur maximale du nom d'un projet, alignée sur la contrainte Postgres. */
export const MAX_PROJECT_NAME_LENGTH = 120;

/** Un projet vivant, qui expose des tickets (section 9). */
export const projectSchema = z.object({
  id: z.uuid(),
  proprietaire_id: z.uuid(),
  nom: z.string().trim().min(1).max(MAX_PROJECT_NAME_LENGTH),
  repo_url: z.url().nullable(),
  statut: projetStatutSchema,
  cree_le: z.string(),
  maj_le: z.string(),
});

export type Project = z.infer<typeof projectSchema>;

export const projectInsertSchema = projectSchema
  .omit({ id: true, cree_le: true, maj_le: true })
  .partial({ repo_url: true, statut: true });

export type ProjectInsert = z.infer<typeof projectInsertSchema>;

export const projectUpdateSchema = projectInsertSchema.partial().omit({ proprietaire_id: true });

export type ProjectUpdate = z.infer<typeof projectUpdateSchema>;
