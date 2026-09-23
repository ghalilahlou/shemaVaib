import type { TicketStatut } from '@schemavibe/shared-types';

/**
 * Événements affichés par le pulse d'un projet (section 5.4).
 *
 * Le type est partagé entre le chargement initial, fait côté serveur, et les
 * événements reçus en temps réel : les deux chemins produisent exactement la
 * même forme, ce qui évite qu'une ligne arrivée par abonnement s'affiche
 * autrement qu'une ligne arrivée par requête.
 */

export type EvenementPulse =
  | {
      genre: 'statut_ticket';
      cle: string;
      survenu_le: string;
      ticket_id: string;
      titre: string;
      statut: TicketStatut;
    }
  | {
      genre: 'soumission';
      cle: string;
      survenu_le: string;
      ticket_id: string;
      titre: string | null;
      auteur: string | null;
    };

/** Du plus récent au plus ancien, sans doublon de clé. */
export function trierEtDedupliquer(evenements: EvenementPulse[]): EvenementPulse[] {
  const parCle = new Map<string, EvenementPulse>();

  for (const evenement of evenements) {
    const existant = parCle.get(evenement.cle);

    // À clé égale, la version la plus récente gagne : un ticket qui change
    // deux fois de statut ne doit apparaître qu'une fois, dans son état actuel.
    if (!existant || existant.survenu_le < evenement.survenu_le) {
      parCle.set(evenement.cle, evenement);
    }
  }

  return [...parCle.values()].sort((a, b) => b.survenu_le.localeCompare(a.survenu_le));
}

/** Nombre d'événements conservés à l'écran. */
export const MAX_EVENEMENTS_PULSE = 50;
