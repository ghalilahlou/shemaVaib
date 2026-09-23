'use server';

import { revalidatePath } from 'next/cache';
import { evaluerDefinitionOfReady } from '@schemavibe/shared-types';
import { createServerSupabaseClient } from '../../../lib/supabase/server';
import { creerTicket, TicketRepositoryError } from '../repository/tickets-repository';
import { ticketFormSchema } from '../schema';
import {
  MESSAGE_AUTHENTIFICATION_REQUISE,
  MESSAGE_DEFINITION_OF_READY,
  MESSAGE_FORMULAIRE_INVALIDE,
  type TicketActionState,
} from './ticket-action-state';

/**
 * Server Action de création d'un ticket.
 *
 * C'est ici que la Definition of Ready (section 5.1) est arbitrée. Elle n'est
 * pas réévaluée à la main : `evaluerDefinitionOfReady` de
 * `@schemavibe/shared-types` en est l'unique écriture, partagée avec le serveur
 * MCP et couverte par des tests unitaires.
 *
 * Un ticket incomplet n'est pas refusé : il est enregistré en brouillon. C'est
 * la demande de publication qui échoue, en disant précisément ce qui manque.
 */
export async function createTicketAction(
  _etatPrecedent: TicketActionState,
  formData: FormData,
): Promise<TicketActionState> {
  const client = await createServerSupabaseClient();

  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    return {
      statut: 'erreur',
      message: MESSAGE_AUTHENTIFICATION_REQUISE,
      erreursChamps: {},
      motifs: [],
    };
  }

  const resultat = ticketFormSchema.safeParse({
    projet_id: formData.get('projet_id') ?? '',
    titre: formData.get('titre') ?? '',
    contexte: formData.get('contexte') ?? '',
    criteres_acceptation: formData.get('criteres_acceptation') ?? '',
    critere_test: formData.get('critere_test') ?? '',
    complexite: formData.get('complexite') ?? '',
    priorite: formData.get('priorite') ?? 'normale',
    source: formData.get('source') ?? 'manuel',
    patterns_suggeres: formData.getAll('patterns_suggeres').map(String),
    publier: formData.get('publier') === 'on',
  });

  if (!resultat.success) {
    return {
      statut: 'erreur',
      message: MESSAGE_FORMULAIRE_INVALIDE,
      erreursChamps: resultat.error.flatten().fieldErrors as Record<string, string[]>,
      motifs: [],
    };
  }

  const donnees = resultat.data;

  const conformite = evaluerDefinitionOfReady({
    contexte: donnees.contexte,
    criteres_acceptation: donnees.criteres_acceptation,
    critere_test: donnees.critere_test,
    complexite: donnees.complexite,
    source: donnees.source,
    score_confiance: null,
    nombre_patterns_suggeres: donnees.patterns_suggeres.length,
  });

  // Publier un ticket incomplet est refusé explicitement, plutôt que retombé en
  // silence sur un brouillon : le porteur doit savoir que sa demande n'a pas
  // abouti, et pourquoi.
  if (donnees.publier && !conformite.pret) {
    return {
      statut: 'erreur',
      message: MESSAGE_DEFINITION_OF_READY,
      erreursChamps: {},
      motifs: conformite.motifs,
    };
  }

  const statut = donnees.publier ? 'ouvert' : 'brouillon';

  try {
    const ticket = await creerTicket(client, donnees, statut);

    revalidatePath('/tickets');
    revalidatePath(`/projets/${donnees.projet_id}`);

    return { statut: 'succes', ticketId: ticket.id, ticketStatut: statut };
  } catch (erreur) {
    const message =
      erreur instanceof TicketRepositoryError
        ? erreur.message
        : 'Une erreur inattendue est survenue.';

    return { statut: 'erreur', message, erreursChamps: {}, motifs: [] };
  }
}
