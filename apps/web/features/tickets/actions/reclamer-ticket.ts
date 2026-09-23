'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '../../../lib/supabase/server';
import {
  reclamerTicket,
  relacherTicket,
  TicketReclamationError,
} from '../repository/tickets-repository';
import {
  MESSAGE_AUTHENTIFICATION_REQUISE_RECLAMATION,
  MESSAGE_DEVANCE,
  MESSAGE_RELACHEMENT_REFUSE,
  type ReclamationActionState,
} from './reclamation-action-state';

/**
 * Server Actions de réclamation et de relâchement d'un ticket.
 *
 * Toute la logique de concurrence vit dans la base (voir la migration
 * `20260924000000_reclamer_un_ticket.sql`) : ces actions ne font qu'orchestrer,
 * et traduire le refus en un message qui dit à l'utilisateur ce qui s'est passé.
 */

async function executer(
  ticketId: string,
  operation: 'reclamer' | 'relacher',
): Promise<ReclamationActionState> {
  const client = await createServerSupabaseClient();

  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    return { statut: 'erreur', message: MESSAGE_AUTHENTIFICATION_REQUISE_RECLAMATION };
  }

  try {
    if (operation === 'reclamer') {
      await reclamerTicket(client, ticketId);
    } else {
      await relacherTicket(client, ticketId);
    }

    revalidatePath(`/tickets/${ticketId}`);
    revalidatePath('/tickets');

    return { statut: 'succes' };
  } catch (erreur) {
    if (erreur instanceof TicketReclamationError) {
      return {
        statut: 'erreur',
        message:
          erreur.motif === 'authentification_requise'
            ? MESSAGE_AUTHENTIFICATION_REQUISE_RECLAMATION
            : operation === 'reclamer'
              ? MESSAGE_DEVANCE
              : MESSAGE_RELACHEMENT_REFUSE,
      };
    }

    return { statut: 'erreur', message: 'Une erreur inattendue est survenue.' };
  }
}

export async function reclamerTicketAction(
  _etatPrecedent: ReclamationActionState,
  formData: FormData,
): Promise<ReclamationActionState> {
  return executer(String(formData.get('ticket_id') ?? ''), 'reclamer');
}

export async function relacherTicketAction(
  _etatPrecedent: ReclamationActionState,
  formData: FormData,
): Promise<ReclamationActionState> {
  return executer(String(formData.get('ticket_id') ?? ''), 'relacher');
}
