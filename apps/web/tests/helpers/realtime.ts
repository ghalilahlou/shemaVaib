import type { RealtimePostgresChangesPayload, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../lib/supabase/database.types';

/**
 * Harnais d'écoute Realtime pour les tests d'intégration.
 *
 * Il règle deux pièges qu'un test d'abonnement rencontre immanquablement.
 *
 * D'abord, il attend que la souscription soit réellement établie avant de
 * déclencher la modification : sans cela, l'absence d'événement ne prouverait
 * rien, elle pourrait venir d'un abonnement arrivé trop tard.
 *
 * Ensuite, il distingue deux façons d'attendre. Un test qui s'attend à recevoir
 * quelque chose attend *jusqu'à* le recevoir — une fenêtre de durée fixe rend le
 * test instable, puisque la latence de diffusion varie d'une exécution à
 * l'autre. Un test qui s'attend à ne rien recevoir, lui, ne peut qu'écouter un
 * moment puis conclure.
 *
 * Enfin — et c'est ce qui manquait — il exige une *amorce*. Le statut
 * `SUBSCRIBED` signale que le canal est ouvert, pas que la réplication a pris
 * l'abonnement en compte : une modification faite juste après peut n'atteindre
 * personne. L'amorce produit un changement volontairement visible et le répète
 * jusqu'à ce qu'il revienne, ce qui prouve que le canal délivre vraiment. Sans
 * elle, un test négatif constaterait un silence dû à un abonnement pas encore
 * actif, et passerait sans rien démontrer.
 */

export interface EvenementRecu {
  table: string;
  type: string;
  ligne: Record<string, unknown>;
}

/** Durée d'écoute quand on cherche à prouver qu'il ne vient rien. */
const DUREE_SILENCE_MS = 2500;

/** Délai au-delà duquel un événement attendu est considéré comme perdu. */
const DELAI_ATTENTE_MS = 10_000;

/** Rend l'objet s'il porte au moins une clé, `null` sinon. */
function nonVide(valeur: unknown): Record<string, unknown> | null {
  if (valeur && typeof valeur === 'object' && Object.keys(valeur).length > 0) {
    return valeur as Record<string, unknown>;
  }
  return null;
}

export interface OptionsEcoute {
  /**
   * Condition d'arrêt. Renseignée, l'écoute s'arrête dès qu'un événement la
   * satisfait ; absente, elle dure le temps du silence à constater.
   */
  jusqua?: (evenement: EvenementRecu) => boolean;
}

/** Intervalle entre deux tentatives d'amorce. */
const INTERVALLE_AMORCE_MS = 400;

/** Nombre maximal de tentatives avant de déclarer le canal muet. */
const TENTATIVES_AMORCE = 25;

export async function ecouter(
  client: SupabaseClient<Database>,
  tables: readonly ('tickets' | 'submissions' | 'messages')[],
  /**
   * Produit un changement que l'abonné a le droit de voir. Répété jusqu'à ce
   * qu'un événement revienne, il atteste que le canal délivre.
   */
  amorce: () => Promise<void>,
  declencheur: () => Promise<void>,
  options: OptionsEcoute = {},
): Promise<EvenementRecu[]> {
  const recus: EvenementRecu[] = [];
  let signalerArrivee: (() => void) | null = null;

  const canal = client.channel(`test-${crypto.randomUUID()}`);

  for (const table of tables) {
    canal.on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      (charge: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
        // `charge.new` et `charge.old` sont des objets *vides* et non `null`
        // quand Realtime n'a pas la version correspondante : un `??` les
        // retiendrait, puisqu'un objet vide est truthy.
        const evenement: EvenementRecu = {
          table,
          type: charge.eventType,
          ligne: nonVide(charge.new) ?? nonVide(charge.old) ?? {},
        };

        recus.push(evenement);

        if (options.jusqua?.(evenement)) {
          signalerArrivee?.();
        }
      },
    );
  }

  await new Promise<void>((resoudre, rejeter) => {
    const minuteur = setTimeout(
      () => rejeter(new Error('Abonnement Realtime non établi.')),
      DELAI_ATTENTE_MS,
    );

    canal.subscribe((statut) => {
      if (statut === 'SUBSCRIBED') {
        clearTimeout(minuteur);
        resoudre();
      } else if (statut === 'CHANNEL_ERROR' || statut === 'TIMED_OUT') {
        clearTimeout(minuteur);
        rejeter(new Error(`Abonnement Realtime en échec : ${statut}`));
      }
    });
  });

  try {
    // Amorçage : on répète un changement visible jusqu'à en recevoir l'écho.
    let amorce_recue = false;
    for (let tentative = 0; tentative < TENTATIVES_AMORCE && !amorce_recue; tentative += 1) {
      await amorce();
      await new Promise((resoudre) => setTimeout(resoudre, INTERVALLE_AMORCE_MS));
      amorce_recue = recus.length > 0;
    }

    if (!amorce_recue) {
      throw new Error(
        'Le canal Realtime n’a délivré aucun événement d’amorce : ' +
          'toute conclusion tirée de ce test serait sans valeur.',
      );
    }

    // Les événements de l'amorce ne regardent pas le test lui-même.
    recus.length = 0;

    const attente = options.jusqua
      ? new Promise<void>((resoudre) => {
          signalerArrivee = resoudre;
          setTimeout(resoudre, DELAI_ATTENTE_MS);
        })
      : new Promise<void>((resoudre) => setTimeout(resoudre, DUREE_SILENCE_MS));

    await declencheur();
    await attente;
  } finally {
    await client.removeChannel(canal);
  }

  return recus;
}
