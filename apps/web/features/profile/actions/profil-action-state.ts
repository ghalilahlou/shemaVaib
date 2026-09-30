/**
 * État échangé entre le formulaire de profil et sa Server Action.
 *
 * Dans un module à part : un fichier marqué `'use server'` ne peut exporter que
 * des fonctions asynchrones.
 */
export type ProfilActionState =
  | { statut: 'initial' }
  | { statut: 'erreur'; message: string }
  | { statut: 'succes'; message: string };

export const ETAT_INITIAL_PROFIL: ProfilActionState = { statut: 'initial' };
