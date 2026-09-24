import { z } from 'zod';

/**
 * Schémas de la feature Jetons d'accès.
 *
 * Le libellé est la seule donnée que l'utilisateur fournit : le secret est
 * engendré par le serveur, jamais choisi.
 */

export const LIBELLE_MAX = 80;

export const JETON_LIBELLE_REQUIS = 'Donnez un nom à ce jeton, pour le reconnaître plus tard.';
export const JETON_LIBELLE_TROP_LONG = `Un libellé ne peut pas dépasser ${LIBELLE_MAX} caractères.`;

export const jetonFormSchema = z.object({
  libelle: z.string().trim().min(1, JETON_LIBELLE_REQUIS).max(LIBELLE_MAX, JETON_LIBELLE_TROP_LONG),
});

export const revocationFormSchema = z.object({
  jeton_id: z.uuid(),
});

export type JetonFormData = z.infer<typeof jetonFormSchema>;
