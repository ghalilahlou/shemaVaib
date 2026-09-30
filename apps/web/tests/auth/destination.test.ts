import { describe, expect, it } from 'vitest';
import {
  DESTINATION_PAR_DEFAUT,
  adresseDeRetour,
  avecDestination,
  cheminDeConnexion,
  destinationSure,
} from '../../features/auth/destination';

/**
 * SV-016 — la règle unique qui décide où renvoyer un visiteur après connexion.
 *
 * Logique pure, sans base : chaque chemin de connexion (formulaire, magic link,
 * GitHub, callback) délègue à cette fonction, c'est donc ici que la redirection
 * ouverte est gagnée ou perdue.
 */

describe('destinationSure', () => {
  it.each([
    ['/projets/nouveau', '/projets/nouveau'],
    ['/parametres/jetons', '/parametres/jetons'],
    ['/tickets?statut=ouvert#liste', '/tickets?statut=ouvert#liste'],
  ])('suit le chemin interne %s', (brute, attendue) => {
    expect(destinationSure(brute)).toBe(attendue);
  });

  it.each([
    ['absent', null],
    ['non textuel', ['/projets/nouveau']],
    ['vide', ''],
    ['relatif', 'projets'],
    ['adresse absolue', 'https://exemple.com/projets'],
    ['schéma javascript', 'javascript:alert(1)'],
    ['protocole implicite', '//exemple.com'],
    // Les navigateurs lisent `\` comme `/` dans une URL http(s).
    ['barre oblique inversée', '/\\exemple.com'],
    // Tabulations et retours à la ligne sont retirés avant l'analyse.
    ['tabulation intercalée', '/\t/exemple.com'],
    ['retour à la ligne intercalé', '/\n/exemple.com'],
  ])('retombe sur le défaut pour une destination %s', (_cas, brute) => {
    expect(destinationSure(brute)).toBe(DESTINATION_PAR_DEFAUT);
  });
});

describe('adresseDeRetour', () => {
  const ORIGINE = 'http://127.0.0.1:3000';

  it('reste l’adresse nue pour la destination par défaut', () => {
    // C'est cette forme exacte qui figure dans la liste des redirections
    // autorisées de Supabase.
    expect(adresseDeRetour(ORIGINE, DESTINATION_PAR_DEFAUT)).toBe(`${ORIGINE}/auth/callback`);
  });

  it('porte une destination interne', () => {
    expect(adresseDeRetour(ORIGINE, '/projets/nouveau')).toBe(
      `${ORIGINE}/auth/callback?next=%2Fprojets%2Fnouveau`,
    );
  });

  it('n’embarque jamais une destination externe', () => {
    expect(adresseDeRetour(ORIGINE, '//exemple.com')).toBe(`${ORIGINE}/auth/callback`);
  });
});

describe('cheminDeConnexion', () => {
  it('conserve la destination et l’erreur', () => {
    expect(cheminDeConnexion('/projets/nouveau', 'lien_expire')).toBe(
      '/connexion?erreur=lien_expire&next=%2Fprojets%2Fnouveau',
    );
  });

  it('n’ajoute rien pour la destination par défaut', () => {
    expect(cheminDeConnexion(DESTINATION_PAR_DEFAUT)).toBe('/connexion');
  });

  it('écarte une destination externe', () => {
    expect(cheminDeConnexion('https://exemple.com', 'lien_invalide')).toBe(
      '/connexion?erreur=lien_invalide',
    );
  });
});

describe('avecDestination', () => {
  it('propage la destination d’une page d’authentification à l’autre', () => {
    expect(avecDestination('/inscription', '/parametres/jetons')).toBe(
      '/inscription?next=%2Fparametres%2Fjetons',
    );
  });

  it('laisse le lien nu pour la destination par défaut', () => {
    expect(avecDestination('/connexion', DESTINATION_PAR_DEFAUT)).toBe('/connexion');
  });
});
