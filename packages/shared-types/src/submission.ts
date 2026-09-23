import { z } from 'zod';
import { soumissionResultatSchema } from './enums.js';

/**
 * Soumission d'une solution à un ticket (section 9).
 *
 * `resume_md` porte le résumé Markdown généré par l'outil MCP `submit_solution`
 * (section 8) : il est stocké en base et affiché sur la page du ticket, jamais
 * écrit comme fichier du dépôt — cohérent avec la section 23.
 */
export const submissionSchema = z.object({
  id: z.uuid(),
  ticket_id: z.uuid(),
  auteur_id: z.uuid().nullable(),
  diff_url: z.url().nullable(),
  preview_url: z.url().nullable(),
  resultat_qualite: soumissionResultatSchema,
  resume_md: z.string().nullable(),
  cree_le: z.string(),
  maj_le: z.string(),
});

export type Submission = z.infer<typeof submissionSchema>;

export const submissionInsertSchema = submissionSchema
  .omit({ id: true, cree_le: true, maj_le: true })
  .partial({
    auteur_id: true,
    diff_url: true,
    preview_url: true,
    resultat_qualite: true,
    resume_md: true,
  });

export type SubmissionInsert = z.infer<typeof submissionInsertSchema>;

export const submissionUpdateSchema = submissionInsertSchema.partial().omit({ ticket_id: true });

export type SubmissionUpdate = z.infer<typeof submissionUpdateSchema>;
