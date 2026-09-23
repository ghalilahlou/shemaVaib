import { z } from 'zod';
import { MAX_MILESTONE_THEME_LENGTH } from '@schemavibe/shared-types';

/**
 * Schémas de la feature Jalons.
 *
 * Un jalon est un thème, pas une date (section 11) : la date cible reste
 * facultative, et un champ laissé vide vaut « pas d'échéance » plutôt qu'une
 * erreur de saisie.
 */

export const MESSAGE_THEME_REQUIS = 'Le thème du jalon est obligatoire.';
export const MESSAGE_THEME_TROP_LONG = `Le thème ne doit pas dépasser ${MAX_MILESTONE_THEME_LENGTH} caractères.`;
export const MESSAGE_DATE_INVALIDE = 'Saisissez une date au format jour/mois/année.';

export const milestoneFormSchema = z.object({
  projet_id: z.uuid(),
  theme: z
    .string()
    .trim()
    .min(1, MESSAGE_THEME_REQUIS)
    .max(MAX_MILESTONE_THEME_LENGTH, MESSAGE_THEME_TROP_LONG),
  date_cible: z
    .string()
    .trim()
    .transform((valeur) => (valeur === '' ? null : valeur))
    .refine(
      (valeur) => valeur === null || z.iso.date().safeParse(valeur).success,
      MESSAGE_DATE_INVALIDE,
    ),
});

export type MilestoneFormValues = z.input<typeof milestoneFormSchema>;
export type MilestoneFormData = z.output<typeof milestoneFormSchema>;

/** Rattachement ou détachement d'un ticket existant à un jalon. */
export const rattachementSchema = z.object({
  ticket_id: z.uuid(),
  jalon_id: z.uuid().nullable(),
});

export type Rattachement = z.infer<typeof rattachementSchema>;

/** Déclaration d'une dépendance : `ticket_id` est bloqué par `bloque_par_id`. */
export const dependanceFormSchema = z
  .object({
    ticket_id: z.uuid(),
    bloque_par_id: z.uuid(),
  })
  .refine((valeur) => valeur.ticket_id !== valeur.bloque_par_id, {
    error: 'Un ticket ne peut pas se bloquer lui-même.',
    path: ['bloque_par_id'],
  });

export type DependanceFormData = z.infer<typeof dependanceFormSchema>;
