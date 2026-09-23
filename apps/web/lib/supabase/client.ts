import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

/**
 * Client Supabase côté navigateur.
 *
 * Il ne porte que la clé publique et reste soumis à la Row Level Security. Il
 * sert aux échanges qui doivent partir du navigateur — la redirection vers un
 * fournisseur OAuth, qui a besoin de l'origine réelle de la page.
 *
 * La lecture et l'écriture des données métier passent, elles, par la couche
 * repository côté serveur (section 18).
 */
export function createBrowserSupabaseClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY doivent être définis.',
    );
  }

  return createBrowserClient<Database>(url, anonKey);
}
