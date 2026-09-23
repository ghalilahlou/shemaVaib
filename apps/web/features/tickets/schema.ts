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

/**
 * Formulaire de soumission d'une solution (section 9).
 *
 * `diff_url` et `preview_url` sont obligatoires : une soumission sans diff ni
 * aperçu ne donne au porteur aucun moyen d'évaluer le travail. `resume_md`
 * reste libre — sa génération automatique appartient au serveur MCP (SV-011,
 * section 8).
 */
export const MESSAGE_DIFF_URL_REQUISE = 'Le lien vers le diff est obligatoire.';
export const MESSAGE_PREVIEW_URL_REQUISE = 'Le lien vers l’aperçu est obligatoire.';
export const MESSAGE_URL_SOUMISSION_INVALIDE = 'Saisissez une adresse http ou https valide.';

const urlRequise = (messageManquant: string) =>
  z
    .string()
    .trim()
    .min(1, messageManquant)
    .refine(
      (valeur) => z.url({ protocol: /^https?$/ }).safeParse(valeur).success,
      MESSAGE_URL_SOUMISSION_INVALIDE,
    );

export const submissionFormSchema = z.object({
  ticket_id: z.uuid(),
  diff_url: urlRequise(MESSAGE_DIFF_URL_REQUISE),
  preview_url: urlRequise(MESSAGE_PREVIEW_URL_REQUISE),
  resume_md: z
    .string()
    .trim()
    .max(20000)
    .transform((valeur) => (valeur === '' ? null : valeur)),
});

export type SubmissionFormValues = z.input<typeof submissionFormSchema>;
export type SubmissionFormData = z.output<typeof submissionFormSchema>;
