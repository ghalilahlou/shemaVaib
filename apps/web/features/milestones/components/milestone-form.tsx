'use client';

import { useActionState } from 'react';
import { MAX_MILESTONE_THEME_LENGTH } from '@schemavibe/shared-types';
import { creerJalonAction } from '../actions/gerer-jalons';
import { ETAT_INITIAL_JALON, type MilestoneActionState } from '../actions/milestone-action-state';

/**
 * Formulaire de création d'un jalon.
 *
 * Un jalon est un thème, pas une date (section 11) : l'échéance est facultative
 * et le formulaire le dit, plutôt que de laisser croire à un oubli.
 */
export function MilestoneForm({ projetId }: { projetId: string }) {
  const [etat, action, enCours] = useActionState<MilestoneActionState, FormData>(
    creerJalonAction,
    ETAT_INITIAL_JALON,
  );

  const erreursChamps = etat.statut === 'erreur' ? etat.erreursChamps : {};

  return (
    <form
      action={action}
      data-testid="formulaire-jalon"
      className="flex flex-col gap-4 rounded-lg border border-black/10 p-4 dark:border-white/15"
      noValidate
    >
      <input type="hidden" name="projet_id" value={projetId} />

      <h2 className="text-sm font-medium">Nouveau jalon</h2>

      {etat.statut === 'erreur' ? (
        <p
          role="alert"
          data-testid="jalon-erreur"
          className="rounded-md border border-red-500/40 bg-red-500/5 px-3 py-2 text-sm"
        >
          {etat.message}
        </p>
      ) : null}

      {etat.statut === 'succes' ? (
        <p
          role="status"
          data-testid="jalon-succes"
          className="rounded-md border border-green-600/40 bg-green-600/5 px-3 py-2 text-sm"
        >
          {etat.message}
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="theme" className="text-sm font-medium">
          Thème
        </label>
        <input
          id="theme"
          name="theme"
          type="text"
          required
          maxLength={MAX_MILESTONE_THEME_LENGTH}
          placeholder="Sécurisation, Stabilisation…"
          className="rounded-md border border-black/15 px-3 py-2 dark:border-white/20"
        />
        {erreursChamps.theme ? (
          <p className="text-sm text-red-600 dark:text-red-400">{erreursChamps.theme.join(' ')}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="date_cible" className="text-sm font-medium">
          Date cible <span className="font-normal opacity-60">(facultative)</span>
        </label>
        <input
          id="date_cible"
          name="date_cible"
          type="date"
          className="rounded-md border border-black/15 px-3 py-2 dark:border-white/20"
        />
        <p className="text-xs opacity-60">
          Sans échéance, la santé du jalon ne dépend que de son activité récente.
        </p>
        {erreursChamps.date_cible ? (
          <p className="text-sm text-red-600 dark:text-red-400">
            {erreursChamps.date_cible.join(' ')}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={enCours}
        data-testid="creer-jalon"
        className="self-start rounded-md bg-foreground px-4 py-2 text-sm text-background disabled:opacity-50"
      >
        {enCours ? 'Création…' : 'Créer le jalon'}
      </button>
    </form>
  );
}
