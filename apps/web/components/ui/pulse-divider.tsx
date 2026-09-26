/**
 * Ligne de pouls : un battement traverse le trait, puis repart.
 *
 * POURQUOI ELLE NE BAT PAS EN PERMANENCE
 *
 * Un mouvement continu cesse d'être un signal au bout de quelques secondes : il
 * devient un décor, et la prochaine fois que quelque chose arrive réellement,
 * personne ne le remarque. Le battement est donc réservé à un moment — le
 * dashboard qui s'ouvre, un abonnement Realtime qui vient de s'établir, un
 * événement qui vient d'arriver — et se joue une fois.
 *
 * C'est aussi la raison de `cle` : React ne rejoue pas une animation CSS sur un
 * élément qu'il réutilise. Changer la clé à chaque événement remonte le
 * composant, et le battement repart. Sans cela, seul le tout premier serait
 * visible.
 *
 * Le trait lui-même ne bouge jamais : il reste lisible quand l'animation est
 * désactivée, ce qui est le cas dès qu'un système demande moins de mouvement.
 */
export function PulseDivider({
  actif = true,
  cle,
  label = 'Activité en direct',
}: {
  /** `false` laisse un simple filet, sans battement. */
  actif?: boolean;
  /** Change à chaque événement pour relancer le battement. */
  cle?: string | number;
  label?: string;
}) {
  return (
    <div
      data-testid="pulse-divider"
      data-actif={actif ? 'oui' : 'non'}
      role="separator"
      aria-label={label}
      className="relative h-[2px] w-full overflow-hidden"
      style={{ backgroundColor: 'var(--border)' }}
    >
      {actif ? (
        <span
          key={cle}
          aria-hidden
          data-testid="pulse-divider-battement"
          className="schemavibe-battement absolute inset-y-0 left-0 w-1/3"
          style={{
            backgroundImage:
              'linear-gradient(90deg, transparent 0%, var(--brand-strong) 50%, transparent 100%)',
          }}
        />
      ) : null}
    </div>
  );
}
