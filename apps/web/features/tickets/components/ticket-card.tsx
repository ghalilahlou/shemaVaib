import Link from 'next/link';
import type { TicketComplexite, TicketStatut } from '@schemavibe/shared-types';
import type { TicketDetaille } from '../repository/tickets-repository';

/** Libellés lisibles du cycle de vie d'un ticket (section 10). */
export const LIBELLES_STATUT: Record<TicketStatut, string> = {
  brouillon: 'Brouillon',
  ouvert: 'Ouvert',
  reclame: 'Réclamé',
  en_revue: 'En revue',
  fusionne: 'Fusionné',
  ferme: 'Fermé',
};

export const LIBELLES_COMPLEXITE: Record<TicketComplexite, string> = {
  S: 'S — petit',
  M: 'M — moyen',
  L: 'L — grand',
};

export function TicketCard({ ticket }: { ticket: TicketDetaille }) {
  return (
    <article className="rounded-lg border border-black/10 p-4 dark:border-white/15">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-medium">
          <Link href={`/tickets/${ticket.id}`} className="hover:underline">
            {ticket.titre}
          </Link>
        </h3>
        <span
          data-testid="ticket-statut"
          className="shrink-0 rounded-full border border-black/10 px-2 py-0.5 text-xs opacity-70 dark:border-white/15"
        >
          {LIBELLES_STATUT[ticket.statut]}
        </span>
      </div>

      <p className="mt-1 text-sm opacity-70">
        {ticket.projet ? (
          <Link href={`/projets/${ticket.projet.id}`} className="hover:underline">
            {ticket.projet.nom}
          </Link>
        ) : null}
        {ticket.complexite ? ` · ${ticket.complexite}` : null}
      </p>

      {ticket.patterns_suggeres.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {ticket.patterns_suggeres.map((pattern) => (
            <li
              key={pattern.id}
              className="rounded border border-black/10 px-1.5 py-0.5 text-xs opacity-70 dark:border-white/15"
            >
              {pattern.nom}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
