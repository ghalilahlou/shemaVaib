import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createServerSupabaseClient } from '../../../lib/supabase/server';
import { recupererUtilisateurConnecte } from '../../../features/auth/repository/session-repository';
import { ProjectForm } from '../../../features/projects/components/project-form';

export const metadata: Metadata = {
  title: 'Nouveau projet — SchemaVibe',
};

export default async function NewProjectPage() {
  const client = await createServerSupabaseClient();
  const utilisateur = await recupererUtilisateurConnecte(client);

  // Rediriger plutôt que d'afficher un formulaire voué au refus. Le garde-fou
  // de la Server Action reste en place : cette redirection est un confort, pas
  // la protection.
  if (!utilisateur) {
    redirect('/connexion?next=/projets/nouveau');
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-6 py-12">
      <nav>
        <Link href="/projets" className="text-sm opacity-70 hover:underline">
          ← Tous les projets
        </Link>
      </nav>

      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Nouveau projet</h1>
        <p className="text-sm opacity-70">
          Un projet créé en brouillon n’est visible que de vous. Passez-le en « actif » quand vous
          voulez l’ouvrir aux contributeurs.
        </p>
      </header>

      <ProjectForm />
    </main>
  );
}
