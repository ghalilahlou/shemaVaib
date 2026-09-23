/**
 * État échangé entre les formulaires d'authentification et leurs Server Actions.
 *
 * Dans un module à part : un fichier marqué `'use server'` ne peut exporter que
 * des fonctions asynchrones.
 */

export type AuthActionState =
  | { statut: 'initial' }
  | { statut: 'erreur'; message: string; erreursChamps: Record<string, string[]> }
  | { statut: 'succes'; message: string };

export const ETAT_INITIAL: AuthActionState = { statut: 'initial' };

/**
 * Message unique pour « adresse inconnue » comme pour « mot de passe erroné ».
 *
 * Les distinguer transformerait le formulaire de connexion en oracle
 * d'existence de comptes : un attaquant pourrait énumérer les adresses inscrites
 * sans jamais deviner un mot de passe.
 */
export const MESSAGE_IDENTIFIANTS_INVALIDES = 'Adresse e-mail ou mot de passe incorrect.';

export const MESSAGE_FORMULAIRE_INVALIDE = 'Le formulaire contient des erreurs.';
export const MESSAGE_INSCRIPTION_IMPOSSIBLE = 'L’inscription a échoué. Réessayez dans un instant.';

/**
 * Même message que l'adresse existe ou non, pour la même raison : la demande de
 * magic link ne doit pas révéler qui est inscrit.
 */
export const MESSAGE_MAGIC_LINK_ENVOYE =
  'Si un compte existe pour cette adresse, un lien de connexion vient d’y être envoyé.';
