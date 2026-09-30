/**
 * Calcul du contraste WCAG 2.1 (SV-015).
 *
 * Isolé du reste pour une raison simple : c'est la seule partie du système de
 * design qui se vérifie par le calcul plutôt que par l'œil. Le critère du ticket
 * en dépend entièrement, donc ces quelques lignes doivent être elles-mêmes
 * vérifiables — d'où des fonctions pures, sans DOM ni CSS.
 */

/** Une couleur au format `#rrggbb`. */
export type Hexa = string;

const MOTIF_HEXA = /^#[0-9a-f]{6}$/;

export function estHexaValide(valeur: string): boolean {
  return MOTIF_HEXA.test(valeur);
}

function composantes(couleur: Hexa): [number, number, number] {
  if (!estHexaValide(couleur)) {
    throw new Error(`Couleur attendue au format #rrggbb, reçu « ${couleur} ».`);
  }

  return [
    Number.parseInt(couleur.slice(1, 3), 16),
    Number.parseInt(couleur.slice(3, 5), 16),
    Number.parseInt(couleur.slice(5, 7), 16),
  ];
}

/** Composante linéarisée, telle que la définit WCAG 2.1. */
function linearise(valeur: number): number {
  const proportion = valeur / 255;

  return proportion <= 0.04045 ? proportion / 12.92 : Math.pow((proportion + 0.055) / 1.055, 2.4);
}

/** Luminance relative, entre 0 (noir) et 1 (blanc). */
export function luminance(couleur: Hexa): number {
  const [rouge, vert, bleu] = composantes(couleur);

  return 0.2126 * linearise(rouge) + 0.7152 * linearise(vert) + 0.0722 * linearise(bleu);
}

/**
 * Rapport de contraste entre deux couleurs, de 1 (identiques) à 21 (noir sur
 * blanc). L'ordre des arguments est sans importance.
 */
export function contraste(premiere: Hexa, seconde: Hexa): number {
  const a = luminance(premiere);
  const b = luminance(seconde);
  const haute = Math.max(a, b);
  const basse = Math.min(a, b);

  return (haute + 0.05) / (basse + 0.05);
}

/** Arrondi à deux décimales, pour des messages d'échec lisibles. */
export function arrondi(valeur: number): number {
  return Math.round(valeur * 100) / 100;
}
