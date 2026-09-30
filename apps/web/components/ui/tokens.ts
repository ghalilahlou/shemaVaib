/**
 * Les tokens du système de design SchemaVibe (SV-015).
 *
 * Ce module fait autorité. Les variables CSS de `app/globals.css` en sont la
 * transcription, et un test compare les deux : une couleur ne peut pas dériver
 * d'un côté sans que l'autre le signale. Les composants, eux, ne lisent jamais
 * ce fichier — ils passent par les variables CSS, pour que le changement de
 * thème reste l'affaire du navigateur et non d'un rendu React.
 *
 * Le module existe malgré tout en TypeScript pour une raison précise : le
 * critère du ticket est un test de contraste automatisé, et une feuille de style
 * ne se teste pas. Les valeurs doivent donc être lisibles par du code.
 *
 * CINQ VALEURS S'ÉCARTENT DE LA PALETTE FOURNIE
 *
 * Elles ne passaient pas le seuil qu'impose ce même ticket. Chaque écart est
 * consigné dans `ECARTS_DE_PALETTE` ci-dessous, avec sa raison chiffrée, plutôt
 * que d'être corrigé en silence.
 */

export type Theme = 'sombre' | 'clair';

export const THEMES = ['sombre', 'clair'] as const;

/** Fonds, du plus profond au plus surélevé. Tout texte se lit sur l'un d'eux. */
export const SURFACES = ['surface-000', 'surface-100', 'surface-200', 'surface-300'] as const;

/**
 * Tokens employés comme couleur de texte.
 *
 * Ce sont eux que le seuil de 4,5:1 concerne (WCAG 1.4.3). La liste n'est pas
 * décorative : elle décrit ce que les composants font réellement, et c'est elle
 * que le test de contraste parcourt.
 */
export const ENCRES = ['ink', 'ink-muted', 'ink-faint', 'brand', 'brand-strong'] as const;

/**
 * Tokens employés comme aplat ou pastille, jamais comme texte.
 *
 * Le seuil qui s'y applique est celui des éléments non textuels — 3:1
 * (WCAG 1.4.11). C'est le sens de la règle « jamais la couleur seule » : un
 * statut se lit par son libellé, en `ink`, et la couleur ne fait que le doubler.
 */
export const INDICATEURS = [
  'status-brouillon',
  'status-ouvert',
  'status-reclame',
  'status-soumis',
  'status-fusionne',
  'pattern-planification',
  'pattern-qualite',
  'pattern-execution',
  'pattern-revue',
  'pattern-securite',
  'pattern-orchestration',
] as const;

/** Catégories de patterns, telles que la bibliothèque les nomme (section 5.2). */
export const CATEGORIES_PATTERN = [
  'planification',
  'qualite',
  'execution',
  'revue',
  'securite',
  'orchestration',
] as const;

export type CategoriePattern = (typeof CATEGORIES_PATTERN)[number];

/** États de santé d'un jalon (section 11), alias de trois couleurs existantes. */
export const ETATS_SANTE = ['a_jour', 'a_risque', 'bloque'] as const;

export type EtatSante = (typeof ETATS_SANTE)[number];

export const PALETTE: Record<Theme, Record<string, string>> = {
  sombre: {
    'surface-000': '#05070c',
    'surface-100': '#0b0e15',
    'surface-200': '#12161f',
    'surface-300': '#1b212d',
    border: '#232a38',
    'border-strong': '#313a4d',
    ink: '#e7ebf2',
    'ink-muted': '#9aa8bf',
    'ink-faint': '#80899f',
    brand: '#4c8dff',
    'brand-strong': '#6ba3ff',
    'status-brouillon': '#6b7480',
    'status-ouvert': '#4c8dff',
    'status-reclame': '#e8a53d',
    'status-soumis': '#a78bfa',
    'status-fusionne': '#34d399',
    'pattern-planification': '#7c7ff2',
    'pattern-qualite': '#2dd4bf',
    'pattern-execution': '#fb923c',
    'pattern-revue': '#f472b6',
    'pattern-securite': '#f2555a',
    'pattern-orchestration': '#c084fc',
  },
  clair: {
    'surface-000': '#ffffff',
    'surface-100': '#f6f5f1',
    'surface-200': '#ffffff',
    'surface-300': '#ece9e2',
    border: '#ddd8cd',
    'border-strong': '#c7c0b0',
    ink: '#1a1d16',
    'ink-muted': '#5c6055',
    'ink-faint': '#66695e',
    brand: '#2061d5',
    'brand-strong': '#1f56c2',
    'status-brouillon': '#6b7280',
    'status-ouvert': '#2061d5',
    'status-reclame': '#b6791a',
    'status-soumis': '#7c5cd6',
    'status-fusionne': '#1d9469',
    'pattern-planification': '#4f52d6',
    'pattern-qualite': '#0c8378',
    'pattern-execution': '#c2540a',
    'pattern-revue': '#be185d',
    'pattern-securite': '#d1373d',
    'pattern-orchestration': '#9333ea',
  },
};

/**
 * Encre du monogramme, posée sur la pastille de catégorie.
 *
 * C'est le seul endroit où du texte se lit sur autre chose qu'une surface : la
 * lettre d'un `PatternChip`. Elle a donc son propre seuil à tenir, contre chacune
 * des six couleurs de catégorie.
 */
export const ENCRE_MONOGRAMME: Record<Theme, string> = {
  sombre: '#05070c',
  clair: '#ffffff',
};

/**
 * Les cinq valeurs qui s'écartent de la palette fournie, et pourquoi.
 *
 * Conservées dans le code plutôt que dans un commentaire : le test les relit
 * pour vérifier qu'aucune n'a été réintroduite par mégarde, et qu'aucune ne
 * traîne ici alors que la valeur d'origine passerait désormais.
 */
export const ECARTS_DE_PALETTE = [
  {
    token: 'ink-faint',
    theme: 'sombre' as const,
    fourni: '#5b6478',
    retenu: '#80899f',
    motif: 'Texte de substitution à 2,72:1 sur surface-300, sous le seuil de 4,5:1.',
  },
  {
    token: 'ink-faint',
    theme: 'clair' as const,
    fourni: '#8b8f82',
    retenu: '#66695e',
    motif: 'Même écart en clair : 2,73:1.',
  },
  {
    token: 'brand',
    theme: 'clair' as const,
    fourni: '#2f6fe0',
    retenu: '#2061d5',
    motif:
      'Accent porteur de texte à 3,87:1 sur surface-300. Entraîne status-ouvert, qui en est l’alias.',
  },
  {
    token: 'status-fusionne',
    theme: 'clair' as const,
    fourni: '#1f9d6f',
    retenu: '#1d9469',
    motif: 'Pastille à 2,83:1 sur surface-300, sous le seuil de 3:1 des éléments non textuels.',
  },
  {
    token: 'pattern-qualite',
    theme: 'clair' as const,
    fourni: '#0d9488',
    retenu: '#0c8378',
    motif: 'Monogramme blanc à 3,74:1 sur la pastille.',
  },
] as const;

/** Échelle d'espacement, en pixels. */
export const ESPACEMENTS = [4, 8, 12, 16, 24, 32, 48, 64] as const;

/** Rayons, en pixels. `pilule` sert aux badges. */
export const RAYONS = { sm: 4, md: 8, lg: 12, pilule: 999 } as const;

/** Seuils WCAG appliqués par le test de contraste. */
export const SEUIL_TEXTE = 4.5;
export const SEUIL_NON_TEXTUEL = 3;
