/**
 * État échangé entre les boutons de réclamation et leurs Server Actions.
 *
 * Dans un module à part : un fichier marqué `'use server'` ne peut exporter que
 * des fonctions asynchrones.
 */

export type ReclamationActionState =
  { statut: 'initial' } | { statut: 'erreur'; message: string } | { statut: 'succes' };

export const ETAT_INITIAL_RECLAMATION: ReclamationActionState = { statut: 'initial' };

export const MESSAGE_AUTHENTIFICATION_REQUISE_RECLAMATION =
  'Vous devez être connecté pour réclamer un ticket.';

/**
 * Le refus le plus probable est celui d'une course perdue : quelqu'un a réclamé
 * le ticket entre l'affichage de la page et le clic. Le dire ainsi vaut mieux
 * qu'un « une erreur est survenue » qui laisserait croire à une panne.
 */
export const MESSAGE_DEVANCE =
  'Ce ticket vient d’être réclamé par quelqu’un d’autre, ou n’est plus disponible.';

export const MESSAGE_RELACHEMENT_REFUSE =
  'Ce ticket ne peut pas être relâché : il faut en être le réclamant ou porter le projet.';
