import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { TicketStatut } from '@schemavibe/shared-types';
import type { Database } from '../../../lib/supabase/database.types';
import { MAX_EVENEMENTS_PULSE, trierEtDedupliquer, type EvenementPulse } from '../evenement';

/**
 * Chargement initial du pulse d'un projet.
 *
 * Comme partout (section 18), c'est la seule couche de la feature qui appelle
 * `supabase.from(...)`, et le client lui est passé en paramètre : la RLS décide
 * de ce que l'appelant voit, ici comme dans la diffusion temps réel.
 */

/** Erreur remontée quand Supabase refuse ou échoue sur une lecture du pulse. */
export class PulseRepositoryError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'PulseRepositoryError';
  }
}

export async function chargerEvenementsRecents(
  client: SupabaseClient<Database>,
  projetId: string,
): Promise<EvenementPulse[]> {
  const { data: tickets, error: erreurTickets } = await client
    .from('tickets')
    .select('id, titre, statut, maj_le')
    .eq('projet_id', projetId)
    .order('maj_le', { ascending: false })
    .limit(MAX_EVENEMENTS_PULSE);

  if (erreurTickets) {
    throw new PulseRepositoryError('Impossible de charger l’activité des tickets.', erreurTickets);
  }

  const identifiants = (tickets ?? []).map((ticket) => ticket.id);

  // `submissions` ne porte pas de `projet_id` : la restriction passe par les
  // tickets du projet, eux-mêmes déjà filtrés par la RLS.
  const { data: soumissions, error: erreurSoumissions } =
    identifiants.length === 0
      ? { data: [], error: null }
      : await client
          .from('submissions')
          .select('id, ticket_id, cree_le, auteur:users!submissions_auteur_id_fkey(nom)')
          .in('ticket_id', identifiants)
          .order('cree_le', { ascending: false })
          .limit(MAX_EVENEMENTS_PULSE);

  if (erreurSoumissions) {
    throw new PulseRepositoryError(
      'Impossible de charger l’activité des soumissions.',
      erreurSoumissions,
    );
  }

  const titreParTicket = new Map((tickets ?? []).map((ticket) => [ticket.id, ticket.titre]));

  const evenements: EvenementPulse[] = [
    ...(tickets ?? []).map((ticket): EvenementPulse => ({
      genre: 'statut_ticket',
      cle: `ticket:${ticket.id}`,
      survenu_le: ticket.maj_le,
      ticket_id: ticket.id,
      titre: ticket.titre,
      statut: ticket.statut as TicketStatut,
    })),
    ...(
      (soumissions ?? []) as unknown as {
        id: string;
        ticket_id: string;
        cree_le: string;
        auteur: { nom: string } | null;
      }[]
    ).map((soumission): EvenementPulse => ({
      genre: 'soumission',
      cle: `soumission:${soumission.id}`,
      survenu_le: soumission.cree_le,
      ticket_id: soumission.ticket_id,
      titre: titreParTicket.get(soumission.ticket_id) ?? null,
      auteur: soumission.auteur?.nom ?? null,
    })),
  ];

  return trierEtDedupliquer(evenements).slice(0, MAX_EVENEMENTS_PULSE);
}
