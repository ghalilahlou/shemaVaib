'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '../../../lib/supabase/server';
import { signUpSchema } from '../schema';
import {
  MESSAGE_FORMULAIRE_INVALIDE,
  MESSAGE_INSCRIPTION_IMPOSSIBLE,
  type AuthActionState,
} from './auth-action-state';

/**
 * Inscription par e-mail et mot de passe.
 *
 * Le `nom` est transmis en métadonnée du compte : c'est le trigger
 * `creer_profil_a_l_inscription` qui s'en sert pour créer la ligne
 * `public.users`. L'application n'écrit donc jamais ce profil elle-même, quel
 * que soit le chemin d'inscription emprunté.
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

  const client = await createServerSupabaseClient();

  const { error } = await client.auth.signUp({
    email: resultat.data.email,
    password: resultat.data.motDePasse,
    options: { data: { nom: resultat.data.nom } },
  });

  if (error) {
    return {
      statut: 'erreur',
      message: error.message || MESSAGE_INSCRIPTION_IMPOSSIBLE,
      erreursChamps: {},
    };
  }

  revalidatePath('/', 'layout');
  redirect('/projets');
}
