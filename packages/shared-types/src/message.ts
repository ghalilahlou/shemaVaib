import { z } from 'zod';

/** Longueur maximale d'un message, alignée sur la contrainte Postgres. */
export const MAX_MESSAGE_LENGTH = 10000;

/**
 * Un message (section 9). Un seul système, deux contextes (section 12) : il est
 * rattaché soit à un projet — canal général, annonces, discussions transverses —
 * soit à un ticket — fil dédié, questions techniques, revue de soumission.
 * Jamais aux deux, jamais à aucun des deux.
 */
export const messageSchema = z
  .object({
    id: z.uuid(),
    projet_id: z.uuid().nullable(),
    ticket_id: z.uuid().nullable(),
    auteur_id: z.uuid().nullable(),
    contenu: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
    cree_le: z.string(),
    maj_le: z.string(),
  })
  .refine((message) => (message.projet_id !== null) !== (message.ticket_id !== null), {
    error: 'Un message est rattaché soit à un projet, soit à un ticket, jamais aux deux.',
    path: ['projet_id'],
  });

export type Message = z.infer<typeof messageSchema>;

export const messageInsertSchema = z
  .object({
    projet_id: z.uuid().nullable().default(null),
    ticket_id: z.uuid().nullable().default(null),
    auteur_id: z.uuid().nullable().default(null),
    contenu: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
  })
  .refine((message) => (message.projet_id !== null) !== (message.ticket_id !== null), {
    error: 'Un message est rattaché soit à un projet, soit à un ticket, jamais aux deux.',
    path: ['projet_id'],
  });

export type MessageInsert = z.infer<typeof messageInsertSchema>;
