import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Variables de la Supabase locale pour les tests d'intégration (SV-018).
 *
 * En CI, elles sont déjà exportées pour tout le job. En local, elles vivent dans
 * le `.env.local` de l'application web, qui démarre et possède cette instance :
 * on le relit plutôt que d'en tenir une seconde copie qui divergerait.
 */
const FICHIER = fileURLToPath(new URL('../../web/.env.local', import.meta.url));

if (!process.env.SUPABASE_SERVICE_ROLE_KEY && existsSync(FICHIER)) {
  process.loadEnvFile(FICHIER);
}
