import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createServerSupabaseClient } from '../../../../lib/supabase/server';
import { recupererProjet } from '../../../../features/projects/repository/projects-repository';
import { recupererUtilisateurConnecte } from '../../../../features/auth/repository/session-repository';
import { listerJalons } from '../../../../features/milestones/repository/milestones-repository';
import { MilestoneCard } from '../../../../features/milestones/components/milestone-card';
import { MilestoneForm } from '../../../../features/milestones/components/milestone-form';

export async function generateMetadata({
  params,
}: PageProps<'/projets/[id]/jalons'>): Promise<Metadata> {
  const { id } = await params;
  const client = await createServerSupabaseClient();
  const projet = await recupererProjet(client, id);

  return { title: projet ? `Roadmap — ${projet.nom}` : 'Projet introuvable — SchemaVibe' };
}

export default async function JalonsPage({ params }: PageProps<'/projets/[id]/jalons'>) {
  const { id } = await params;
  const client = await createServerSupabaseClient();

  const [projet, utilisateur] = await Promise.all([
    recupererProjet(client, id),
    recupererUtilisateurConnecte(client),
  ]);

  if (!projet) {
    notFound();
  }

  const estPorteur = utilisateur?.id === projet.proprietaire_id;
  const jalons = await listerJalons(client, id);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-12">
      <nav>
        <Link href={`/projets/${id}`} className="text-sm opacity-70 hover:underline">
          ← {projet.nom}
        </Link>
      </nav>

      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Roadmap</h1>
        <p className="text-sm opacity-70">
          Les jalons sont des thèmes, pas des dates. Leur progression et leur santé sont calculées à
          partir des tickets rattachés, au moment où vous consultez la page.
        </p>
      </header>

      {jalons.length === 0 ? (
        <p data-testid="jalons-vide" className="opacity-70">
          Aucun jalon sur ce projet pour le moment.
        </p>
      ) : (
        <ul data-testid="jalons-liste" className="flex flex-col gap-3">
          {jalons.map((jalon) => (
            <li key={jalon.id}>
              <MilestoneCard jalon={jalon} />
            </li>
          ))}
        </ul>
      )}

      {estPorteur ? <MilestoneForm projetId={id} /> : null}
    </main>
  );
}
