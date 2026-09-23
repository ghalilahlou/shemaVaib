'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '../../../lib/supabase/server';
import { magicLinkSchema, signInSchema } from '../schema';
import {
  MESSAGE_FORMULAIRE_INVALIDE,
  MESSAGE_IDENTIFIANTS_INVALIDES,
  MESSAGE_MAGIC_LINK_ENVOYE,
  type AuthActionState,
} from './auth-action-state';

/** Connexion par e-mail et mot de passe. */
export async function signInAction(
  _etatPrecedent: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const resultat = signInSchema.safeParse({
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

  const { error } = await client.auth.signInWithPassword({
    email: resultat.data.email,
    password: resultat.data.motDePasse,
  });

  // Le message de Supabase n'est pas repris tel quel : il distingue parfois
  // l'adresse inconnue du mot de passe erroné, ce qui permettrait d'énumérer
  // les comptes existants.
  if (error) {
    return {
      statut: 'erreur',
      message: MESSAGE_IDENTIFIANTS_INVALIDES,
      erreursChamps: {},
    };
  }

  revalidatePath('/', 'layout');
  redirect('/projets');
}

/** Envoi d'un lien de connexion à usage unique (magic link). */
export async function sendMagicLinkAction(
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
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://127.0.0.1:3000';

  await client.auth.signInWithOtp({
    email: resultat.data.email,
    options: {
      emailRedirectTo: `${siteUrl}/auth/callback`,
      shouldCreateUser: false,
    },
  });

  // Réponse volontairement identique que l'adresse soit inscrite ou non : le
  // formulaire ne doit pas renseigner sur l'existence d'un compte.
  return { statut: 'succes', message: MESSAGE_MAGIC_LINK_ENVOYE };
}

/** Déconnexion. */
export async function signOutAction(): Promise<void> {
  const client = await createServerSupabaseClient();

  await client.auth.signOut();

  revalidatePath('/', 'layout');
  redirect('/');
}
