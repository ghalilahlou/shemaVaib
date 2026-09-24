/**
 * État échangé entre les formulaires de jetons et leurs Server Actions.
 *
 * Dans un module à part : un fichier marqué `'use server'` ne peut exporter que
 * des fonctions asynchrones.
 */

export type JetonActionState =
  | { statut: 'initial' }
  | { statut: 'erreur'; message: string; erreursChamps: Record<string, string[]> }
  /**
   * Le secret ne transite qu'ici, une fois, juste après sa création. Il n'est
   * ni stocké ni recalculable : la page qui l'affiche est la seule occasion de
   * le lire.
   */
  | { statut: 'cree'; libelle: string; secret: string };

export const ETAT_INITIAL_JETON: JetonActionState = { statut: 'initial' };

export type RevocationActionState =
  { statut: 'initial' } | { statut: 'erreur'; message: string } | { statut: 'succes' };

export const ETAT_INITIAL_REVOCATION: RevocationActionState = { statut: 'initial' };

export const MESSAGE_AUTHENTIFICATION_REQUISE_JETON =
  'Vous devez être connecté pour gérer vos jetons.';
export const MESSAGE_FORMULAIRE_JETON_INVALIDE = 'Le jeton n’a pas pu être créé.';
export const MESSAGE_CREATION_REFUSEE =
  'Création refusée. Vous avez peut-être atteint la limite de dix jetons actifs : révoquez-en un avant d’en émettre un nouveau.';
export const MESSAGE_REVOCATION_REFUSEE =
  'Révocation impossible : ce jeton ne vous appartient pas, ou il est déjà révoqué.';
