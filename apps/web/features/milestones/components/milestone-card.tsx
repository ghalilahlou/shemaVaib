import type { JalonSante, MilestoneAvecSante } from '@schemavibe/shared-types';

/** Libellés et intention visuelle de chaque santé (section 11). */
const SANTE: Record<JalonSante, { libelle: string; classe: string }> = {
  a_jour: { libelle: 'À jour', classe: 'border-green-600/40 bg-green-600/5' },
  a_risque: { libelle: 'À risque', classe: 'border-amber-500/40 bg-amber-500/5' },
  bloque: { libelle: 'Bloqué', classe: 'border-red-500/40 bg-red-500/5' },
};

/**
 * Un jalon, sa progression et sa santé.
 *
 * La santé est expliquée plutôt qu'affirmée : un indicateur rouge sans motif
 * n'aide personne à décider quoi faire.
 */
export function MilestoneCard({ jalon }: { jalon: MilestoneAvecSante }) {
  const sante = SANTE[jalon.sante];
  const dateCible = jalon.date_cible
    ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(jalon.date_cible))
    : null;

  return (
    <article className="flex flex-col gap-3 rounded-lg border border-black/10 p-4 dark:border-white/15">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="font-medium">{jalon.theme}</h3>
        <span
          data-testid="jalon-sante"
          className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${sante.classe}`}
        >
          {sante.libelle}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <div
          className="h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/15"
          role="progressbar"
          aria-valuenow={jalon.progression}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Progression du jalon ${jalon.theme}`}
        >
          <div className="h-full bg-foreground" style={{ width: `${jalon.progression}%` }} />
        </div>
        <p className="text-sm opacity-70">
          <span data-testid="jalon-progression">{jalon.progression} %</span>
          {' · '}
          {jalon.tickets_acheves} sur {jalon.tickets_total}{' '}
          {jalon.tickets_total > 1 ? 'tickets' : 'ticket'}
        </p>
      </div>

      <p className="text-xs opacity-60">
        {dateCible ? `Échéance : ${dateCible}` : 'Sans échéance'}
        {jalon.jours_inactivite !== null
          ? ` · dernière activité il y a ${jalon.jours_inactivite} ${
              jalon.jours_inactivite > 1 ? 'jours' : 'jour'
            }`
          : ' · aucun ticket rattaché'}
      </p>
    </article>
  );
}
