import { z } from 'zod';
import { MAX_MESSAGE_LENGTH } from '@schemavibe/shared-types';

/**
 * Schémas de la feature Messagerie.
 *
 * Le contexte — canal de projet ou fil de ticket — est porté par un champ
 * discriminant plutôt que par deux identifiants facultatifs : la base refuse
 * déjà les combinaisons absurdes (section 12), autant que le formulaire ne
 * puisse pas les exprimer.
 */

export const MESSAGE_CONTENU_REQUIS = 'Écrivez quelque chose avant d’envoyer.';
export const MESSAGE_CONTENU_TROP_LONG = `Un message ne peut pas dépasser ${MAX_MESSAGE_LENGTH} caractères.`;

export const messageFormSchema = z.object({
  genre: z.enum(['projet', 'ticket']),
  contexte_id: z.uuid(),
  contenu: z
    .string()
    .trim()
    .min(1, MESSAGE_CONTENU_REQUIS)
    .max(MAX_MESSAGE_LENGTH, MESSAGE_CONTENU_TROP_LONG),
});

export type MessageFormData = z.infer<typeof messageFormSchema>;
