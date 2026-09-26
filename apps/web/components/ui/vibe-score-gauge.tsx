/**
 * Jauge de Vibe Score (section 16).
 *
 * POURQUOI UN DÉGRADÉ CONTINU ET NON TROIS SEGMENTS
 *
 * Trois paliers inventeraient des seuils que la section 16 ne définit pas, et
 * feraient sauter la couleur d'un cran à un point précis — 66 serait orange, 67
 * bleu. Le score est une grandeur continue : sa représentation l'est aussi. Les
 * trois tokens `vibe-score-*` sont les bornes du dégradé, pas des catégories.
 *
 * POURQUOI NULL N'EST PAS ZÉRO
 *
 * Un contributeur sans historique n'a pas un score de zéro, il n'a pas encore de
 * score — c'est déjà ce que dit la colonne, qui reste `NULL` tant qu'aucun calcul
 * n'a eu lieu. Afficher une jauge vide à zéro lui attribuerait la pire note
 * possible sur la foi d'une absence de données.
 */

export const SCORE_MIN = 0;
export const SCORE_MAX = 100;

/** Dégradé des trois bornes, du gris de départ au bleu de marque. */
const DEGRADE =
  'linear-gradient(90deg, var(--vibe-score-low) 0%, var(--vibe-score-mid) 50%, var(--vibe-score-high) 100%)';

export function VibeScoreGauge({ score }: { score: number | null }) {
  const absent = score === null;
  const borne = absent ? 0 : Math.min(SCORE_MAX, Math.max(SCORE_MIN, score));

  return (
    <div
      data-testid="vibe-score-gauge"
      data-score={absent ? 'absent' : borne}
      className="flex flex-col gap-[4px]"
    >
      <div className="flex items-baseline justify-between gap-[12px]">
        <span className="text-xs" style={{ color: 'var(--ink-muted)' }}>
          Vibe Score
        </span>
        <span
          className="font-mono text-xs"
          style={{ color: absent ? 'var(--ink-faint)' : 'var(--ink)' }}
        >
          {absent ? 'pas encore de score' : borne.toFixed(0)}
        </span>
      </div>

      {/* Une piste vide, et non un remplissage de largeur nulle : l'absence de
          score ne se dessine pas, elle se dit. Sans score il n'y a rien à
          mesurer, donc pas de `meter` non plus : un meter sans `aria-valuenow`
          est invalide, et en forger un — zéro, ou la borne basse — annoncerait
          une mesure qui n'existe pas. La piste devient alors décorative, et
          c'est le texte au-dessus qui porte l'information. */}
      {absent ? (
        <div
          aria-hidden="true"
          data-testid="vibe-score-piste"
          className="h-[8px] w-full overflow-hidden rounded-[var(--radius-pilule)]"
          style={{ backgroundColor: 'var(--surface-300)' }}
        />
      ) : (
        <div
          role="meter"
          aria-label="Vibe Score"
          aria-valuemin={SCORE_MIN}
          aria-valuemax={SCORE_MAX}
          aria-valuenow={borne}
          data-testid="vibe-score-piste"
          className="h-[8px] w-full overflow-hidden rounded-[var(--radius-pilule)]"
          style={{ backgroundColor: 'var(--surface-300)' }}
        >
          <div
            data-testid="vibe-score-remplissage"
            className="h-full rounded-[var(--radius-pilule)]"
            style={{
              width: `${borne}%`,
              backgroundImage: DEGRADE,
              // Le dégradé est étiré à la largeur de la *piste*, pas à celle du
              // remplissage : sans cela, un score de 20 afficherait le dégradé
              // entier comprimé, et la couleur d'un score donné dépendrait du
              // score lui-même au lieu de le représenter.
              backgroundSize: `${borne > 0 ? (SCORE_MAX / borne) * 100 : 100}% 100%`,
            }}
          />
        </div>
      )}
    </div>
  );
}
