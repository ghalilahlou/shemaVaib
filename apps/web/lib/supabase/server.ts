import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

/**
 * Client Supabase côté serveur, lié à la session du visiteur via les cookies.
 *
 * C'est ce client que la couche repository utilise : toutes ses requêtes
 * passent donc par la Row Level Security, avec les droits du visiteur réel. Le
 * client à privilèges élevés (`admin.ts`) reste réservé à l'administration.
 *
 * Tant que le ticket SV-001 n'est pas fait, aucun cookie de session n'est écrit :
 * le client se comporte comme un visiteur anonyme, ce qui est le comportement
 * correct et non une limitation à contourner.
 */
export async function createServerSupabaseClient(): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL est absent de l’environnement.');
  }
  if (!anonKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY est absent de l’environnement.');
  }

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Appelé depuis un Server Component : les cookies y sont en lecture
          // seule. Le rafraîchissement de session est alors pris en charge par
          // le middleware, ce cas peut donc être ignoré.
        }
      },
    },
  });
}
