'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '../../../lib/supabase/server';
import { creerJeton, revoquerJeton } from '../repository/api-tokens-repository';
import { empreinteDe, engendrerJeton } from '../jeton';
import { jetonFormSchema, revocationFormSchema } from '../schema';
import {
  MESSAGE_AUTHENTIFICATION_REQUISE_JETON,
  MESSAGE_CREATION_REFUSEE,
  MESSAGE_FORMULAIRE_JETON_INVALIDE,
  MESSAGE_REVOCATION_REFUSEE,
  type JetonActionState,
  type RevocationActionState,
} from './jeton-action-state';

/**
 * Server Actions des jetons d'accès personnels.
 *
 * Le secret est engendré ici, à un seul endroit, et l'empreinte seule descend
 * vers la base. L'appartenance n'est pas vérifiée dans ce fichier : les
 * fonctions `creer_jeton_api` et `revoquer_jeton_api` la déduisent de la
 * session, ce qui rend impossible d'agir sur le jeton d'autrui même en forgeant
 * le formulaire.
 */
export async function creerJetonAction(
  _etatPrecedent: JetonActionState,
  formData: FormData,
): Promise<JetonActionState> {
  const client = await createServerSupabaseClient();

  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    return {
      statut: 'erreur',
      message: MESSAGE_AUTHENTIFICATION_REQUISE_JETON,
      erreursChamps: {},
    };
  }

  const resultat = jetonFormSchema.safeParse({ libelle: formData.get('libelle') ?? '' });

  if (!resultat.success) {
    return {
      statut: 'erreur',
      message: MESSAGE_FORMULAIRE_JETON_INVALIDE,
      erreursChamps: resultat.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const secret = engendrerJeton();

  try {
    await creerJeton(client, resultat.data.libelle, empreinteDe(secret));
  } catch {
    return { statut: 'erreur', message: MESSAGE_CREATION_REFUSEE, erreursChamps: {} };
  }

  revalidatePath('/parametres/jetons');

  return { statut: 'cree', libelle: resultat.data.libelle, secret };
}

export async function revoquerJetonAction(
  _etatPrecedent: RevocationActionState,
  formData: FormData,
): Promise<RevocationActionState> {
  const client = await createServerSupabaseClient();

  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    return { statut: 'erreur', message: MESSAGE_AUTHENTIFICATION_REQUISE_JETON };
  }

  const resultat = revocationFormSchema.safeParse({ jeton_id: formData.get('jeton_id') ?? '' });

  if (!resultat.success) {
    return { statut: 'erreur', message: MESSAGE_REVOCATION_REFUSEE };
  }

  try {
    await revoquerJeton(client, resultat.data.jeton_id);
  } catch {
    return { statut: 'erreur', message: MESSAGE_REVOCATION_REFUSEE };
  }

  revalidatePath('/parametres/jetons');

  return { statut: 'succes' };
}
