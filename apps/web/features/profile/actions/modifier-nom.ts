'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '../../../lib/supabase/server';
import { nomSchema } from '../../auth/schema';
import { modifierMonNom } from '../repository/profil-repository';
import type { ProfilActionState } from './profil-action-state';

/** Change le nom public de la personne connectée (SV-021). */
export async function modifierNomAction(
  _etatPrecedent: ProfilActionState,
  formData: FormData,
): Promise<ProfilActionState> {
  const resultat = nomSchema.safeParse(formData.get('nom') ?? '');

  if (!resultat.success) {
    return {
      statut: 'erreur',
      message: resultat.error.issues[0]?.message ?? 'Nom invalide.',
    };
  }

  try {
    await modifierMonNom(await createServerSupabaseClient(), resultat.data);
  } catch {
    return { statut: 'erreur', message: 'Le nom n’a pas pu être modifié.' };
  }

  // Le nom figure dans l'en-tête de toutes les pages.
  revalidatePath('/', 'layout');

  return { statut: 'succes', message: 'Nom mis à jour.' };
}
