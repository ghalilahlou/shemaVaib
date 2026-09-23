import Link from 'next/link';
import type { Metadata } from 'next';
import { projetStatutSchema } from '@schemavibe/shared-types';
import { createServerSupabaseClient } from '../../lib/supabase/server';
import { listerProjets } from '../../features/projects/repository/projects-repository';
import { ProjectCard } from '../../features/projects/components/project-card';

export const metadata: Metadata = {
  title: 'Projets — SchemaVibe',
  description: 'Les projets vivants qui exposent des tickets sur SchemaVibe.',
};

const FILTRES = [
  { valeur: undefined, libelle: 'Tous' },
  { valeur: 'actif', libelle: 'Actifs' },
  { valeur: 'en_pause', libelle: 'En pause' },
  { valeur: 'archive', libelle: 'Archivés' },
] as const;

export default async function ProjectsPage({ searchParams }: PageProps<'/projets'>) {
  const parametres = await searchParams;
  const statutDemande = projetStatutSchema.safeParse(parametres.statut);
  const filtres = statutDemande.success ? { statut: statutDemande.data } : {};

  const client = await createServerSupabaseClient();
  const projets = await listerProjets(client, filtres);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Projets</h1>
        <Link
          href="/projets/nouveau"
          className="rounded-md bg-foreground px-3 py-1.5 text-sm text-background"
        >
          Nouveau projet
        </Link>
      </header>

      <nav aria-label="Filtrer par statut" className="flex flex-wrap gap-2">
        {FILTRES.map((filtre) => {
          const actif = parametres.statut === filtre.valeur;

          return (
            <Link
              key={filtre.libelle}
              href={filtre.valeur ? `/projets?statut=${filtre.valeur}` : '/projets'}
              aria-current={actif ? 'page' : undefined}
              className={`rounded-full border px-3 py-1 text-sm ${
                actif
                  ? 'border-foreground'
                  : 'border-black/15 opacity-70 hover:opacity-100 dark:border-white/20'
              }`}
            >
              {filtre.libelle}
            </Link>
          );
        })}
      </nav>

      {projets.length === 0 ? (
        <p data-testid="projets-vide" className="opacity-70">
          Aucun projet à afficher pour le moment.
        </p>
      ) : (
        <ul data-testid="projets-liste" className="flex flex-col gap-3">
          {projets.map((projet) => (
            <li key={projet.id}>
              <ProjectCard projet={projet} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
