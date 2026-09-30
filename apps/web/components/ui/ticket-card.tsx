import Link from 'next/link';
import type { TicketComplexite, TicketStatut } from '@schemavibe/shared-types';
import { StatusBadge } from './status-badge';
import { PatternChip } from './pattern-chip';
import { HealthIndicator } from './health-indicator';
import { VibeScoreGauge } from './vibe-score-gauge';
import type { CategoriePattern, EtatSante } from './tokens';

/**
 * Un ticket tel qu'il apparaît dans une liste ou sur une roadmap.
 *
 * Ce composant n'introduit aucune couleur : tout vient des tokens, par les
 * quatre composants qu'il assemble. C'est la contrainte qui lui donne son
 * intérêt — si une teinte manquait au système, elle se verrait ici, sous forme
 * d'une valeur écrite en dur qu'aucun thème ne saurait retourner.
 *
 * La référence du ticket est en chasse fixe : c'est une chaîne qu'on recopie
 * dans une branche, un commit ou une commande, pas une phrase qu'on lit.
 */

export interface PatternAffiche {
  nom: string;
  categorie: CategoriePattern;
}

export interface TicketAffiche {
  id: string;
  reference?: string;
  titre: string;
  statut: TicketStatut;
  complexite?: TicketComplexite | null;
  patterns?: PatternAffiche[];
  /** Santé du jalon qui porte le ticket, quand il en a un. */
  sante?: EtatSante | null;
  /** Vibe Score de la personne qui tient le ticket. `null` tant qu'aucun calcul n'a eu lieu. */
  vibeScore?: number | null;
  /** Absent hors d'un contexte navigable — la page de démonstration, par exemple. */
  href?: string;
}

export function TicketCard({ ticket }: { ticket: TicketAffiche }) {
  const patterns = ticket.patterns ?? [];

  return (
    <article
      data-testid="ticket-card"
      data-statut={ticket.statut}
      className="flex flex-col gap-[16px] rounded-[var(--radius-lg)] border p-[16px]"
      style={{
        borderColor: 'var(--border)',
        backgroundColor: 'var(--surface-200)',
        color: 'var(--ink)',
      }}
    >
      <header className="flex flex-wrap items-start justify-between gap-[12px]">
        <div className="flex min-w-0 flex-col gap-[4px]">
          {ticket.reference ? (
            <span className="font-mono text-xs" style={{ color: 'var(--ink-muted)' }}>
              {ticket.reference}
            </span>
          ) : null}

          <h3 className="text-base leading-snug font-medium">
            {ticket.href ? (
              <Link href={ticket.href} style={{ color: 'var(--ink)' }} className="hover:underline">
                {ticket.titre}
              </Link>
            ) : (
              ticket.titre
            )}
          </h3>
        </div>

        <StatusBadge statut={ticket.statut} />
      </header>

      {patterns.length > 0 ? (
        <ul className="flex flex-wrap gap-[8px]">
          {patterns.map((pattern) => (
            <li key={pattern.nom}>
              <PatternChip nom={pattern.nom} categorie={pattern.categorie} />
            </li>
          ))}
        </ul>
      ) : null}

      <footer className="flex flex-wrap items-end justify-between gap-[16px]">
        <div className="flex items-center gap-[16px]">
          {ticket.complexite ? (
            <span className="font-mono text-xs" style={{ color: 'var(--ink-muted)' }}>
              Complexité {ticket.complexite}
            </span>
          ) : null}

          {ticket.sante ? <HealthIndicator etat={ticket.sante} /> : null}
        </div>

        {ticket.vibeScore !== undefined ? (
          <div className="w-[160px] shrink-0">
            <VibeScoreGauge score={ticket.vibeScore} />
          </div>
        ) : null}
      </footer>
    </article>
  );
}
