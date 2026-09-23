'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '../../../lib/supabase/server';
import { creerProjet, ProjectRepositoryError } from '../repository/projects-repository';
import { projectFormSchema } from '../schema';
import {
  MESSAGE_AUTHENTIFICATION_REQUISE,
  MESSAGE_FORMULAIRE_INVALIDE,
  type ProjectActionState,
} from './project-action-state';

/**
 * Server Action de création d'un projet.
 *
 * Elle orchestre, elle ne fait rien d'autre (section 18) : vérifier la session,
 * valider avec le schéma Zod partagé avec le formulaire, déléguer l'écriture au
 * repository. Aucun appel Supabase direct.
 *
 * Un fichier `'use server'` ne peut exporter que des fonctions asynchrones :
 * l'état et ses constantes vivent donc dans `project-action-state.ts`.
 */
export async function createProjectAction(
  _etatPrecedent: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  const client = await createServerSupabaseClient();

  const {
    data: { user },
  } = await client.auth.getUser();

  // Tant que SV-001 n'est pas livré, aucune session n'existe : l'action refuse
  // proprement plutôt que de contourner la RLS avec une clé privilégiée.
  if (!user) {
    return {
      statut: 'erreur',
      message: MESSAGE_AUTHENTIFICATION_REQUISE,
      erreursChamps: {},
    };
  }

  const resultat = projectFormSchema.safeParse({
    nom: formData.get('nom') ?? '',
    repo_url: formData.get('repo_url') ?? '',
    statut: formData.get('statut') ?? 'brouillon',
  });

  if (!resultat.success) {
    return {
      statut: 'erreur',
      message: MESSAGE_FORMULAIRE_INVALIDE,
      erreursChamps: resultat.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  try {
    const projet = await creerProjet(client, user.id, resultat.data);

    revalidatePath('/projets');

    return { statut: 'succes', projetId: projet.id };
  } catch (erreur) {
    const message =
      erreur instanceof ProjectRepositoryError
        ? erreur.message
        : 'Une erreur inattendue est survenue.';

    return { statut: 'erreur', message, erreursChamps: {} };
  }
}
