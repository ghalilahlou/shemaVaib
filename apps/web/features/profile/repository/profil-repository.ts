import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { User } from '@schemavibe/shared-types';
import type { Database } from '../../../lib/supabase/database.types';

/**
 * Écriture du profil de l'utilisateur connecté (SV-021).
 *
 * Seule couche de la feature qui touche la base (section 18). Le nom ne se
 * modifie que par `modifier_mon_nom` : aucune politique `UPDATE` n'ouvre la
 * ligne `users`, sans quoi `xp` et `vibe_score` le seraient avec elle.
 */

export class ProfilRepositoryError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'ProfilRepositoryError';
  }
}

export async function modifierMonNom(client: SupabaseClient<Database>, nom: string): Promise<User> {
  const { data, error } = await client.rpc('modifier_mon_nom', { nom });

  if (error) {
    throw new ProfilRepositoryError('Le nom n’a pas pu être modifié.', error);
  }

  return data as unknown as User;
}
