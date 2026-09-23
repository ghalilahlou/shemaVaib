/**
 * État échangé entre le formulaire de soumission et sa Server Action.
 *
 * Dans un module à part : un fichier marqué `'use server'` ne peut exporter que
 * des fonctions asynchrones.
 */

export type SoumissionActionState =
  | { statut: 'initial' }
  | { statut: 'erreur'; message: string; erreursChamps: Record<string, string[]> }
  | { statut: 'succes' };

export const ETAT_INITIAL_SOUMISSION: SoumissionActionState = { statut: 'initial' };

export const MESSAGE_AUTHENTIFICATION_REQUISE_SOUMISSION =
  'Vous devez être connecté pour soumettre une solution.';

export const MESSAGE_FORMULAIRE_SOUMISSION_INVALIDE = 'Le formulaire contient des erreurs.';

/**
 * Le refus le plus probable n'est pas une erreur de saisie : c'est un ticket
 * relâché entre l'affichage de la page et l'envoi du formulaire. Le dire
 * explicitement évite que le contributeur cherche ce qu'il a mal rempli.
 */
export const MESSAGE_TICKET_NON_SOUMETTABLE =
  'Ce ticket n’est plus réclamé par vous : il a été relâché ou repris entre-temps.';
