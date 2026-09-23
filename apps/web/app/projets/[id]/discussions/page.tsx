import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createServerSupabaseClient } from '../../../../lib/supabase/server';
import { recupererProjet } from '../../../../features/projects/repository/projects-repository';
import { recupererUtilisateurConnecte } from '../../../../features/auth/repository/session-repository';
import { listerMessages } from '../../../../features/messaging/repository/messages-repository';
import { FilDiscussion } from '../../../../features/messaging/components/fil-discussion';

export async function generateMetadata({
  params,
}: PageProps<'/projets/[id]/discussions'>): Promise<Metadata> {
  const { id } = await params;
  const client = await createServerSupabaseClient();
  const projet = await recupererProjet(client, id);

  return { title: projet ? `Discussions — ${projet.nom}` : 'Projet introuvable — SchemaVibe' };
}

export default async function DiscussionsPage({ params }: PageProps<'/projets/[id]/discussions'>) {
  const { id } = await params;
  const client = await createServerSupabaseClient();

  const [projet, utilisateur] = await Promise.all([
    recupererProjet(client, id),
    recupererUtilisateurConnecte(client),
  ]);

  if (!projet) {
    notFound();
  }

  const messages = await listerMessages(client, { genre: 'projet', id });

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-12">
      <nav>
        <Link href={`/projets/${id}`} className="text-sm opacity-70 hover:underline">
          ← {projet.nom}
        </Link>
      </nav>

      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Canal du projet</h1>
        <p className="text-sm opacity-70">
          Annonces et discussions transverses. Les questions techniques sur un travail précis ont
          leur place dans le fil du ticket concerné.
        </p>
      </header>

      <FilDiscussion
        contexte={{ genre: 'projet', id }}
        messagesInitiaux={messages}
        peutEcrire={utilisateur !== null}
        titre="Messages"
      />
    </main>
  );
}
