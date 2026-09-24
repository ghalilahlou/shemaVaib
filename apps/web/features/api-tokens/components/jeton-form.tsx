'use client';

import { useActionState } from 'react';
import { creerJetonAction } from '../actions/gerer-jetons';
import { ETAT_INITIAL_JETON, type JetonActionState } from '../actions/jeton-action-state';
import { LIBELLE_MAX } from '../schema';

/**
 * Création d'un jeton personnel.
 *
 * Le secret rendu par la Server Action n'est affiché qu'ici et ne survit pas à
 * un rechargement : il n'est stocké nulle part, pas même en mémoire côté
 * serveur. Le dire clairement fait partie du formulaire — un secret perdu ne se
 * retrouve pas, il se remplace.
 */
export function JetonForm() {
  const [etat, action, enCours] = useActionState<JetonActionState, FormData>(
    creerJetonAction,
    ETAT_INITIAL_JETON,
  );

  const erreursChamps = etat.statut === 'erreur' ? etat.erreursChamps : {};

  return (
    <div className="flex flex-col gap-5">
      <form action={action} className="flex flex-col gap-5" noValidate>
        {etat.statut === 'erreur' ? (
          <p
            role="alert"
            data-testid="jeton-erreur"
            className="rounded-md border border-red-500/40 bg-red-500/5 px-3 py-2 text-sm"
          >
            {etat.message}
          </p>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="libelle" className="text-sm font-medium">
            Nom du jeton
          </label>
          <input
            id="libelle"
            name="libelle"
            type="text"
            required
            maxLength={LIBELLE_MAX}
            placeholder="Poste de travail"
            aria-describedby={erreursChamps.libelle ? 'libelle-erreur' : undefined}
            className="rounded-md border border-black/15 px-3 py-2 dark:border-white/20"
          />
          {erreursChamps.libelle ? (
            <p id="libelle-erreur" className="text-sm text-red-600 dark:text-red-400">
              {erreursChamps.libelle.join(' ')}
            </p>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={enCours}
          data-testid="creer-jeton"
          className="self-start rounded-md bg-foreground px-4 py-2 text-background disabled:opacity-50"
        >
          {enCours ? 'Création…' : 'Créer un jeton'}
        </button>
      </form>

      {etat.statut === 'cree' ? (
        <div
          role="status"
          data-testid="jeton-secret"
          className="flex flex-col gap-2 rounded-md border border-green-600/40 bg-green-600/5 px-3 py-3 text-sm"
        >
          <p className="font-medium">Jeton « {etat.libelle} » créé.</p>
          <code className="overflow-x-auto rounded bg-black/5 px-2 py-1 font-mono text-xs dark:bg-white/10">
            {etat.secret}
          </code>
          <p className="opacity-70">
            Copiez-le maintenant : il ne sera plus affiché. Si vous le perdez, révoquez-le et
            créez-en un autre.
          </p>
        </div>
      ) : null}
    </div>
  );
}
