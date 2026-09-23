import { z } from 'zod';

/** Longueur maximale du nom affiché, alignée sur la contrainte Postgres. */
export const MAX_USER_NAME_LENGTH = 80;

/** Bornes du Vibe Score (section 16), alignées sur la contrainte Postgres. */
export const VIBE_SCORE_MIN = 0;
export const VIBE_SCORE_MAX = 100;

/**
 * Profil public d'un utilisateur (section 9). L'identité — e-mail, mot de
 * passe, fournisseur OAuth — reste dans `auth.users` et n'apparaît jamais ici.
 */
export const userSchema = z.object({
  id: z.uuid(),
  nom: z.string().trim().min(1).max(MAX_USER_NAME_LENGTH),
  xp: z.number().int().min(0),
  // NULL tant qu'aucun calcul n'a eu lieu : un contributeur sans historique n'a
  // pas un score de zéro, il n'a pas encore de score.
  vibe_score: z.number().min(VIBE_SCORE_MIN).max(VIBE_SCORE_MAX).nullable(),
  cree_le: z.string(),
  maj_le: z.string(),
});

export type User = z.infer<typeof userSchema>;

export const userInsertSchema = userSchema
  .omit({ cree_le: true, maj_le: true })
  .partial({ xp: true, vibe_score: true });

export type UserInsert = z.infer<typeof userInsertSchema>;

export const userUpdateSchema = userInsertSchema.partial().omit({ id: true });

export type UserUpdate = z.infer<typeof userUpdateSchema>;
