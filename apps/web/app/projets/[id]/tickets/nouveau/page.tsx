import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createServerSupabaseClient } from '../../../../../lib/supabase/server';
import { recupererUtilisateurConnecte } from '../../../../../features/auth/repository/session-repository';
import { recupererProjet } from '../../../../../features/projects/repository/projects-repository';
import { listerPatterns } from '../../../../../features/tickets/repository/tickets-repository';
import { TicketForm } from '../../../../../features/tickets/components/ticket-form';

export const metadata: Metadata = {
  title: 'Nouveau ticket — SchemaVibe',
};

export default async function NewTicketPage({
  params,
}: PageProps<'/projets/[id]/tickets/nouveau'>) {
  const { id } = await params;
  const client = await createServerSupabaseClient();

  const utilisateur = await recupererUtilisateurConnecte(client);

  if (!utilisateur) {
    redirect(`/connexion?next=/projets/${id}/tickets/nouveau`);
  }

  const projet = await recupererProjet(client, id);

  if (!projet) {
    notFound();
  }

  // Seul le porteur crée des tickets sur son projet : la RLS le refuserait de
  // toute façon, autant le dire avant que le formulaire ne soit rempli.
  if (projet.proprietaire_id !== utilisateur.id) {
    notFound();
  }

  const patterns = await listerPatterns(client);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-12">
      <nav>
        <Link href={`/projets/${id}`} className="text-sm opacity-70 hover:underline">
          ← {projet.nom}
        </Link>
      </nav>

      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Nouveau ticket</h1>
        <p className="text-sm opacity-70">
          Un ticket incomplet s’enregistre en brouillon. Il ne passe « ouvert » que s’il réunit la
          Definition of Ready : contexte, critères d’acceptation, critère de test, complexité et au
          moins un pattern suggéré.
        </p>
      </header>

      <TicketForm projetId={id} patterns={patterns} />
    </main>
  );
}
