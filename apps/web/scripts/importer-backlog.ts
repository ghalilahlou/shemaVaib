import { config } from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../lib/supabase/database.types';
import { importerBacklog } from './lib/importer';

/**
 * Importe le backlog de démarrage dans la plateforme.
 *
 *   pnpm import:backlog -- porteur@exemple.test
 *
 * Le compte indiqué devient propriétaire du projet. S'il n'existe pas, le
 * script s'arrête plutôt que de le créer : décider qui porte le projet n'est pas
 * une décision qu'un script d'import doit prendre à la place de quelqu'un.
 *
 * L'import vise l'instance désignée par l'environnement, locale par défaut. Il
 * fonctionnera tel quel contre un projet distant une fois celui-ci en place.
 */

config({ path: '.env.local', quiet: true });

function lireVariable(nom: string): string {
  const valeur = process.env[nom];

  if (!valeur) {
    throw new Error(`${nom} est absent de l’environnement.`);
  }

  return valeur;
}

async function trouverProprietaire(
  client: SupabaseClient<Database>,
  email: string,
): Promise<string> {
  const { data, error } = await client.auth.admin.listUsers({ perPage: 1000 });

  if (error) {
    throw new Error(`Impossible de lister les comptes : ${error.message}`);
  }

  const compte = data.users.find((utilisateur) => utilisateur.email === email);

  if (!compte) {
    throw new Error(
      `Aucun compte pour « ${email} ». Inscrivez-vous d’abord sur /inscription, ` +
        'puis relancez l’import avec cette adresse.',
    );
  }

  return compte.id;
}

async function principal(): Promise<void> {
  // `pnpm run x -- valeur` transmet le `--` littéral au script : l'écarter
  // évite que la forme d'appel documentée échoue sur son propre séparateur.
  const email = process.argv.slice(2).find((argument) => argument !== '--');

  if (!email) {
    throw new Error(
      'Adresse du porteur manquante. Usage : pnpm import:backlog -- porteur@exemple.test',
    );
  }

  const client = createClient<Database>(
    lireVariable('NEXT_PUBLIC_SUPABASE_URL'),
    lireVariable('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const proprietaireId = await trouverProprietaire(client, email);
  const resultat = await importerBacklog(client, proprietaireId);

  console.warn(
    [
      `Projet ${resultat.projet_id}`,
      `${resultat.tickets_importes} tickets importés`,
      `${resultat.patterns_rattaches} patterns rattachés`,
      `${resultat.dependances_creees} dépendances créées`,
    ].join('\n'),
  );

  if (resultat.patterns_introuvables.length > 0) {
    console.warn(
      `\nPatterns cités mais absents de la bibliothèque : ${resultat.patterns_introuvables.join(', ')}`,
    );
  }
}

principal().catch((erreur: unknown) => {
  console.error(erreur instanceof Error ? erreur.message : erreur);
  process.exit(1);
});
