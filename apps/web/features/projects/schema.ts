import { z } from 'zod';
import { MAX_PROJECT_NAME_LENGTH, projetStatutSchema } from '@schemavibe/shared-types';

/**
 * Schémas de la feature Projets.
 *
 * Les schémas d'entité vivent dans `@schemavibe/shared-types`, parce que le
 * serveur MCP en dépend aussi. Ce fichier ne porte que ce qui est propre au web :
 * la validation du formulaire de création, partagée entre le composant client,
 * la Server Action et le repository — un seul schéma pour les trois couches
 * (section 18 du cahier des charges).
 */

export const MESSAGE_NOM_REQUIS = 'Le nom du projet est obligatoire.';
export const MESSAGE_NOM_TROP_LONG = `Le nom ne doit pas dépasser ${MAX_PROJECT_NAME_LENGTH} caractères.`;
export const MESSAGE_URL_INVALIDE = 'L’URL du dépôt doit être une adresse valide (http ou https).';

/**
 * Données saisies dans le formulaire de création.
 *
 * `repo_url` accepte une chaîne vide — c'est ce qu'envoie un champ de formulaire
 * laissé libre — et la convertit en `null`, valeur attendue par la base.
 */
export const projectFormSchema = z.object({
  nom: z
    .string()
    .trim()
    .min(1, MESSAGE_NOM_REQUIS)
    .max(MAX_PROJECT_NAME_LENGTH, MESSAGE_NOM_TROP_LONG),
  repo_url: z
    .string()
    .trim()
    .transform((valeur) => (valeur === '' ? null : valeur))
    .refine(
      (valeur) => valeur === null || z.url({ protocol: /^https?$/ }).safeParse(valeur).success,
      MESSAGE_URL_INVALIDE,
    ),
  statut: projetStatutSchema.default('brouillon'),
});

export type ProjectFormValues = z.input<typeof projectFormSchema>;
export type ProjectFormData = z.output<typeof projectFormSchema>;

/** Filtres acceptés par la liste des projets. */
export const projectListFiltersSchema = z.object({
  statut: projetStatutSchema.optional(),
});

export type ProjectListFilters = z.infer<typeof projectListFiltersSchema>;
