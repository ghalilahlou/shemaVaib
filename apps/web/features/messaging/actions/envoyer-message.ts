'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '../../../lib/supabase/server';
import { envoyerMessage, resoudreNomsAuteurs } from '../repository/messages-repository';
import { messageFormSchema } from '../schema';
import {
  MESSAGE_AUTHENTIFICATION_REQUISE_DISCUSSION,
  MESSAGE_DISCUSSION_INACCESSIBLE,
  MESSAGE_FORMULAIRE_MESSAGE_INVALIDE,
  type MessageActionState,
} from './message-action-state';

/**
 * Server Actions de la messagerie.
 *
 * Elles valident et délèguent : c'est la politique d'écriture qui décide si
 * l'auteur a le droit de publier dans ce canal, et qui refuse un message signé
 * au nom d'autrui.
 */
export async function envoyerMessageAction(
  _etatPrecedent: MessageActionState,
  formData: FormData,
): Promise<MessageActionState> {
  const client = await createServerSupabaseClient();

  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    return {
      statut: 'erreur',
      message: MESSAGE_AUTHENTIFICATION_REQUISE_DISCUSSION,
      erreursChamps: {},
    };
  }

  const resultat = messageFormSchema.safeParse({
    genre: formData.get('genre') ?? '',
    contexte_id: formData.get('contexte_id') ?? '',
    contenu: formData.get('contenu') ?? '',
  });

  if (!resultat.success) {
    return {
      statut: 'erreur',
      message: MESSAGE_FORMULAIRE_MESSAGE_INVALIDE,
      erreursChamps: resultat.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const contexte =
    resultat.data.genre === 'projet'
      ? ({ genre: 'projet', id: resultat.data.contexte_id } as const)
      : ({ genre: 'ticket', id: resultat.data.contexte_id } as const);

  try {
    await envoyerMessage(client, {
      contexte,
      auteurId: user.id,
      contenu: resultat.data.contenu,
    });
  } catch {
    return {
      statut: 'erreur',
      message: MESSAGE_DISCUSSION_INACCESSIBLE,
      erreursChamps: {},
    };
  }

  revalidatePath(
    contexte.genre === 'projet' ? `/projets/${contexte.id}/discussions` : `/tickets/${contexte.id}`,
  );

  return { statut: 'succes' };
}

/**
 * Résout les noms publics d'auteurs pour le fil temps réel.
 *
 * La charge Realtime ne porte que l'identifiant de l'auteur. Passer par une
 * Server Action plutôt que d'interroger la base depuis le hook maintient la
 * règle de la section 18 : la couche d'abonnement traduit, elle n'accède pas
 * aux données.
 */
export async function resoudreAuteursAction(
  identifiants: string[],
): Promise<Record<string, string>> {
  const client = await createServerSupabaseClient();

  try {
    return await resoudreNomsAuteurs(client, identifiants.slice(0, 50));
  } catch {
    // Un nom manquant dégrade l'affichage, il ne casse pas le fil.
    return {};
  }
}
