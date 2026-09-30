/**
 * Où renvoyer un visiteur une fois connecté (SV-016).
 *
 * Une page protégée envoie vers `/connexion?next=<chemin>` ; ce chemin traverse
 * ensuite un formulaire, un e-mail ou un fournisseur OAuth avant de revenir.
 * Il vient donc toujours de l'extérieur, et c'est ici — et seulement ici — qu'on
 * décide s'il est sûr de le suivre. Sans cette règle unique, chaque chemin de
 * connexion aurait sa propre vérification, et le premier qui en oublie une
 * devient une redirection ouverte.
 */

export const DESTINATION_PAR_DEFAUT = '/projets';

/** Page où atterrit un lien de réinitialisation, une fois la session ouverte (SV-021). */
export const CHEMIN_NOUVEAU_MOT_DE_PASSE = '/mot-de-passe/nouveau';

/** Nom du paramètre, dans l'URL comme dans le `FormData`. */
export const PARAMETRE_DESTINATION = 'next';

/**
 * Origine fictive servant à résoudre la destination : si la résolution en sort,
 * c'est que la chaîne désignait un autre site.
 */
const ORIGINE_DE_REFERENCE = 'http://schemavibe.invalid';

/**
 * Rend un chemin interne sûr, ou la destination par défaut.
 *
 * Tester « commence par `/` et pas par `//` » ne suffit pas : les navigateurs
 * lisent `/\exemple.com` comme `//exemple.com`, et ignorent tabulations et
 * retours à la ligne au milieu d'une URL. Plutôt que d'énumérer les pièges, on
 * laisse l'analyseur d'URL trancher, puis on vérifie que l'origine n'a pas bougé.
 */
export function destinationSure(brute: unknown): string {
  if (typeof brute !== 'string' || !brute.startsWith('/')) {
    return DESTINATION_PAR_DEFAUT;
  }

  let resolue: URL;

  try {
    resolue = new URL(brute, ORIGINE_DE_REFERENCE);
  } catch {
    return DESTINATION_PAR_DEFAUT;
  }

  if (resolue.origin !== ORIGINE_DE_REFERENCE) {
    return DESTINATION_PAR_DEFAUT;
  }

  return `${resolue.pathname}${resolue.search}${resolue.hash}`;
}

/**
 * Adresse de `/auth/callback` portant la destination.
 *
 * Le paramètre n'est ajouté que s'il diffère du défaut : l'adresse nue reste
 * ainsi celle déclarée dans la liste des redirections autorisées de Supabase.
 */
export function adresseDeRetour(origine: string, destination: string): string {
  const adresse = new URL('/auth/callback', origine);
  const sure = destinationSure(destination);

  if (sure !== DESTINATION_PAR_DEFAUT) {
    adresse.searchParams.set(PARAMETRE_DESTINATION, sure);
  }

  return adresse.toString();
}

/**
 * Chemin de la page de connexion, destination conservée.
 *
 * Utilisé par les pages protégées pour y envoyer un visiteur anonyme, et par le
 * callback quand un lien a échoué : dans les deux cas, la personne doit arriver
 * là où elle allait une fois connectée, et pas sur la page par défaut.
 */
export function cheminDeConnexion(destination: string, erreur?: string): string {
  const parametres = new URLSearchParams();
  const sure = destinationSure(destination);

  if (erreur) {
    parametres.set('erreur', erreur);
  }

  if (sure !== DESTINATION_PAR_DEFAUT) {
    parametres.set(PARAMETRE_DESTINATION, sure);
  }

  const requete = parametres.toString();

  return requete ? `/connexion?${requete}` : '/connexion';
}

/** Lien vers une autre page d'authentification, sans perdre la destination. */
export function avecDestination(chemin: string, destination: string): string {
  const sure = destinationSure(destination);

  return sure === DESTINATION_PAR_DEFAUT
    ? chemin
    : `${chemin}?${new URLSearchParams({ [PARAMETRE_DESTINATION]: sure }).toString()}`;
}
