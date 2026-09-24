import 'server-only';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Fabrication et reconnaissance des jetons personnels (SV-014).
 *
 * Le secret ne quitte cette machine qu'une fois, dans la réponse qui suit sa
 * création : la base n'en reçoit que l'empreinte. Tout ce qui suit est donc
 * volontairement sans état — aucune de ces fonctions ne lit ni n'écrit quoi que
 * ce soit.
 */

/**
 * Préfixe porté par tout jeton émis.
 *
 * Il sert moins à nous qu'aux outils d'analyse de secrets : une chaîne
 * reconnaissable est détectable dans un commit ou un journal, là où une suite
 * de caractères aléatoires passerait inaperçue.
 */
export const PREFIXE_JETON = 'svb_';

/** 32 octets, soit 256 bits — la même entropie que l'empreinte qui les couvre. */
export const OCTETS_ALEATOIRES = 32;

/** Forme attendue d'un jeton : le préfixe, puis 43 caractères base64url. */
const MOTIF_JETON = /^svb_[A-Za-z0-9_-]{43}$/;

/** Engendre un jeton neuf. Sa valeur n'est jamais recalculable ensuite. */
export function engendrerJeton(): string {
  return PREFIXE_JETON + randomBytes(OCTETS_ALEATOIRES).toString('base64url');
}

/** Empreinte SHA-256 en hexadécimal minuscule, telle que stockée en base. */
export function empreinteDe(jeton: string): string {
  return createHash('sha256').update(jeton, 'utf8').digest('hex');
}

/**
 * Écarte d'emblée ce qui ne peut pas être un jeton.
 *
 * C'est une économie, pas une vérification : un jeton bien formé mais inconnu
 * sera refusé par la base. L'intérêt est de ne pas interroger la base pour
 * chaque en-tête `Authorization` malformé qui se présente.
 */
export function jetonBienForme(valeur: string): boolean {
  return MOTIF_JETON.test(valeur);
}

/**
 * Compare deux empreintes en temps constant.
 *
 * La comparaison se fait en base sur une colonne indexée, où cette précaution
 * n'a pas cours ; celle-ci sert aux vérifications faites en mémoire, pour que le
 * temps de réponse ne révèle pas combien de caractères d'une empreinte sont
 * corrects.
 */
export function memeEmpreinte(gauche: string, droite: string): boolean {
  const a = Buffer.from(gauche, 'utf8');
  const b = Buffer.from(droite, 'utf8');

  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Lit l'en-tête `Authorization` et en extrait le jeton porteur.
 *
 * Rend `null` plutôt que de lever : un en-tête absent ou mal formé est un cas
 * courant, pas une anomalie.
 */
export function jetonPorteur(enTete: string | null): string | null {
  if (!enTete) {
    return null;
  }

  const [schema, valeur, ...reste] = enTete.trim().split(/\s+/);

  if (reste.length > 0 || schema?.toLowerCase() !== 'bearer' || !valeur) {
    return null;
  }

  return jetonBienForme(valeur) ? valeur : null;
}
