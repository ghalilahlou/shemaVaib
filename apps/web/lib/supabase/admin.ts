import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types.js';

/**
 * Client Supabase à privilèges élevés (clé `service_role`).
 *
 * Il contourne la Row Level Security : il ne doit jamais être construit ni
 * importé côté navigateur — l'import de `server-only` fait échouer le build si
 * cela arrive. Son usage est réservé aux tâches d'administration côté serveur
 * (seed, migrations de données, tests d'intégration).
 *
 * Le code applicatif passe par la couche repository d'une feature (section 18),
 * jamais par ce client directement.
 */
export function createAdminClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL est absent de l’environnement.');
  }
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY est absent de l’environnement.');
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
