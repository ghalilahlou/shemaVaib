import Link from 'next/link';
import type { Metadata } from 'next';
import { ticketStatutSchema } from '@schemavibe/shared-types';
import { z } from 'zod';
import { createServerSupabaseClient } from '../../lib/supabase/server';
import { listerTickets } from '../../features/tickets/repository/tickets-repository';
import { listerProjets } from '../../features/projects/repository/projects-repository';
import { TicketCard } from '../../features/tickets/components/ticket-card';

export const metadata: Metadata = {
  title: 'Tickets — SchemaVibe',
  description: 'Les tickets ouverts sur les projets vivants de SchemaVibe.',
};

const FILTRES_STATUT = [
  { valeur: undefined, libelle: 'Tous' },
  { valeur: 'ouvert', libelle: 'Ouverts' },
  { valeur: 'reclame', libelle: 'Réclamés' },
  { valeur: 'en_revue', libelle: 'En revue' },
  { valeur: 'fusionne', libelle: 'Fusionnés' },
] as const;

export default async function TicketsPage({ searchParams }: PageProps<'/tickets'>) {
  const parametres = await searchParams;

  const statut = ticketStatutSchema.safeParse(parametres.statut);
  const projet = z.uuid().safeParse(parametres.projet);

  const filtres = {
    ...(statut.success ? { statut: statut.data } : {}),
    ...(projet.success ? { projet_id: projet.data } : {}),
  };

  const client = await createServerSupabaseClient();
  const [tickets, projets] = await Promise.all([
    listerTickets(client, filtres),
    listerProjets(client),
  ]);

  function lien(nouveaux: Record<string, string | undefined>): string {
    const params = new URLSearchParams();
    const statutVoulu = 'statut' in nouveaux ? nouveaux.statut : (parametres.statut as string);
    const projetVoulu = 'projet' in nouveaux ? nouveaux.projet : (parametres.projet as string);

    if (statutVoulu) params.set('statut', statutVoulu);
    if (projetVoulu) params.set('projet', projetVoulu);

    const chaine = params.toString();
    return chaine ? `/tickets?${chaine}` : '/tickets';
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Tickets</h1>

      <nav aria-label="Filtrer par statut" className="flex flex-wrap gap-2">
        {FILTRES_STATUT.map((filtre) => {
          const actif = parametres.statut === filtre.valeur;

          return (
            <Link
              key={filtre.libelle}
              href={lien({ statut: filtre.valeur })}
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

      {projets.length > 0 ? (
        <nav aria-label="Filtrer par projet" className="flex flex-wrap gap-2">
          <Link
            href={lien({ projet: undefined })}
            aria-current={parametres.projet ? undefined : 'page'}
            className={`rounded-full border px-3 py-1 text-sm ${
              parametres.projet
                ? 'border-black/15 opacity-70 hover:opacity-100 dark:border-white/20'
                : 'border-foreground'
            }`}
          >
            Tous les projets
          </Link>
          {projets.map((candidat) => (
            <Link
              key={candidat.id}
              href={lien({ projet: candidat.id })}
              aria-current={parametres.projet === candidat.id ? 'page' : undefined}
              className={`rounded-full border px-3 py-1 text-sm ${
                parametres.projet === candidat.id
                  ? 'border-foreground'
                  : 'border-black/15 opacity-70 hover:opacity-100 dark:border-white/20'
              }`}
            >
              {candidat.nom}
            </Link>
          ))}
        </nav>
      ) : null}

      {tickets.length === 0 ? (
        <p data-testid="tickets-vide" className="opacity-70">
          Aucun ticket à afficher pour le moment.
        </p>
      ) : (
        <ul data-testid="tickets-liste" className="flex flex-col gap-3">
          {tickets.map((ticket) => (
            <li key={ticket.id}>
              <TicketCard ticket={ticket} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
