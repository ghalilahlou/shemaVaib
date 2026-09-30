import type { Metadata } from 'next';
import type { TicketStatut } from '@schemavibe/shared-types';
import { StatusBadge } from '../../components/ui/status-badge';
import { PatternChip } from '../../components/ui/pattern-chip';
import { HealthIndicator } from '../../components/ui/health-indicator';
import { VibeScoreGauge } from '../../components/ui/vibe-score-gauge';
import { PulseDivider } from '../../components/ui/pulse-divider';
import { TicketCard } from '../../components/ui/ticket-card';
import {
  CATEGORIES_PATTERN,
  ECARTS_DE_PALETTE,
  ETATS_SANTE,
  SURFACES,
  type CategoriePattern,
} from '../../components/ui/tokens';
import { BasculeTheme } from './bascule-theme';

export const metadata: Metadata = {
  title: 'Système de design — SchemaVibe',
};

/**
 * Inventaire des composants partagés (SV-015).
 *
 * Le test de contraste tranche ce qui se calcule ; cette page montre ce qui ne
 * se calcule pas — les proportions, la densité, ce que donnent six pastilles
 * côte à côte. Elle ne lit aucune donnée : tout ce qu'elle affiche est écrit ici,
 * pour qu'un composant cassé se voie même quand la base est vide.
 */

const STATUTS: TicketStatut[] = [
  'brouillon',
  'ouvert',
  'reclame',
  'soumis',
  'en_revue',
  'fusionne',
  'ferme',
];

const PATTERNS: Record<CategoriePattern, string> = {
  planification: 'Spec-First',
  qualite: 'Test-Gated Iteration',
  execution: 'Context Anchoring',
  revue: 'Review-Refine Loop',
  securite: 'Guardrail Prompting',
  orchestration: 'Multi-Agent Orchestration',
};

function Section({
  titre,
  note,
  children,
}: {
  titre: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-[16px]">
      <div className="flex flex-col gap-[4px]">
        <h2 className="text-lg font-medium">{titre}</h2>
        <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>
          {note}
        </p>
      </div>
      {children}
    </section>
  );
}

export default function DesignSystemPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-[48px] px-[24px] py-[48px]">
      <header className="flex flex-wrap items-start justify-between gap-[16px]">
        <div className="flex flex-col gap-[8px]">
          <h1 className="text-2xl font-semibold tracking-tight">Système de design</h1>
          <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>
            Six composants partagés, aucune couleur propre : tout vient des tokens.
          </p>
        </div>
        <BasculeTheme />
      </header>

      <Section titre="Surfaces" note="Du fond le plus profond au plus surélevé.">
        <div className="grid grid-cols-2 gap-[8px] sm:grid-cols-4">
          {SURFACES.map((surface) => (
            <div
              key={surface}
              className="flex flex-col gap-[4px] rounded-[var(--radius-md)] border p-[12px] font-mono text-xs"
              style={{
                borderColor: 'var(--border)',
                backgroundColor: `var(--${surface})`,
                color: 'var(--ink)',
              }}
            >
              <span>{surface}</span>
              <span style={{ color: 'var(--ink-muted)' }}>texte atténué</span>
              <span style={{ color: 'var(--ink-faint)' }}>indication</span>
            </div>
          ))}
        </div>
      </Section>

      <Section
        titre="StatusBadge"
        note="Le point porte la couleur, le libellé porte le sens — jamais la couleur seule."
      >
        <div className="flex flex-wrap gap-[8px]">
          {STATUTS.map((statut) => (
            <StatusBadge key={statut} statut={statut} />
          ))}
        </div>
      </Section>

      <Section
        titre="PatternChip"
        note="Fond neutre et monogramme coloré : six chips côte à côte restent lisibles."
      >
        <div className="flex flex-wrap gap-[8px]">
          {CATEGORIES_PATTERN.map((categorie) => (
            <PatternChip key={categorie} nom={PATTERNS[categorie]} categorie={categorie} />
          ))}
        </div>
      </Section>

      <Section
        titre="HealthIndicator"
        note="Trois états, recalculés à chaque lecture (section 11)."
      >
        <div className="flex flex-wrap gap-[24px]">
          {ETATS_SANTE.map((etat) => (
            <HealthIndicator key={etat} etat={etat} />
          ))}
        </div>
      </Section>

      <Section
        titre="VibeScoreGauge"
        note="Un dégradé continu. L’absence de score se dit, elle ne se dessine pas à zéro."
      >
        <div className="grid gap-[24px] sm:grid-cols-2">
          {[null, 0, 24, 58, 91, 100].map((score, rang) => (
            <VibeScoreGauge key={rang} score={score} />
          ))}
        </div>
      </Section>

      <Section
        titre="PulseDivider"
        note="Un battement marque un moment. Il se joue une fois, puis le trait reste."
      >
        <div className="flex flex-col gap-[24px]">
          <PulseDivider cle="demonstration" />
          <PulseDivider actif={false} label="Aucune activité" />
        </div>
      </Section>

      <Section
        titre="TicketCard"
        note="L’assemblage des quatre précédents, tel qu’affiché en vrai."
      >
        <div className="flex flex-col gap-[16px]">
          <TicketCard
            ticket={{
              id: 'demo-1',
              reference: 'SV-015',
              titre: 'Système de design SchemaVibe',
              statut: 'reclame',
              complexite: 'M',
              sante: 'a_jour',
              vibeScore: 72,
              patterns: [
                { nom: 'Spec-First', categorie: 'planification' },
                { nom: 'Review-Refine Loop', categorie: 'revue' },
              ],
            }}
          />
          <TicketCard
            ticket={{
              id: 'demo-2',
              reference: 'SV-013',
              titre: 'Exclure les fixtures de test du comptage TODO de scan_repo',
              statut: 'ouvert',
              complexite: 'S',
              sante: 'a_risque',
              vibeScore: null,
              patterns: [{ nom: 'Regression Radius', categorie: 'qualite' }],
            }}
          />
          <TicketCard
            ticket={{
              id: 'demo-3',
              titre: 'Un ticket sans référence, sans jalon et sans score',
              statut: 'brouillon',
            }}
          />
        </div>
      </Section>

      <Section
        titre="Écarts de palette"
        note="Cinq valeurs fournies ne tenaient pas le seuil de contraste et ont été ajustées."
      >
        <ul className="flex flex-col gap-[8px] text-sm">
          {ECARTS_DE_PALETTE.map((ecart) => (
            <li
              key={`${ecart.token}-${ecart.theme}`}
              className="rounded-[var(--radius-md)] border p-[12px]"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-200)' }}
            >
              <span className="font-mono text-xs">
                {ecart.token} · {ecart.theme} · {ecart.fourni} → {ecart.retenu}
              </span>
              <p style={{ color: 'var(--ink-muted)' }}>{ecart.motif}</p>
            </li>
          ))}
        </ul>
      </Section>
    </main>
  );
}
