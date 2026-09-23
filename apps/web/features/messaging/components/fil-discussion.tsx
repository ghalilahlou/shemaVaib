'use client';

import { useActionState, useEffect, useRef } from 'react';
import { MAX_MESSAGE_LENGTH } from '@schemavibe/shared-types';
import { envoyerMessageAction } from '../actions/envoyer-message';
import { ETAT_INITIAL_MESSAGE, type MessageActionState } from '../actions/message-action-state';
import type { ContexteDiscussion, MessageAffiche } from '../contexte';
import { useFilTempsReel } from '../realtime/use-fil-temps-reel';

/**
 * Un fil de discussion, qu'il s'agisse du canal d'un projet ou du fil d'un
 * ticket (section 12). Un seul composant pour les deux : la différence tient
 * au contexte passé, pas au comportement.
 */
export function FilDiscussion({
  contexte,
  messagesInitiaux,
  peutEcrire,
  titre,
}: {
  contexte: ContexteDiscussion;
  messagesInitiaux: MessageAffiche[];
  peutEcrire: boolean;
  titre: string;
}) {
  const { messages, connecte } = useFilTempsReel(contexte, messagesInitiaux);

  const [etat, action, enCours] = useActionState<MessageActionState, FormData>(
    envoyerMessageAction,
    ETAT_INITIAL_MESSAGE,
  );

  const champ = useRef<HTMLTextAreaElement>(null);

  // Le champ se vide une fois le message parti : le laisser rempli donnerait
  // l'impression d'un envoi manqué.
  useEffect(() => {
    if (etat.statut === 'succes' && champ.current) {
      champ.current.value = '';
    }
  }, [etat]);

  const erreursChamps = etat.statut === 'erreur' ? etat.erreursChamps : {};

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-medium">{titre}</h2>
        <span
          data-testid="fil-connexion"
          data-connecte={connecte}
          aria-hidden="true"
          className={`size-2 rounded-full ${connecte ? 'bg-green-500' : 'bg-black/20 dark:bg-white/25'}`}
        />
      </div>

      {messages.length === 0 ? (
        <p data-testid="fil-vide" className="text-sm opacity-70">
          Aucun message pour le moment.
        </p>
      ) : (
        <ol data-testid="fil-messages" className="flex flex-col gap-3">
          {messages.map((message) => (
            <li
              key={message.id}
              className="flex flex-col gap-1 rounded-lg border border-black/10 px-4 py-3 dark:border-white/15"
            >
              <p className="text-xs opacity-60">
                <span data-testid="message-auteur">{message.auteur_nom ?? 'Contributeur'}</span>
                {' · '}
                <time dateTime={message.cree_le}>
                  {new Intl.DateTimeFormat('fr-FR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  }).format(new Date(message.cree_le))}
                </time>
              </p>
              <p data-testid="message-contenu" className="text-sm whitespace-pre-line">
                {message.contenu}
              </p>
            </li>
          ))}
        </ol>
      )}

      {peutEcrire ? (
        <form
          action={action}
          data-testid="formulaire-message"
          className="flex flex-col gap-2"
          noValidate
        >
          <input type="hidden" name="genre" value={contexte.genre} />
          <input type="hidden" name="contexte_id" value={contexte.id} />

          <label htmlFor="contenu" className="sr-only">
            Votre message
          </label>
          <textarea
            ref={champ}
            id="contenu"
            name="contenu"
            rows={3}
            required
            maxLength={MAX_MESSAGE_LENGTH}
            placeholder="Écrire un message…"
            className="rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/20"
          />

          {etat.statut === 'erreur' ? (
            <p
              role="alert"
              data-testid="message-erreur"
              className="rounded-md border border-red-500/40 bg-red-500/5 px-3 py-2 text-sm"
            >
              {etat.message}
              {erreursChamps.contenu ? ` ${erreursChamps.contenu.join(' ')}` : null}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={enCours}
            data-testid="envoyer-message"
            className="self-start rounded-md bg-foreground px-4 py-2 text-sm text-background disabled:opacity-50"
          >
            {enCours ? 'Envoi…' : 'Envoyer'}
          </button>
        </form>
      ) : (
        <p data-testid="fil-lecture-seule" className="text-sm opacity-60">
          Connectez-vous pour participer à la discussion.
        </p>
      )}
    </section>
  );
}
