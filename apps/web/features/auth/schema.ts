import { z } from 'zod';
import { MAX_USER_NAME_LENGTH } from '@schemavibe/shared-types';

/**
 * Schémas de la feature Authentification.
 *
 * Les règles de mot de passe reproduisent exactement celles appliquées par
 * Supabase Auth (`minimum_password_length` et `password_requirements` dans
 * `supabase/config.toml`). Les dupliquer ici n'est pas une faiblesse : c'est ce
 * qui permet d'expliquer précisément à l'utilisateur ce qui manque, au lieu de
 * lui renvoyer le refus générique du serveur d'authentification.
 */

/** Longueur minimale du mot de passe, alignée sur `minimum_password_length`. */
export const MIN_PASSWORD_LENGTH = 12;

export const MESSAGE_EMAIL_INVALIDE = 'Saisissez une adresse e-mail valide.';
export const MESSAGE_NOM_REQUIS = 'Votre nom est obligatoire.';
export const MESSAGE_MOT_DE_PASSE_TROP_COURT = `Le mot de passe doit faire au moins ${MIN_PASSWORD_LENGTH} caractères.`;
export const MESSAGE_MOT_DE_PASSE_TROP_SIMPLE =
  'Le mot de passe doit contenir au moins une minuscule, une majuscule et un chiffre.';

export const emailSchema = z.string().trim().pipe(z.email(MESSAGE_EMAIL_INVALIDE));

export const motDePasseSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, MESSAGE_MOT_DE_PASSE_TROP_COURT)
  .refine(
    (valeur) => /[a-z]/.test(valeur) && /[A-Z]/.test(valeur) && /\d/.test(valeur),
    MESSAGE_MOT_DE_PASSE_TROP_SIMPLE,
  );

/** Nom public, tel qu'il s'affiche aux autres contributeurs. */
export const nomSchema = z.string().trim().min(1, MESSAGE_NOM_REQUIS).max(MAX_USER_NAME_LENGTH);

/** Formulaire d'inscription par e-mail et mot de passe. */
export const signUpSchema = z.object({
  nom: nomSchema,
  email: emailSchema,
  motDePasse: motDePasseSchema,
});

export type SignUpValues = z.infer<typeof signUpSchema>;

/**
 * Formulaire de connexion.
 *
 * Le mot de passe n'y est pas soumis aux règles de robustesse : les exiger à la
 * connexion enfermerait dehors quiconque s'est inscrit avant leur durcissement,
 * et renseignerait un attaquant sur la forme des mots de passe acceptés.
 */
export const signInSchema = z.object({
  email: emailSchema,
  motDePasse: z.string().min(1, 'Le mot de passe est obligatoire.'),
});

export type SignInValues = z.infer<typeof signInSchema>;

/** Demande de lien de connexion par e-mail (magic link). */
export const magicLinkSchema = z.object({
  email: emailSchema,
});

export type MagicLinkValues = z.infer<typeof magicLinkSchema>;

export const MESSAGE_CONFIRMATION_DIFFERENTE = 'Les deux mots de passe ne sont pas identiques.';

/**
 * Nouveau mot de passe (SV-021), saisi deux fois.
 *
 * Mêmes règles qu'à l'inscription : c'est ici qu'un mot de passe est choisi, et
 * Supabase Auth refuserait de toute façon ce que ces règles écartent.
 */
export const nouveauMotDePasseSchema = z
  .object({
    motDePasse: motDePasseSchema,
    confirmation: z.string(),
  })
  .refine((valeurs) => valeurs.motDePasse === valeurs.confirmation, {
    message: MESSAGE_CONFIRMATION_DIFFERENTE,
    path: ['confirmation'],
  });

export type NouveauMotDePasseValues = z.infer<typeof nouveauMotDePasseSchema>;
