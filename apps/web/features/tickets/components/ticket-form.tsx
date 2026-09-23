'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { MAX_TICKET_TITLE_LENGTH } from '@schemavibe/shared-types';
import type { PatternResume } from '../repository/tickets-repository';
import { createTicketAction } from '../actions/create-ticket';
import {
  ETAT_INITIAL,
  LIBELLES_MOTIFS,
  type TicketActionState,
} from '../actions/ticket-action-state';

/**
 * Formulaire de création d'un ticket.
 *
 * Il expose les six éléments de la Definition of Ready (section 5.1) et laisse
 * le porteur choisir entre enregistrer un brouillon et publier. La validation
 * fait autorité côté serveur ; le formulaire se contente de restituer ce que la
 * Server Action lui renvoie, motifs de non-conformité compris.
 */
export function TicketForm({
  projetId,
  patterns,
}: {
  projetId: string;
  patterns: PatternResume[];
}) {
  const [etat, action, enCours] = useActionState<TicketActionState, FormData>(
    createTicketAction,
    ETAT_INITIAL,
  );

  const erreursChamps = etat.statut === 'erreur' ? etat.erreursChamps : {};
  const motifs = etat.statut === 'erreur' ? etat.motifs : [];

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="projet_id" value={projetId} />

      {etat.statut === 'erreur' ? (
        <div
          role="alert"
          data-testid="ticket-erreur"
          className="flex flex-col gap-2 rounded-md border border-red-500/40 bg-red-500/5 px-3 py-2 text-sm"
        >
          <p>{etat.message}</p>
          {motifs.length > 0 ? (
            <ul data-testid="ticket-motifs" className="list-disc pl-5">
              {motifs.map((motif) => (
                <li key={motif}>{LIBELLES_MOTIFS[motif]}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {etat.statut === 'succes' ? (
        <p
          role="status"
          data-testid="ticket-succes"
          className="rounded-md border border-green-600/40 bg-green-600/5 px-3 py-2 text-sm"
        >
          {etat.ticketStatut === 'ouvert' ? 'Ticket publié.' : 'Ticket enregistré en brouillon.'}{' '}
          <Link href={`/tickets/${etat.ticketId}`} className="underline">
            Le consulter
          </Link>
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="titre" className="text-sm font-medium">
          Titre
        </label>
        <input
          id="titre"
          name="titre"
          type="text"
          required
          maxLength={MAX_TICKET_TITLE_LENGTH}
          className="rounded-md border border-black/15 px-3 py-2 dark:border-white/20"
        />
        {erreursChamps.titre ? (
          <p className="text-sm text-red-600 dark:text-red-400">{erreursChamps.titre.join(' ')}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="contexte" className="text-sm font-medium">
          Contexte
        </label>
        <textarea
          id="contexte"
          name="contexte"
          rows={3}
          className="rounded-md border border-black/15 px-3 py-2 dark:border-white/20"
        />
        <p className="text-xs opacity-60">
          Ce qui se passe aujourd’hui, et pourquoi c’est un problème.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="criteres_acceptation" className="text-sm font-medium">
          Critères d’acceptation
        </label>
        <textarea
          id="criteres_acceptation"
          name="criteres_acceptation"
          rows={3}
          className="rounded-md border border-black/15 px-3 py-2 dark:border-white/20"
        />
        <p className="text-xs opacity-60">
          Jamais « améliorer X » : ce qui doit être vrai à la fin.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="critere_test" className="text-sm font-medium">
          Critère de test
        </label>
        <textarea
          id="critere_test"
          name="critere_test"
          rows={2}
          className="rounded-md border border-black/15 px-3 py-2 dark:border-white/20"
        />
        <p className="text-xs opacity-60">Ce qui doit passer pour considérer le ticket terminé.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="complexite" className="text-sm font-medium">
          Complexité
        </label>
        <select
          id="complexite"
          name="complexite"
          defaultValue=""
          className="rounded-md border border-black/15 px-3 py-2 dark:border-white/20"
        >
          <option value="">Non estimée</option>
          <option value="S">S — petit</option>
          <option value="M">M — moyen</option>
          <option value="L">L — grand</option>
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="priorite" className="text-sm font-medium">
          Priorité
        </label>
        <select
          id="priorite"
          name="priorite"
          defaultValue="normale"
          className="rounded-md border border-black/15 px-3 py-2 dark:border-white/20"
        >
          <option value="basse">Basse</option>
          <option value="normale">Normale</option>
          <option value="haute">Haute</option>
          <option value="critique">Critique</option>
        </select>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Patterns suggérés</legend>
        {patterns.length === 0 ? (
          <p data-testid="patterns-vides" className="text-sm opacity-60">
            La bibliothèque de patterns est vide : un ticket ne pourra donc pas être publié tant
            qu’elle n’est pas alimentée (ticket SV-008).
          </p>
        ) : (
          <ul data-testid="patterns-disponibles" className="flex flex-col gap-2">
            {patterns.map((pattern) => (
              <li key={pattern.id} className="flex items-start gap-2">
                <input
                  id={`pattern-${pattern.id}`}
                  name="patterns_suggeres"
                  type="checkbox"
                  value={pattern.id}
                  className="mt-1"
                />
                <label htmlFor={`pattern-${pattern.id}`} className="text-sm">
                  <span className="font-medium">{pattern.nom}</span>
                  <span className="opacity-60"> · {pattern.categorie}</span>
                  {pattern.principe ? (
                    <span className="block text-xs opacity-60">{pattern.principe}</span>
                  ) : null}
                </label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <div className="flex items-center gap-2">
        <input id="publier" name="publier" type="checkbox" />
        <label htmlFor="publier" className="text-sm">
          Publier le ticket — exige la Definition of Ready complète
        </label>
      </div>

      <button
        type="submit"
        disabled={enCours}
        className="self-start rounded-md bg-foreground px-4 py-2 text-background disabled:opacity-50"
      >
        {enCours ? 'Enregistrement…' : 'Enregistrer le ticket'}
      </button>
    </form>
  );
}
