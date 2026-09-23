import type { DefinitionOfReadyMotif } from '@schemavibe/shared-types';

/**
 * État échangé entre le formulaire de ticket et sa Server Action.
 *
 * Dans un module à part : un fichier marqué `'use server'` ne peut exporter que
 * des fonctions asynchrones.
 */

export type TicketActionState =
  | { statut: 'initial' }
  | {
      statut: 'erreur';
      message: string;
      erreursChamps: Record<string, string[]>;
      motifs: DefinitionOfReadyMotif[];
    }
  | { statut: 'succes'; ticketId: string; ticketStatut: 'brouillon' | 'ouvert' };

export const ETAT_INITIAL: TicketActionState = { statut: 'initial' };

export const MESSAGE_AUTHENTIFICATION_REQUISE = 'Vous devez être connecté pour créer un ticket.';
export const MESSAGE_FORMULAIRE_INVALIDE = 'Le formulaire contient des erreurs.';
export const MESSAGE_DEFINITION_OF_READY =
  'Ce ticket ne peut pas être ouvert tant que la Definition of Ready n’est pas réunie.';

/** Libellés lisibles des motifs de non-conformité (section 5.1). */
export const LIBELLES_MOTIFS: Record<DefinitionOfReadyMotif, string> = {
  contexte_manquant: 'Le contexte est vide.',
  criteres_acceptation_manquants: 'Les critères d’acceptation sont vides.',
  critere_test_manquant: 'Le critère de test est vide.',
  complexite_manquante: 'La complexité n’est pas estimée.',
  aucun_pattern_suggere: 'Aucun pattern n’est suggéré.',
  score_confiance_manquant:
    'Un ticket généré automatiquement doit afficher son score de confiance.',
};
