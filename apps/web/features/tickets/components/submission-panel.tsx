'use client';

import { useActionState } from 'react';
import { soumettreSolutionAction } from '../actions/soumettre-solution';
import {
  ETAT_INITIAL_SOUMISSION,
  type SoumissionActionState,
} from '../actions/soumission-action-state';
import type { SoumissionAvecAuteur } from '../repository/tickets-repository';

/**
 * Soumissions d'un ticket : l'historique, et le formulaire d'envoi quand
 * l'utilisateur est le réclamant courant.
 *
 * Plusieurs soumissions coexistent volontairement : la boucle Review-Refine
 * (section 5.2) suppose qu'on repasse, et l'historique des tentatives fait
 * partie de ce qu'un ticket expose (section 5.1).
 */
export function SubmissionPanel({
  ticketId,
  soumissions,
  peutSoumettre,
}: {
  ticketId: string;
  soumissions: SoumissionAvecAuteur[];
  peutSoumettre: boolean;
}) {
  const [etat, action, enCours] = useActionState<SoumissionActionState, FormData>(
    soumettreSolutionAction,
    ETAT_INITIAL_SOUMISSION,
  );

  const erreursChamps = etat.statut === 'erreur' ? etat.erreursChamps : {};

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-medium">
        Soumissions
        {soumissions.length > 0 ? (
          <span className="ml-2 text-sm font-normal opacity-60">({soumissions.length})</span>
        ) : null}
      </h2>

      {soumissions.length === 0 ? (
        <p data-testid="soumissions-vide" className="text-sm opacity-70">
          Aucune solution soumise pour le moment.
        </p>
      ) : (
        <ol data-testid="soumissions-liste" className="flex flex-col gap-3">
          {soumissions.map((soumission, index) => (
            <li
              key={soumission.id}
              className="flex flex-col gap-1.5 rounded-lg border border-black/10 p-4 dark:border-white/15"
            >
              <p className="text-sm">
                <span className="font-medium">Tentative {soumissions.length - index}</span>
                {soumission.auteur ? (
                  <span className="opacity-70"> · par {soumission.auteur.nom}</span>
                ) : null}
                <span className="opacity-60">
                  {' · '}
                  {new Intl.DateTimeFormat('fr-FR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  }).format(new Date(soumission.cree_le))}
                </span>
              </p>

              <p className="flex flex-wrap gap-3 font-mono text-xs">
                {soumission.diff_url ? (
                  <a
                    href={soumission.diff_url}
                    rel="noreferrer noopener"
                    target="_blank"
                    className="break-all hover:underline"
                  >
                    Diff
                  </a>
                ) : null}
                {soumission.preview_url ? (
                  <a
                    href={soumission.preview_url}
                    rel="noreferrer noopener"
                    target="_blank"
                    className="break-all hover:underline"
                  >
                    Aperçu live
                  </a>
                ) : null}
              </p>

              {soumission.resume_md ? (
                <p
                  data-testid="soumission-resume"
                  className="mt-1 text-sm whitespace-pre-line opacity-80"
                >
                  {soumission.resume_md}
                </p>
              ) : null}

              {/* Le résultat qualité reste vide : aucune porte automatisée
                  n'existe encore (section 5.6). Le dire vaut mieux que de
                  laisser croire à une vérification qui n'a pas eu lieu. */}
              <p className="text-xs opacity-50">
                Contrôle qualité :{' '}
                {soumission.resultat_qualite === 'en_attente'
                  ? 'en attente — aucune porte automatisée n’est encore branchée'
                  : soumission.resultat_qualite}
              </p>
            </li>
          ))}
        </ol>
      )}

      {peutSoumettre ? (
        <form
          action={action}
          data-testid="formulaire-soumission"
          className="flex flex-col gap-4 rounded-lg border border-black/10 p-4 dark:border-white/15"
          noValidate
        >
          <input type="hidden" name="ticket_id" value={ticketId} />

          <h3 className="text-sm font-medium">Soumettre une solution</h3>

          {etat.statut === 'erreur' ? (
            <p
              role="alert"
              data-testid="soumission-erreur"
              className="rounded-md border border-red-500/40 bg-red-500/5 px-3 py-2 text-sm"
            >
              {etat.message}
            </p>
          ) : null}

          {etat.statut === 'succes' ? (
            <p
              role="status"
              data-testid="soumission-succes"
              className="rounded-md border border-green-600/40 bg-green-600/5 px-3 py-2 text-sm"
            >
              Solution soumise.
            </p>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="diff_url" className="text-sm font-medium">
              Lien vers le diff
            </label>
            <input
              id="diff_url"
              name="diff_url"
              type="url"
              required
              placeholder="https://github.com/…/pull/42/files"
              className="rounded-md border border-black/15 px-3 py-2 dark:border-white/20"
            />
            {erreursChamps.diff_url ? (
              <p className="text-sm text-red-600 dark:text-red-400">
                {erreursChamps.diff_url.join(' ')}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="preview_url" className="text-sm font-medium">
              Lien vers l’aperçu live
            </label>
            <input
              id="preview_url"
              name="preview_url"
              type="url"
              required
              placeholder="https://…"
              className="rounded-md border border-black/15 px-3 py-2 dark:border-white/20"
            />
            {erreursChamps.preview_url ? (
              <p className="text-sm text-red-600 dark:text-red-400">
                {erreursChamps.preview_url.join(' ')}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="resume_md" className="text-sm font-medium">
              Résumé <span className="font-normal opacity-60">(facultatif)</span>
            </label>
            <textarea
              id="resume_md"
              name="resume_md"
              rows={4}
              className="rounded-md border border-black/15 px-3 py-2 font-mono text-sm dark:border-white/20"
            />
            <p className="text-xs opacity-60">
              Fichiers modifiés, décisions prises, tests ajoutés. Sa génération automatique viendra
              avec le serveur MCP.
            </p>
          </div>

          <button
            type="submit"
            disabled={enCours}
            data-testid="soumettre"
            className="self-start rounded-md bg-foreground px-4 py-2 text-sm text-background disabled:opacity-50"
          >
            {enCours ? 'Envoi…' : 'Soumettre'}
          </button>
        </form>
      ) : null}
    </section>
  );
}
