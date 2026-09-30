import type { EtatSante } from './tokens';

/**
 * Santé d'un jalon (section 11).
 *
 * POURQUOI AUCUNE MÉMOÏSATION
 *
 * La santé dépend du temps écoulé depuis la dernière activité : un jalon bascule
 * « à risque » au bout de sept jours alors que rien ne s'est produit. C'est déjà
 * la raison pour laquelle elle n'est pas une colonne mais une vue calculée à la
 * lecture (SV-009). Mettre en cache son affichage ici rétablirait exactement le
 * défaut que cette décision avait écarté, un étage plus haut : le composant
 * rendrait une valeur juste au moment où on l'a calculée, et fausse ensuite.
 *
 * Il ne reçoit donc que l'état, sans jamais le déduire ni le retenir.
 */

const LIBELLES: Record<EtatSante, string> = {
  a_jour: 'À jour',
  a_risque: 'À risque',
  bloque: 'Bloqué',
};

const COULEURS: Record<EtatSante, string> = {
  a_jour: 'var(--health-a-jour)',
  a_risque: 'var(--health-a-risque)',
  bloque: 'var(--health-bloque)',
};

/**
 * Trois formes, une par état.
 *
 * Le trait qui traverse le cercle bloqué et le demi-cercle du risque disent
 * l'état sans la couleur — même exigence que pour le statut d'un ticket.
 */
const FORMES: Record<EtatSante, string> = {
  a_jour: '●',
  a_risque: '◐',
  bloque: '◼',
};

export function HealthIndicator({ etat }: { etat: EtatSante }) {
  return (
    <span
      data-testid="health-indicator"
      data-etat={etat}
      className="inline-flex items-center gap-[8px] font-mono text-xs"
      style={{ color: 'var(--ink)' }}
    >
      <span aria-hidden className="text-sm leading-none" style={{ color: COULEURS[etat] }}>
        {FORMES[etat]}
      </span>
      {LIBELLES[etat]}
    </span>
  );
}

export { LIBELLES as LIBELLES_SANTE, COULEURS as COULEURS_SANTE };
