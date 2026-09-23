import Link from 'next/link';
import type { ProjetStatut } from '@schemavibe/shared-types';
import type { ProjectAvecProprietaire } from '../repository/projects-repository';

/** Libellés lisibles des statuts de projet (section 9). */
const LIBELLES_STATUT: Record<ProjetStatut, string> = {
  brouillon: 'Brouillon',
  actif: 'Actif',
  en_pause: 'En pause',
  archive: 'Archivé',
};

export function ProjectCard({ projet }: { projet: ProjectAvecProprietaire }) {
  return (
    <article className="rounded-lg border border-black/10 p-4 dark:border-white/15">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-medium">
          <Link href={`/projets/${projet.id}`} className="hover:underline">
            {projet.nom}
          </Link>
        </h2>
        <span
          className="shrink-0 rounded-full border border-black/10 px-2 py-0.5 text-xs opacity-70 dark:border-white/15"
          data-testid="projet-statut"
        >
          {LIBELLES_STATUT[projet.statut]}
        </span>
      </div>

      {projet.proprietaire ? (
        <p className="mt-1 text-sm opacity-70">Porté par {projet.proprietaire.nom}</p>
      ) : null}

      {projet.repo_url ? (
        <p className="mt-2 font-mono text-xs break-all opacity-60">{projet.repo_url}</p>
      ) : null}
    </article>
  );
}
