/**
 * État échangé entre le formulaire de message et sa Server Action.
 *
 * Dans un module à part : un fichier marqué `'use server'` ne peut exporter que
 * des fonctions asynchrones.
 */

export type MessageActionState =
  | { statut: 'initial' }
  | { statut: 'erreur'; message: string; erreursChamps: Record<string, string[]> }
  | { statut: 'succes' };

export const ETAT_INITIAL_MESSAGE: MessageActionState = { statut: 'initial' };

export const MESSAGE_AUTHENTIFICATION_REQUISE_DISCUSSION =
  'Vous devez être connecté pour écrire ici.';
export const MESSAGE_FORMULAIRE_MESSAGE_INVALIDE = 'Le message n’a pas pu être envoyé.';

/**
 * Le refus vient le plus souvent d'un projet ou d'un ticket devenu invisible
 * entre l'affichage de la page et l'envoi — un brouillon repassé privé, par
 * exemple. Le dire vaut mieux qu'un message d'erreur générique.
 */
export const MESSAGE_DISCUSSION_INACCESSIBLE = 'Cette discussion ne vous est plus accessible.';
