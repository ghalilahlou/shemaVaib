'use client';

import { useActionState } from 'react';
import { MAX_PROJECT_NAME_LENGTH } from '@schemavibe/shared-types';
import { createProjectAction } from '../actions/create-project';
import { ETAT_INITIAL, type ProjectActionState } from '../actions/project-action-state';

/**
 * Formulaire de création d'un projet.
 *
 * Il ne valide rien lui-même : la validation fait autorité côté serveur, avec
 * le schéma Zod de `schema.ts` — le même que celui du repository. Le formulaire
 * se contente d'afficher ce que la Server Action lui renvoie.
 */
export function ProjectForm() {
  const [etat, action, enCours] = useActionState<ProjectActionState, FormData>(
    createProjectAction,
    ETAT_INITIAL,
  );

  const erreursChamps = etat.statut === 'erreur' ? etat.erreursChamps : {};

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {etat.statut === 'erreur' ? (
        <p
          role="alert"
          data-testid="formulaire-erreur"
          className="rounded-md border border-red-500/40 bg-red-500/5 px-3 py-2 text-sm"
        >
          {etat.message}
        </p>
      ) : null}

      {etat.statut === 'succes' ? (
        <p
          role="status"
          data-testid="formulaire-succes"
          className="rounded-md border border-green-600/40 bg-green-600/5 px-3 py-2 text-sm"
        >
          Projet créé.
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="nom" className="text-sm font-medium">
          Nom du projet
        </label>
        <input
          id="nom"
          name="nom"
          type="text"
          required
          maxLength={MAX_PROJECT_NAME_LENGTH}
          aria-describedby={erreursChamps.nom ? 'nom-erreur' : undefined}
          className="rounded-md border border-black/15 px-3 py-2 dark:border-white/20"
        />
        {erreursChamps.nom ? (
          <p id="nom-erreur" className="text-sm text-red-600 dark:text-red-400">
            {erreursChamps.nom.join(' ')}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="repo_url" className="text-sm font-medium">
          URL du dépôt <span className="font-normal opacity-60">(facultatif)</span>
        </label>
        <input
          id="repo_url"
          name="repo_url"
          type="url"
          placeholder="https://github.com/…"
          aria-describedby={erreursChamps.repo_url ? 'repo-url-erreur' : undefined}
          className="rounded-md border border-black/15 px-3 py-2 dark:border-white/20"
        />
        {erreursChamps.repo_url ? (
          <p id="repo-url-erreur" className="text-sm text-red-600 dark:text-red-400">
            {erreursChamps.repo_url.join(' ')}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="statut" className="text-sm font-medium">
          Statut
        </label>
        <select
          id="statut"
          name="statut"
          defaultValue="brouillon"
          className="rounded-md border border-black/15 px-3 py-2 dark:border-white/20"
        >
          <option value="brouillon">Brouillon — visible de vous seul</option>
          <option value="actif">Actif — visible de tous</option>
          <option value="en_pause">En pause</option>
          <option value="archive">Archivé</option>
        </select>
      </div>

      <button
        type="submit"
        disabled={enCours}
        className="self-start rounded-md bg-foreground px-4 py-2 text-background disabled:opacity-50"
      >
        {enCours ? 'Création…' : 'Créer le projet'}
      </button>
    </form>
  );
}
