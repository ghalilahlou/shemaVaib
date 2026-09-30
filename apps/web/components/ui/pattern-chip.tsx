import type { CategoriePattern } from './tokens';

/**
 * Un pattern de vibe coding, tel qu'il s'affiche rattaché à un ticket
 * (section 5.2).
 *
 * POURQUOI UN FOND NEUTRE
 *
 * Un ticket porte souvent plusieurs patterns, alignés côte à côte. Six aplats
 * saturés côte à côte deviennent illisibles et se disputent l'attention alors
 * qu'aucun n'est plus important qu'un autre. Le fond reste donc `surface-200`,
 * et seul le monogramme circulaire porte la couleur de catégorie : l'œil
 * retrouve la famille d'un coup, sans que la ligne vire au nuancier.
 *
 * Le monogramme est la seule occasion où du texte se lit sur autre chose qu'une
 * surface. Son encre a donc son propre token, et le test de contraste la vérifie
 * contre chacune des six couleurs.
 */

const COULEURS: Record<CategoriePattern, string> = {
  planification: 'var(--pattern-planification)',
  qualite: 'var(--pattern-qualite)',
  execution: 'var(--pattern-execution)',
  revue: 'var(--pattern-revue)',
  securite: 'var(--pattern-securite)',
  orchestration: 'var(--pattern-orchestration)',
};

const LIBELLES_CATEGORIE: Record<CategoriePattern, string> = {
  planification: 'Planification',
  qualite: 'Qualité',
  execution: 'Exécution',
  revue: 'Revue',
  securite: 'Sécurité',
  orchestration: 'Orchestration',
};

/** Première lettre du nom, en capitale — le monogramme du pattern. */
function monogramme(nom: string): string {
  return (nom.trim()[0] ?? '?').toUpperCase();
}

export function PatternChip({ nom, categorie }: { nom: string; categorie: CategoriePattern }) {
  return (
    <span
      data-testid="pattern-chip"
      data-categorie={categorie}
      className="inline-flex items-center gap-[8px] rounded-[var(--radius-pilule)] border py-[4px] pr-[12px] pl-[4px] text-xs"
      style={{
        borderColor: 'var(--border)',
        backgroundColor: 'var(--surface-200)',
        color: 'var(--ink)',
      }}
    >
      <span
        aria-hidden
        data-testid="pattern-chip-monogramme"
        className="inline-flex size-[20px] shrink-0 items-center justify-center rounded-[var(--radius-pilule)] font-mono text-[11px] font-semibold"
        style={{ backgroundColor: COULEURS[categorie], color: 'var(--monogramme-ink)' }}
      >
        {monogramme(nom)}
      </span>
      {nom}
      {/* La catégorie est dite, pas seulement teintée : la couleur du
          monogramme resterait muette pour qui ne la distingue pas. */}
      <span className="sr-only"> — catégorie {LIBELLES_CATEGORIE[categorie]}</span>
    </span>
  );
}

export { COULEURS as COULEURS_PATTERN, LIBELLES_CATEGORIE };
