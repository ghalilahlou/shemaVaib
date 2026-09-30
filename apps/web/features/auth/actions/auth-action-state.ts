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
export const MESSAGE_TROP_DE_DEMANDES =
  'Trop de demandes en peu de temps. Patientez quelques minutes avant de réessayer.';

/**
 * Réponse à une inscription qui n'ouvre pas de session : adresse à confirmer,
 * ou adresse déjà inscrite (SV-016).
 *
 * Les deux cas reçoivent le même texte. Afficher le refus « compte existant »
 * ferait du formulaire d'inscription l'oracle d'existence que la connexion et le
 * magic link s'interdisent déjà.
 */
export const MESSAGE_INSCRIPTION_A_CONFIRMER =
  'Si cette adresse n’était pas encore inscrite, un e-mail de confirmation vient d’y être envoyé : suivez son lien pour activer le compte. Si elle l’était déjà, connectez-vous ou demandez un lien de connexion.';

/**
 * Même message que l'adresse existe ou non, pour la même raison : la demande de
 * magic link ne doit pas révéler qui est inscrit.
 */
export const MESSAGE_MAGIC_LINK_ENVOYE =
  'Si un compte existe pour cette adresse, un lien de connexion vient d’y être envoyé.';
