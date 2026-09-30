'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '../../../lib/supabase/server';
import { MESSAGE_MOT_DE_PASSE_TROP_SIMPLE, signUpSchema } from '../schema';
import { PARAMETRE_DESTINATION, adresseDeRetour, destinationSure } from '../destination';
import {
  MESSAGE_FORMULAIRE_INVALIDE,
  MESSAGE_INSCRIPTION_A_CONFIRMER,
  MESSAGE_INSCRIPTION_IMPOSSIBLE,
  MESSAGE_TROP_DE_DEMANDES,
  type AuthActionState,
} from './auth-action-state';

/** Codes d'erreur de Supabase Auth signifiant « cette adresse a déjà un compte ». */
const CODES_COMPTE_EXISTANT = new Set(['user_already_exists', 'email_exists']);

/**
 * Inscription par e-mail et mot de passe.
 *
 * Le `nom` est transmis en métadonnée du compte : c'est le trigger
 * `creer_profil_a_l_inscription` qui s'en sert pour créer la ligne
 * `public.users`. L'application n'écrit donc jamais ce profil elle-même, quel
 * que soit le chemin d'inscription emprunté.
 *
 * Le message de Supabase n'est jamais affiché tel quel (SV-016) : il dit en
 * clair qu'une adresse est déjà inscrite. Chaque refus connu est traduit, et
 * l'adresse déjà prise reçoit la même réponse qu'une adresse à confirmer.
 *
 * Limite assumée : tant que la confirmation d'e-mail est désactivée — en local —,
 * une inscription nouvelle ouvre aussitôt une session, ce qui la distingue
 * encore d'une adresse déjà prise. Une fois la confirmation activée, Supabase ne
 * rend plus de session à l'inscription et les deux cas deviennent
 * indiscernables de l'extérieur.
 */
export async function signUpAction(
  _etatPrecedent: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const resultat = signUpSchema.safeParse({
    nom: formData.get('nom') ?? '',
    email: formData.get('email') ?? '',
    motDePasse: formData.get('motDePasse') ?? '',
  });

  if (!resultat.success) {
    return {
      statut: 'erreur',
      message: MESSAGE_FORMULAIRE_INVALIDE,
      erreursChamps: resultat.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const destination = destinationSure(formData.get(PARAMETRE_DESTINATION));
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://127.0.0.1:3000';
  const client = await createServerSupabaseClient();

  const { data, error } = await client.auth.signUp({
    email: resultat.data.email,
    password: resultat.data.motDePasse,
    options: {
      data: { nom: resultat.data.nom },
      emailRedirectTo: adresseDeRetour(siteUrl, destination),
    },
  });

  if (error) {
    if (error.code && CODES_COMPTE_EXISTANT.has(error.code)) {
      return { statut: 'succes', message: MESSAGE_INSCRIPTION_A_CONFIRMER };
    }

    if (error.code === 'weak_password') {
      return {
        statut: 'erreur',
        message: MESSAGE_FORMULAIRE_INVALIDE,
        erreursChamps: { motDePasse: [MESSAGE_MOT_DE_PASSE_TROP_SIMPLE] },
      };
    }

    if (error.code === 'over_email_send_rate_limit' || error.status === 429) {
      return { statut: 'erreur', message: MESSAGE_TROP_DE_DEMANDES, erreursChamps: {} };
    }

    return { statut: 'erreur', message: MESSAGE_INSCRIPTION_IMPOSSIBLE, erreursChamps: {} };
  }

  // Confirmation d'e-mail activée : le compte existe mais aucune session n'est
  // ouverte. Rediriger vers la destination y enverrait un visiteur anonyme, qui
  // serait aussitôt renvoyé vers la connexion sans comprendre pourquoi.
  if (!data.session) {
    return { statut: 'succes', message: MESSAGE_INSCRIPTION_A_CONFIRMER };
  }

  revalidatePath('/', 'layout');
  redirect(destination);
}
