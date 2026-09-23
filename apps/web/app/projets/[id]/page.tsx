import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import type { ProjetStatut } from '@schemavibe/shared-types';
import { createServerSupabaseClient } from '../../../lib/supabase/server';
import { recupererProjet } from '../../../features/projects/repository/projects-repository';
import { recupererUtilisateurConnecte } from '../../../features/auth/repository/session-repository';
import { listerTickets } from '../../../features/tickets/repository/tickets-repository';
import { TicketCard } from '../../../features/tickets/components/ticket-card';

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
  const [projet, utilisateur] = await Promise.all([
    recupererProjet(client, id),
    recupererUtilisateurConnecte(client),
  ]);

  // Un projet en brouillon dont on n'est pas porteur est invisible pour la RLS :
  // il est donc introuvable, et non « interdit » — on ne révèle pas son existence.
  if (!projet) {
    notFound();
  }

  const tickets = await listerTickets(client, { projet_id: id });
  const estPorteur = utilisateur?.id === projet.proprietaire_id;

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

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-medium">Tickets</h2>
          <Link
            href={`/projets/${id}/discussions`}
            data-testid="lien-discussions"
            className="text-sm opacity-70 hover:underline"
          >
            Discussions →
          </Link>
          <Link
            href={`/projets/${id}/jalons`}
            data-testid="lien-jalons"
            className="text-sm opacity-70 hover:underline"
          >
            Roadmap →
          </Link>
          <Link
            href={`/projets/${id}/pulse`}
            data-testid="lien-pulse"
            className="text-sm opacity-70 hover:underline"
          >
            Voir le pulse →
          </Link>
          {estPorteur ? (
            <Link
              href={`/projets/${id}/tickets/nouveau`}
              data-testid="nouveau-ticket"
              className="rounded-md bg-foreground px-3 py-1.5 text-sm text-background"
            >
              Nouveau ticket
            </Link>
          ) : null}
        </div>

        {tickets.length === 0 ? (
          <p data-testid="projet-tickets-vide" className="text-sm opacity-70">
            Aucun ticket sur ce projet pour le moment.
          </p>
        ) : (
          <ul data-testid="projet-tickets" className="flex flex-col gap-3">
            {tickets.map((ticket) => (
              <li key={ticket.id}>
                <TicketCard ticket={ticket} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
