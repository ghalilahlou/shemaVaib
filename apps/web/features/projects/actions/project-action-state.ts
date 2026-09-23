/**
 * État échangé entre le formulaire de projet et sa Server Action.
 *
 * Volontairement dans un module à part : un fichier marqué `'use server'` ne
 * peut exporter que des fonctions asynchrones, il ne peut donc pas porter ces
 * constantes ni ce type.
 */

export type ProjectActionState =
  | { statut: 'initial' }
  | { statut: 'erreur'; message: string; erreursChamps: Record<string, string[]> }
  | { statut: 'succes'; projetId: string };

export const ETAT_INITIAL: ProjectActionState = { statut: 'initial' };

export const MESSAGE_AUTHENTIFICATION_REQUISE = 'Vous devez être connecté pour créer un projet.';
export const MESSAGE_FORMULAIRE_INVALIDE = 'Le formulaire contient des erreurs.';
