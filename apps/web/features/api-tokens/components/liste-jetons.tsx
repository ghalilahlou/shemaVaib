import type { JetonAffiche } from '../repository/api-tokens-repository';
import { BoutonRevocation } from './bouton-revocation';

/**
 * Inventaire des jetons d'un compte.
 *
 * La date de dernier usage est la donnée utile ici : c'est elle qui permet de
 * repérer un jeton laissé sur une machine dont on ne se sert plus.
 */

function dateCourte(valeur: string): string {
  return new Date(valeur).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function ListeJetons({ jetons }: { jetons: JetonAffiche[] }) {
  if (jetons.length === 0) {
    return (
      <p data-testid="jetons-vide" className="text-sm opacity-70">
        Aucun jeton pour l’instant.
      </p>
    );
  }

  return (
    <ul data-testid="liste-jetons" className="flex flex-col gap-3">
      {jetons.map((jeton) => (
        <li
          key={jeton.id}
          data-testid="jeton"
          data-revoque={jeton.revoque_le ? 'oui' : 'non'}
          className="flex items-center justify-between gap-4 rounded-md border border-black/10 px-3 py-2 dark:border-white/15"
        >
          <div className="flex flex-col gap-0.5">
            <span className={jeton.revoque_le ? 'text-sm line-through opacity-50' : 'text-sm'}>
              {jeton.libelle}
            </span>
            <span className="text-xs opacity-60">
              Créé le {dateCourte(jeton.cree_le)}
              {jeton.dernier_usage_le
                ? ` · dernier usage le ${dateCourte(jeton.dernier_usage_le)}`
                : ' · jamais utilisé'}
              {jeton.revoque_le ? ` · révoqué le ${dateCourte(jeton.revoque_le)}` : ''}
            </span>
          </div>

          {jeton.revoque_le ? null : <BoutonRevocation jetonId={jeton.id} />}
        </li>
      ))}
    </ul>
  );
}
