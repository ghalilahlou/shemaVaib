import { z } from 'zod';
import {
  MAX_TICKET_TITLE_LENGTH,
  ticketComplexiteSchema,
  ticketPrioriteSchema,
  ticketSourceSchema,
  ticketStatutSchema,
} from '@schemavibe/shared-types';

/**
 * Schémas de la feature Tickets.
 *
 * Le formulaire de création reprend les champs qu'impose la Definition of Ready
 * (section 5.1) : titre, contexte, critères d'acceptation, critère de test,
 * complexité et patterns suggérés. Un ticket peut être enregistré incomplet —
 * il reste alors en brouillon ; c'est le passage à « ouvert » qui exige que tout
 * soit là.
 */

export const MESSAGE_TITRE_REQUIS = 'Le titre du ticket est obligatoire.';
export const MESSAGE_TITRE_TROP_LONG = `Le titre ne doit pas dépasser ${MAX_TICKET_TITLE_LENGTH} caractères.`;

/** Convertit un champ de formulaire laissé vide en `null`, valeur attendue en base. */
const texteFacultatif = z
  .string()
  .trim()
  .transform((valeur) => (valeur === '' ? null : valeur));

export const ticketFormSchema = z.object({
  projet_id: z.uuid(),
  titre: z
    .string()
    .trim()
    .min(1, MESSAGE_TITRE_REQUIS)
    .max(MAX_TICKET_TITLE_LENGTH, MESSAGE_TITRE_TROP_LONG),
  contexte: texteFacultatif,
  criteres_acceptation: texteFacultatif,
  critere_test: texteFacultatif,
  complexite: z
    .union([ticketComplexiteSchema, z.literal('')])
    .transform((valeur) => (valeur === '' ? null : valeur)),
  priorite: ticketPrioriteSchema.default('normale'),
  source: ticketSourceSchema.default('manuel'),
  patterns_suggeres: z.array(z.uuid()).default([]),
  /**
   * Intention du porteur : publier le ticket, ou l'enregistrer en brouillon.
   * La Definition of Ready arbitre ensuite ; une intention de publier sur un
   * ticket incomplet est refusée, elle ne retombe pas silencieusement en
   * brouillon.
   */
  publier: z.boolean().default(false),
});

export type TicketFormValues = z.input<typeof ticketFormSchema>;
export type TicketFormData = z.output<typeof ticketFormSchema>;

/** Filtres acceptés par la liste des tickets (section 22 : par statut et par projet). */
export const ticketListFiltersSchema = z.object({
  statut: ticketStatutSchema.optional(),
  projet_id: z.uuid().optional(),
});

export type TicketListFilters = z.infer<typeof ticketListFiltersSchema>;
