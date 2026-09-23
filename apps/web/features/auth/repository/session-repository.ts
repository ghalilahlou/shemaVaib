import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { User } from '@schemavibe/shared-types';
import type { Database } from '../../../lib/supabase/database.types';

/**
 * Lecture de l'utilisateur connecté et de son profil.
 *
 * Comme pour les projets (section 18), c'est la seule couche de la feature qui
 * appelle `supabase.from(...)` ; le client lui est passé en paramètre, ce qui
 * rend le comportement sous chaque identité directement testable.
 */

/** L'utilisateur connecté, tel que l'application a besoin de le connaître. */
export interface UtilisateurConnecte {
  id: string;
  email: string | null;
  profil: User | null;
}

/**
 * Rend l'utilisateur connecté, ou `null` s'il n'y a pas de session valide.
 *
 * S'appuie sur `getUser`, qui valide le jeton auprès du serveur
 * d'authentification, et non sur `getSession`, qui se contente de faire
 * confiance au cookie.
 */
export async function recupererUtilisateurConnecte(
  client: SupabaseClient<Database>,
): Promise<UtilisateurConnecte | null> {
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profil } = await client
    .from('users')
    .select('id, nom, xp, vibe_score, cree_le, maj_le')
    .eq('id', user.id)
    .maybeSingle();

  return {
    id: user.id,
    email: user.email ?? null,
    profil: profil ?? null,
  };
}
