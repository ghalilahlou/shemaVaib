import { z } from 'zod';
import { jalonSanteSchema } from './enums.js';

/** Longueur maximale du thème d'un jalon, alignée sur la contrainte Postgres. */
export const MAX_MILESTONE_THEME_LENGTH = 120;

/**
 * Un jalon regroupe des tickets autour d'un thème, pas d'une date (section 11) :
 * `date_cible` reste facultative.
 *
 * Ni la progression ni la santé ne figurent ici : elles dépendent de l'état des
 * tickets rattachés et, pour la santé, du temps écoulé. Elles sont calculées à
 * la lecture — voir `milestoneAvecSanteSchema`.
 */
export const milestoneSchema = z.object({
  id: z.uuid(),
  projet_id: z.uuid(),
  theme: z.string().trim().min(1).max(MAX_MILESTONE_THEME_LENGTH),
  date_cible: z.iso.date().nullable(),
  cree_le: z.string(),
  maj_le: z.string(),
});

export type Milestone = z.infer<typeof milestoneSchema>;

export const milestoneInsertSchema = milestoneSchema
  .omit({ id: true, cree_le: true, maj_le: true })
  .partial({ date_cible: true });

export type MilestoneInsert = z.infer<typeof milestoneInsertSchema>;

export const milestoneUpdateSchema = milestoneInsertSchema.partial().omit({ projet_id: true });

export type MilestoneUpdate = z.infer<typeof milestoneUpdateSchema>;

/**
 * Un jalon tel que le rend la vue `jalons_avec_sante` : ses champs propres,
 * plus la progression et la santé calculées au moment de la lecture.
 *
 * La santé dépend du temps écoulé depuis la dernière activité : la stocker la
 * rendrait fausse dès qu'un jalon reste inactif, sans qu'aucune écriture ne
 * vienne la corriger.
 */
export const milestoneAvecSanteSchema = milestoneSchema.extend({
  tickets_total: z.number().int().min(0),
  tickets_acheves: z.number().int().min(0),
  tickets_restants: z.number().int().min(0),
  jours_inactivite: z.number().int().min(0).nullable(),
  progression: z.number().int().min(0).max(100),
  sante: jalonSanteSchema,
});

export type MilestoneAvecSante = z.infer<typeof milestoneAvecSanteSchema>;

/** Une dépendance : `ticket_id` est bloqué par `bloque_par_id` (section 11). */
export const ticketDependencySchema = z.object({
  ticket_id: z.uuid(),
  bloque_par_id: z.uuid(),
  cree_le: z.string(),
});

export type TicketDependency = z.infer<typeof ticketDependencySchema>;
