import type { TicketStatut } from '@schemavibe/shared-types';

/**
 * Statut d'un ticket (section 10).
 *
 * POURQUOI LE LIBELLÉ N'EST PAS DANS LA COULEUR DU STATUT
 *
 * La couleur ne porte jamais l'information à elle seule. Elle vit dans le point
 * plein ; le libellé, lui, reste en `ink` et tient donc le seuil de 4,5:1 sur
 * n'importe quelle surface. Colorer le texte aurait obligé à retoucher cinq
 * teintes pour un gain nul : le mot « fusionné » dit déjà « fusionné ».
 *
 * La chasse fixe est délibérée : un statut est une valeur littérale, au même
 * titre qu'une référence de ticket.
 */

const LIBELLES: Record<TicketStatut, string> = {
  brouillon: 'Brouillon',
  ouvert: 'Ouvert',
  reclame: 'Réclamé',
  soumis: 'Soumis',
  en_revue: 'En revue',
  fusionne: 'Fusionné',
  ferme: 'Fermé',
};

/**
 * Chaque statut pointe vers sa variable de couleur.
 *
 * `en_revue` et `ferme` n'ont pas de token propre dans la palette : le premier
 * emprunte celui de « soumis », dont il est la suite immédiate, le second celui
 * de « brouillon », qui est l'autre état sans activité.
 */
const COULEURS: Record<TicketStatut, string> = {
  brouillon: 'var(--status-brouillon)',
  ouvert: 'var(--status-ouvert)',
  reclame: 'var(--status-reclame)',
  soumis: 'var(--status-soumis)',
  en_revue: 'var(--status-soumis)',
  fusionne: 'var(--status-fusionne)',
  ferme: 'var(--status-brouillon)',
};

export function StatusBadge({ statut }: { statut: TicketStatut }) {
  return (
    <span
      data-testid="status-badge"
      data-statut={statut}
      className="inline-flex items-center gap-[8px] rounded-[var(--radius-pilule)] border px-[12px] py-[4px] font-mono text-xs"
      style={{
        borderColor: 'var(--border)',
        backgroundColor: 'var(--surface-300)',
        color: 'var(--ink)',
      }}
    >
      <span
        aria-hidden
        data-testid="status-badge-point"
        className="size-[8px] shrink-0 rounded-[var(--radius-pilule)]"
        style={{ backgroundColor: COULEURS[statut] }}
      />
      {LIBELLES[statut]}
    </span>
  );
}

export { LIBELLES as LIBELLES_STATUT, COULEURS as COULEURS_STATUT };
