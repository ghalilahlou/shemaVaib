'use client';

import { useEffect, useState } from 'react';
import { createBrowserSupabaseClient } from '../../../lib/supabase/client';
import { resoudreAuteursAction } from '../actions/envoyer-message';
import {
  trierEtDedupliquerMessages,
  type ContexteDiscussion,
  type MessageAffiche,
} from '../contexte';

/**
 * Abonnement temps réel d'un fil de discussion.
 *
 * Convention de la section 18 : le hook traduit les charges reçues en objets du
 * domaine et ne porte aucune règle métier. Il ne lit pas non plus la base
 * directement — la charge Realtime ne portant que l'identifiant de l'auteur, le
 * nom est résolu par une Server Action, qui passe par le repository.
 *
 * Ce que le hook reçoit est déjà filtré par la Row Level Security, qui
 * s'applique à la diffusion comme à la lecture. Le filtre par contexte posé
 * ci-dessous n'est qu'un confort d'affichage.
 *
 * L'état ne retient que les messages arrivés par le canal ; la liste affichée
 * est recomposée au rendu à partir du chargement serveur et de ceux-là. Recopier
 * le chargement serveur dans un état aurait figé le tout premier rendu : après
 * un envoi, la revalidation serait restée sans effet et le fil n'aurait plus
 * avancé que par la diffusion — donc pas du tout si le canal n'est pas encore
 * établi.
 */
export function useFilTempsReel(
  contexte: ContexteDiscussion,
  messagesInitiaux: MessageAffiche[],
): { messages: MessageAffiche[]; connecte: boolean } {
  const [recusEnDirect, setRecusEnDirect] = useState<MessageAffiche[]>([]);
  const [connecte, setConnecte] = useState(false);

  const colonne = contexte.genre === 'projet' ? 'projet_id' : 'ticket_id';

  useEffect(() => {
    const client = createBrowserSupabaseClient();

    const canal = client.channel(`fil:${contexte.genre}:${contexte.id}`).on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `${colonne}=eq.${contexte.id}`,
      },
      (charge) => {
        const ligne = charge.new as {
          id?: string;
          contenu?: string;
          cree_le?: string;
          auteur_id?: string | null;
        };

        if (!ligne?.id || !ligne.contenu || !ligne.cree_le) {
          return;
        }

        const arrivant: MessageAffiche = {
          id: ligne.id,
          contenu: ligne.contenu,
          cree_le: ligne.cree_le,
          auteur_id: ligne.auteur_id ?? null,
          auteur_nom: null,
        };

        setRecusEnDirect((precedents) => [...precedents, arrivant]);

        // Le nom arrive dans un second temps : le message s'affiche tout de
        // suite, signé dès que possible.
        if (arrivant.auteur_id) {
          const auteurId = arrivant.auteur_id;

          void resoudreAuteursAction([auteurId]).then((noms) => {
            const nom = noms[auteurId];

            if (!nom) {
              return;
            }

            setRecusEnDirect((precedents) =>
              precedents.map((message) =>
                message.auteur_id === auteurId && message.auteur_nom === null
                  ? { ...message, auteur_nom: nom }
                  : message,
              ),
            );
          });
        }
      },
    );

    canal.subscribe((statut) => {
      setConnecte(statut === 'SUBSCRIBED');
    });

    return () => {
      void client.removeChannel(canal);
    };
  }, [contexte.genre, contexte.id, colonne]);

  return {
    messages: trierEtDedupliquerMessages([...messagesInitiaux, ...recusEnDirect]),
    connecte,
  };
}
