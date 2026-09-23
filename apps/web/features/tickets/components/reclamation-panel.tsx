'use client';

import { useActionState } from 'react';
import { reclamerTicketAction, relacherTicketAction } from '../actions/reclamer-ticket';
import {
  ETAT_INITIAL_RECLAMATION,
  type ReclamationActionState,
} from '../actions/reclamation-action-state';

/**
 * Bandeau de réclamation affiché sur la page d'un ticket.
 *
 * Il ne décide de rien : c'est la base qui arbitre, et le bandeau se contente
 * d'offrir l'action possible et de restituer le refus éventuel. Un ticket peut
 * très bien avoir été réclamé entre le rendu de la page et le clic — c'est
 * exactement le cas que le message d'erreur doit rendre compréhensible.
 */
export function ReclamationPanel({
  ticketId,
  statut,
  nomReclamant,
  peutReclamer,
  peutRelacher,
}: {
  ticketId: string;
  statut: string;
  nomReclamant: string | null;
  peutReclamer: boolean;
  peutRelacher: boolean;
}) {
  const [etatReclamation, reclamer, reclamationEnCours] = useActionState<
    ReclamationActionState,
    FormData
  >(reclamerTicketAction, ETAT_INITIAL_RECLAMATION);

  const [etatRelachement, relacher, relachementEnCours] = useActionState<
    ReclamationActionState,
    FormData
  >(relacherTicketAction, ETAT_INITIAL_RECLAMATION);

  const erreur =
    etatReclamation.statut === 'erreur'
      ? etatReclamation.message
      : etatRelachement.statut === 'erreur'
        ? etatRelachement.message
        : null;

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-black/10 p-4 dark:border-white/15">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm" data-testid="reclamation-etat">
          {statut === 'reclame' && nomReclamant
            ? `Réclamé par ${nomReclamant}.`
            : statut === 'ouvert'
              ? 'Ce ticket est ouvert : personne ne l’a encore réclamé.'
              : 'Ce ticket n’est pas réclamable en l’état.'}
        </p>

        {peutReclamer ? (
          <form action={reclamer}>
            <input type="hidden" name="ticket_id" value={ticketId} />
            <button
              type="submit"
              disabled={reclamationEnCours}
              data-testid="reclamer"
              className="rounded-md bg-foreground px-3 py-1.5 text-sm text-background disabled:opacity-50"
            >
              {reclamationEnCours ? 'Réclamation…' : 'Réclamer ce ticket'}
            </button>
          </form>
        ) : null}

        {peutRelacher ? (
          <form action={relacher}>
            <input type="hidden" name="ticket_id" value={ticketId} />
            <button
              type="submit"
              disabled={relachementEnCours}
              data-testid="relacher"
              className="rounded-md border border-black/15 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-white/20"
            >
              {relachementEnCours ? 'Libération…' : 'Relâcher ce ticket'}
            </button>
          </form>
        ) : null}
      </div>

      {erreur ? (
        <p
          role="alert"
          data-testid="reclamation-erreur"
          className="rounded-md border border-red-500/40 bg-red-500/5 px-3 py-2 text-sm"
        >
          {erreur}
        </p>
      ) : null}
    </section>
  );
}
