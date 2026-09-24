'use client';

import { useActionState } from 'react';
import { revoquerJetonAction } from '../actions/gerer-jetons';
import { ETAT_INITIAL_REVOCATION, type RevocationActionState } from '../actions/jeton-action-state';

/** Révocation d'un jeton, une ligne à la fois. */
export function BoutonRevocation({ jetonId }: { jetonId: string }) {
  const [etat, action, enCours] = useActionState<RevocationActionState, FormData>(
    revoquerJetonAction,
    ETAT_INITIAL_REVOCATION,
  );

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="jeton_id" value={jetonId} />

      {etat.statut === 'erreur' ? (
        <span role="alert" className="text-xs text-red-600 dark:text-red-400">
          {etat.message}
        </span>
      ) : null}

      <button
        type="submit"
        disabled={enCours}
        data-testid="revoquer-jeton"
        className="rounded-md border border-black/15 px-3 py-1 text-sm disabled:opacity-50 dark:border-white/20"
      >
        {enCours ? 'Révocation…' : 'Révoquer'}
      </button>
    </form>
  );
}
