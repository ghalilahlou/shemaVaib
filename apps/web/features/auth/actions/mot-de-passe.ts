'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '../../../lib/supabase/server';
import {
  magicLinkSchema,
  MESSAGE_MOT_DE_PASSE_TROP_SIMPLE,
  nouveauMotDePasseSchema,
} from '../schema';
import { CHEMIN_NOUVEAU_MOT_DE_PASSE, adresseDeRetour } from '../destination';
import {
  MESSAGE_FORMULAIRE_INVALIDE,
  MESSAGE_MOT_DE_PASSE_IDENTIQUE,
  MESSAGE_MOT_DE_PASSE_IMPOSSIBLE,
  MESSAGE_REINITIALISATION_ENVOYEE,
  MESSAGE_SESSION_EXPIREE,
  type AuthActionState,
} from './auth-action-state';
import { urlDuSite } from '../../../lib/configuration';

/**
 * Envoi d'un lien de réinitialisation (SV-021).
 *
 * Le lien passe par `/auth/callback`, qui échange son code contre une session,
 * puis mène au choix du nouveau mot de passe. La réponse est la même que
 * l'adresse soit inscrite ou non — et quelle que soit l'issue de l'envoi, pour
 * que même une erreur ne renseigne pas sur l'existence d'un compte.
 */
export async function demanderReinitialisationAction(
  _etatPrecedent: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const resultat = magicLinkSchema.safeParse({ email: formData.get('email') ?? '' });

  if (!resultat.success) {
    return {
      statut: 'erreur',
      message: MESSAGE_FORMULAIRE_INVALIDE,
      erreursChamps: resultat.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const client = await createServerSupabaseClient();
  const siteUrl = urlDuSite();

  await client.auth.resetPasswordForEmail(resultat.data.email, {
    redirectTo: adresseDeRetour(siteUrl, CHEMIN_NOUVEAU_MOT_DE_PASSE),
  });

  return { statut: 'succes', message: MESSAGE_REINITIALISATION_ENVOYEE };
}

/**
 * Choix d'un nouveau mot de passe, pour la session courante.
 *
 * Sert au retour d'un lien de réinitialisation comme à une personne connectée
 * qui veut changer le sien : dans les deux cas, c'est la session qui désigne le
 * compte, jamais un champ du formulaire.
 */
export async function definirMotDePasseAction(
  _etatPrecedent: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const resultat = nouveauMotDePasseSchema.safeParse({
    motDePasse: formData.get('motDePasse') ?? '',
    confirmation: formData.get('confirmation') ?? '',
  });

  if (!resultat.success) {
    return {
      statut: 'erreur',
      message: MESSAGE_FORMULAIRE_INVALIDE,
      erreursChamps: resultat.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const client = await createServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    return { statut: 'erreur', message: MESSAGE_SESSION_EXPIREE, erreursChamps: {} };
  }

  const { error } = await client.auth.updateUser({ password: resultat.data.motDePasse });

  if (error) {
    if (error.code === 'same_password') {
      return {
        statut: 'erreur',
        message: MESSAGE_FORMULAIRE_INVALIDE,
        erreursChamps: { motDePasse: [MESSAGE_MOT_DE_PASSE_IDENTIQUE] },
      };
    }

    if (error.code === 'weak_password') {
      return {
        statut: 'erreur',
        message: MESSAGE_FORMULAIRE_INVALIDE,
        erreursChamps: { motDePasse: [MESSAGE_MOT_DE_PASSE_TROP_SIMPLE] },
      };
    }

    return { statut: 'erreur', message: MESSAGE_MOT_DE_PASSE_IMPOSSIBLE, erreursChamps: {} };
  }

  revalidatePath('/', 'layout');
  redirect('/profil?mot_de_passe=modifie');
}
