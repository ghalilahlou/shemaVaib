import { config } from 'dotenv';

/**
 * Charge `.env.local` avant les tests d'intégration.
 *
 * Les valeurs proviennent de `pnpm db:status` sur l'instance Supabase locale.
 * Aucune valeur par défaut n'est codée en dur ici : un test qui tourne sans
 * environnement doit échouer bruyamment plutôt que viser une base inattendue.
 */
config({ path: '.env.local', quiet: true });
