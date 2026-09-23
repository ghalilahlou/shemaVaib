'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '../../../lib/supabase/server';
import { soumettreSolution, SoumissionError } from '../repository/tickets-repository';
import { submissionFormSchema } from '../schema';
import {
  MESSAGE_AUTHENTIFICATION_REQUISE_SOUMISSION,
  MESSAGE_FORMULAIRE_SOUMISSION_INVALIDE,
  MESSAGE_TICKET_NON_SOUMETTABLE,
  type SoumissionActionState,
} from './soumission-action-state';

/**
 * Server Action de soumission d'une solution.
 *
 * Elle valide et délègue : c'est la fonction de base de données qui décide si le
 * ticket peut recevoir cette soumission, et qui garantit qu'aucune soumission
 * n'atterrit sur un ticket relâché entre-temps.
 */
export async function soumettreSolutionAction(
  _etatPrecedent: SoumissionActionState,
  formData: FormData,
): Promise<SoumissionActionState> {
  const client = await createServerSupabaseClient();

  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    return {
      statut: 'erreur',
      message: MESSAGE_AUTHENTIFICATION_REQUISE_SOUMISSION,
      erreursChamps: {},
    };
  }

  const resultat = submissionFormSchema.safeParse({
    ticket_id: formData.get('ticket_id') ?? '',
    diff_url: formData.get('diff_url') ?? '',
    preview_url: formData.get('preview_url') ?? '',
    resume_md: formData.get('resume_md') ?? '',
  });

  if (!resultat.success) {
    return {
      statut: 'erreur',
      message: MESSAGE_FORMULAIRE_SOUMISSION_INVALIDE,
      erreursChamps: resultat.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  try {
    await soumettreSolution(client, {
      ticketId: resultat.data.ticket_id,
      diffUrl: resultat.data.diff_url,
      previewUrl: resultat.data.preview_url,
      resumeMd: resultat.data.resume_md,
    });

    revalidatePath(`/tickets/${resultat.data.ticket_id}`);
    revalidatePath('/tickets');

    return { statut: 'succes' };
  } catch (erreur) {
    if (erreur instanceof SoumissionError) {
      return {
        statut: 'erreur',
        message:
          erreur.motif === 'authentification_requise'
            ? MESSAGE_AUTHENTIFICATION_REQUISE_SOUMISSION
            : MESSAGE_TICKET_NON_SOUMETTABLE,
        erreursChamps: {},
      };
    }

    return {
      statut: 'erreur',
      message: 'Une erreur inattendue est survenue.',
      erreursChamps: {},
    };
  }
}
