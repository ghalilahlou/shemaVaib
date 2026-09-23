/**
 * États échangés entre les formulaires de jalon et leurs Server Actions.
 *
 * Dans un module à part : un fichier marqué `'use server'` ne peut exporter que
 * des fonctions asynchrones.
 */

export type MilestoneActionState =
  | { statut: 'initial' }
  | { statut: 'erreur'; message: string; erreursChamps: Record<string, string[]> }
  | { statut: 'succes'; message: string };

export const ETAT_INITIAL_JALON: MilestoneActionState = { statut: 'initial' };

export const MESSAGE_AUTHENTIFICATION_REQUISE_JALON =
  'Vous devez être connecté pour agir sur un jalon.';
export const MESSAGE_FORMULAIRE_JALON_INVALIDE = 'Le formulaire contient des erreurs.';
export const MESSAGE_JALON_REFUSE = 'Seul le porteur du projet peut gérer ses jalons.';

/**
 * Une dépendance refusée mérite un message qui dit *pourquoi* : une boucle et
 * un projet étranger sont deux erreurs très différentes à corriger.
 */
export const MESSAGE_DEPENDANCE_CYCLIQUE =
  'Cette dépendance fermerait une boucle : le ticket finirait par se bloquer lui-même.';
export const MESSAGE_DEPENDANCE_AUTRE_PROJET =
  'Les deux tickets d’une dépendance doivent appartenir au même projet.';
export const MESSAGE_DEPENDANCE_REFUSEE = 'Cette dépendance n’a pas pu être créée.';
