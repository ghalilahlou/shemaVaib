import { z } from 'zod';

/**
 * Contrat d'échange entre la plateforme et le serveur MCP (SV-014).
 *
 * Il vit ici, et non dans l'une des deux applications, parce qu'il est la seule
 * frontière qu'elles partagent : le serveur MCP n'a aucune autre connaissance de
 * la plateforme que cette réponse. En particulier, c'est elle qui lui apprend où
 * se trouve la base et avec quelle clé publique s'y adresser — il n'a donc à
 * connaître que l'adresse de la plateforme et son propre jeton.
 */

/** Chemin de l'échange sur la plateforme. Partagé pour que les deux côtés ne divergent pas. */
export const CHEMIN_SESSION_MCP = '/api/mcp/session' as const;

/** Identité que la session porte, telle que la plateforme la reconnaît. */
export const identiteMcpSchema = z.object({
  id: z.uuid(),
  nom: z.string().nullable(),
});

export const sessionMcpSchema = z.object({
  /**
   * Jeton d'accès Supabase à durée de vie courte. Aucun jeton de
   * rafraîchissement n'est rendu : c'est ce qui fait que révoquer le jeton
   * personnel ferme réellement l'accès, au plus tard à cette échéance.
   */
  access_token: z.string().min(1),
  /** Échéance du jeton d'accès, en secondes depuis l'époque Unix. */
  expires_at: z.number().int().positive(),
  utilisateur: identiteMcpSchema,
  supabase: z.object({
    url: z.url(),
    cle_publique: z.string().min(1),
  }),
});

export type IdentiteMcp = z.infer<typeof identiteMcpSchema>;
export type SessionMcp = z.infer<typeof sessionMcpSchema>;

/** Corps rendu par la plateforme lorsqu'elle refuse un jeton. */
export const refusSessionMcpSchema = z.object({
  erreur: z.enum(['jeton_absent', 'jeton_inconnu', 'jeton_revoque', 'echange_impossible']),
  message: z.string(),
});

export type RefusSessionMcp = z.infer<typeof refusSessionMcpSchema>;
