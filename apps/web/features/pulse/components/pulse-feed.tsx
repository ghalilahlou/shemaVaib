'use client';

import Link from 'next/link';
import type { TicketStatut } from '@schemavibe/shared-types';
import { LIBELLES_STATUT } from '../../tickets/components/ticket-card';
import type { EvenementPulse } from '../evenement';
import { usePulseTempsReel } from '../realtime/use-pulse-temps-reel';

/**
 * Flux d'activité d'un projet (section 5.4).
 *
 * Il part des événements chargés côté serveur, puis se complète en temps réel.
 * Les deux sources produisent la même forme d'événement, donc aucune ligne ne
 * s'affiche autrement selon son origine.
 */
export function PulseFeed({
  projetId,
  evenementsInitiaux,
}: {
  projetId: string;
  evenementsInitiaux: EvenementPulse[];
}) {
  const { evenements, connecte } = usePulseTempsReel(projetId, evenementsInitiaux);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span
          data-testid="pulse-connexion"
          data-connecte={connecte}
          aria-hidden="true"
          className={`size-2 rounded-full ${connecte ? 'bg-green-500' : 'bg-black/20 dark:bg-white/25'}`}
        />
        <p className="text-sm opacity-70">
          {connecte ? 'Activité en direct' : 'Connexion au flux en cours…'}
        </p>
      </div>

      {evenements.length === 0 ? (
        <p data-testid="pulse-vide" className="opacity-70">
          Aucune activité pour le moment.
        </p>
      ) : (
        <ol data-testid="pulse-flux" className="flex flex-col gap-2">
          {evenements.map((evenement) => (
            <li
              key={evenement.cle}
              className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-lg border border-black/10 px-4 py-3 text-sm dark:border-white/15"
            >
              <Ligne evenement={evenement} />
              <time dateTime={evenement.survenu_le} className="ml-auto shrink-0 text-xs opacity-50">
                {new Intl.DateTimeFormat('fr-FR', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                }).format(new Date(evenement.survenu_le))}
              </time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Ligne({ evenement }: { evenement: EvenementPulse }) {
  const lien = (
    <Link href={`/tickets/${evenement.ticket_id}`} className="font-medium hover:underline">
      {evenement.titre || 'Ticket'}
    </Link>
  );

  if (evenement.genre === 'soumission') {
    return (
      <p data-testid="pulse-soumission">
        Nouvelle soumission sur {lien}
        {evenement.auteur ? <span className="opacity-70"> par {evenement.auteur}</span> : null}
      </p>
    );
  }

  return (
    <p data-testid="pulse-statut">
      {lien}
      <span className="opacity-70"> est passé à </span>
      <span data-testid="pulse-statut-valeur" className="font-medium">
        {LIBELLES_STATUT[evenement.statut as TicketStatut]}
      </span>
    </p>
  );
}
