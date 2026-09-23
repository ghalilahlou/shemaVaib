import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createServerSupabaseClient } from '../../../../lib/supabase/server';
import { recupererProjet } from '../../../../features/projects/repository/projects-repository';
import { chargerEvenementsRecents } from '../../../../features/pulse/repository/pulse-repository';
import { PulseFeed } from '../../../../features/pulse/components/pulse-feed';

export async function generateMetadata({
  params,
}: PageProps<'/projets/[id]/pulse'>): Promise<Metadata> {
  const { id } = await params;
  const client = await createServerSupabaseClient();
  const projet = await recupererProjet(client, id);

  return { title: projet ? `Pulse — ${projet.nom}` : 'Projet introuvable — SchemaVibe' };
}

export default async function PulsePage({ params }: PageProps<'/projets/[id]/pulse'>) {
  const { id } = await params;
  const client = await createServerSupabaseClient();

  const projet = await recupererProjet(client, id);

  if (!projet) {
    notFound();
  }

  const evenements = await chargerEvenementsRecents(client, id);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-12">
      <nav>
        <Link href={`/projets/${id}`} className="text-sm opacity-70 hover:underline">
          ← {projet.nom}
        </Link>
      </nav>

      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Pulse</h1>
        <p className="text-sm opacity-70">
          L’activité récente de ce projet : changements de statut des tickets et nouvelles
          soumissions, mis à jour au fil de l’eau.
        </p>
      </header>

      <PulseFeed projetId={id} evenementsInitiaux={evenements} />
    </main>
  );
}
