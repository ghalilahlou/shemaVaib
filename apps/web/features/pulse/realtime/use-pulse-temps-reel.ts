'use client';

import { useEffect, useState } from 'react';
import type { TicketStatut } from '@schemavibe/shared-types';
import { createBrowserSupabaseClient } from '../../../lib/supabase/client';
import { MAX_EVENEMENTS_PULSE, trierEtDedupliquer, type EvenementPulse } from '../evenement';

/**
 * Abonnement temps réel du pulse d'un projet.
 *
 * Convention (section 18) : la logique d'abonnement vit dans `realtime/` au sein
 * de la feature, sous forme de hook client. Elle traduit les charges reçues en
 * événements du domaine et ne porte aucune règle métier — celles-ci restent dans
 * la base et dans le repository, qui sont les seuls à faire autorité.
 *
 * Point de sécurité : ce que le hook reçoit est déjà filtré par la Row Level
 * Security, qui s'applique à la diffusion comme à la lecture. Le filtre par
 * projet posé ci-dessous n'est qu'un confort — il évite de traiter des
 * événements sans rapport — et ne doit jamais être pris pour une barrière de
 * confidentialité.
 */
export function usePulseTempsReel(
  projetId: string,
  evenementsInitiaux: EvenementPulse[],
): { evenements: EvenementPulse[]; connecte: boolean } {
  const [evenements, setEvenements] = useState(evenementsInitiaux);
  const [connecte, setConnecte] = useState(false);

  useEffect(() => {
    const client = createBrowserSupabaseClient();

    // Les titres des tickets déjà connus servent à libeller une soumission sans
    // refaire un aller-retour ; `submissions` ne porte pas le titre du ticket.
    const titres = new Map(
      evenementsInitiaux
        .filter((evenement) => evenement.titre !== null)
        .map((evenement) => [evenement.ticket_id, evenement.titre as string]),
    );

    const ajouter = (evenement: EvenementPulse) => {
      setEvenements((precedents) =>
        trierEtDedupliquer([...precedents, evenement]).slice(0, MAX_EVENEMENTS_PULSE),
      );
    };

    const canal = client
      .channel(`pulse:${projetId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tickets',
          filter: `projet_id=eq.${projetId}`,
        },
        (charge) => {
          const ligne = charge.new as {
            id?: string;
            titre?: string;
            statut?: TicketStatut;
            maj_le?: string;
          };

          if (!ligne?.id || !ligne.statut || !ligne.maj_le) {
            return;
          }

          titres.set(ligne.id, ligne.titre ?? '');

          ajouter({
            genre: 'statut_ticket',
            cle: `ticket:${ligne.id}`,
            survenu_le: ligne.maj_le,
            ticket_id: ligne.id,
            titre: ligne.titre ?? '',
            statut: ligne.statut,
          });
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'submissions' },
        (charge) => {
          const ligne = charge.new as { id?: string; ticket_id?: string; cree_le?: string };

          // Aucun filtre serveur possible ici : `submissions` ne porte pas de
          // `projet_id`. On écarte donc côté client ce qui concerne un ticket
          // étranger au projet affiché.
          if (!ligne?.id || !ligne.ticket_id || !ligne.cree_le || !titres.has(ligne.ticket_id)) {
            return;
          }

          ajouter({
            genre: 'soumission',
            cle: `soumission:${ligne.id}`,
            survenu_le: ligne.cree_le,
            ticket_id: ligne.ticket_id,
            titre: titres.get(ligne.ticket_id) ?? null,
            auteur: null,
          });
        },
      );

    canal.subscribe((statut) => {
      setConnecte(statut === 'SUBSCRIBED');
    });

    return () => {
      void client.removeChannel(canal);
    };
    // `evenementsInitiaux` ne sert qu'à amorcer la table des titres : le
    // réabonner à chaque rendu couperait le canal sans raison.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projetId]);

  return { evenements, connecte };
}
