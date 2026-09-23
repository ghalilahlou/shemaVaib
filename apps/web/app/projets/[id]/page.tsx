import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import type { ProjetStatut } from '@schemavibe/shared-types';
import { createServerSupabaseClient } from '../../../lib/supabase/server';
import { recupererProjet } from '../../../features/projects/repository/projects-repository';

const LIBELLES_STATUT: Record<ProjetStatut, string> = {
  brouillon: 'Brouillon',
  actif: 'Actif',
  en_pause: 'En pause',
  archive: 'Archivé',
};

export async function generateMetadata({ params }: PageProps<'/projets/[id]'>): Promise<Metadata> {
  const { id } = await params;
  const client = await createServerSupabaseClient();
  const projet = await recupererProjet(client, id);

  return { title: projet ? `${projet.nom} — SchemaVibe` : 'Projet introuvable — SchemaVibe' };
}

export default async function ProjectDetailPage({ params }: PageProps<'/projets/[id]'>) {
  const { id } = await params;
  const client = await createServerSupabaseClient();
  const projet = await recupererProjet(client, id);

  // Un projet en brouillon dont on n'est pas porteur est invisible pour la RLS :
  // il est donc introuvable, et non « interdit » — on ne révèle pas son existence.
  if (!projet) {
    notFound();
  }

  const dateCreation = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(
    new Date(projet.cree_le),
  );

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-12">
      <nav>
        <Link href="/projets" className="text-sm opacity-70 hover:underline">
          ← Tous les projets
        </Link>
      </nav>

      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{projet.nom}</h1>
        <p className="text-sm opacity-70">
          <span data-testid="projet-statut">{LIBELLES_STATUT[projet.statut]}</span>
          {projet.proprietaire ? ` · porté par ${projet.proprietaire.nom}` : null}
          {` · créé le ${dateCreation}`}
        </p>
      </header>

      {projet.repo_url ? (
        <section className="flex flex-col gap-1">
          <h2 className="text-sm font-medium">Dépôt</h2>
          <a
            href={projet.repo_url}
            rel="noreferrer noopener"
            target="_blank"
            className="font-mono text-sm break-all hover:underline"
          >
            {projet.repo_url}
          </a>
        </section>
      ) : null}

      <section className="rounded-lg border border-dashed border-black/15 p-4 text-sm opacity-70 dark:border-white/20">
        Les tickets, jalons et le pulse de ce projet arrivent avec les tickets SV-004, SV-007 et
        SV-009.
      </section>
    </main>
  );
}
