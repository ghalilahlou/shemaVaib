import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { arrondi, contraste, estHexaValide, luminance } from '../../components/ui/contraste';
import {
  CATEGORIES_PATTERN,
  ECARTS_DE_PALETTE,
  ENCRES,
  ENCRE_MONOGRAMME,
  ESPACEMENTS,
  INDICATEURS,
  PALETTE,
  RAYONS,
  SEUIL_NON_TEXTUEL,
  SEUIL_TEXTE,
  SURFACES,
  THEMES,
  type Theme,
} from '../../components/ui/tokens';

/**
 * SV-015 — le critère du ticket, vérifié par le calcul.
 *
 * Une relecture visuelle ne dit pas si `#9aa8bf` tient 4,5:1 sur `#1b212d` ; elle
 * dit qu'on trouve ça lisible, ce qui n'est pas la même chose et dépend de
 * l'écran. Ce fichier tranche à la place de l'œil, dans les deux thèmes, pour
 * chaque paire que les composants forment réellement.
 *
 * Le second bloc vérifie autre chose, et c'est indispensable au premier : que la
 * feuille de style dit bien la même chose que les tokens. Sans lui, ce test
 * validerait une palette que l'application n'utilise pas — le genre de test qui
 * passe pour la mauvaise raison (section 21).
 */

const CHEMIN_CSS = fileURLToPath(new URL('../../app/globals.css', import.meta.url));
const CSS = readFileSync(CHEMIN_CSS, 'utf8');

/** Extrait les déclarations `--token: valeur;` d'un bloc de sélecteur donné. */
function variablesDuBloc(selecteur: string): Map<string, string> {
  const debut = CSS.indexOf(selecteur);

  if (debut === -1) {
    throw new Error(`Bloc « ${selecteur} » introuvable dans globals.css.`);
  }

  const ouvrante = CSS.indexOf('{', debut);
  const fermante = CSS.indexOf('}', ouvrante);
  const corps = CSS.slice(ouvrante + 1, fermante);

  const trouvees = new Map<string, string>();

  for (const ligne of corps.split('\n')) {
    const correspondance = /^\s*--([a-z0-9-]+):\s*([^;]+);/.exec(ligne);

    if (correspondance) {
      trouvees.set(correspondance[1]!, correspondance[2]!.trim());
    }
  }

  return trouvees;
}

/**
 * Valeur effective d'un token dans un thème.
 *
 * Le bloc clair ne redéclare que ce qui change : tout le reste est hérité du
 * bloc racine, exactement comme dans le navigateur.
 */
function valeurCss(theme: Theme, token: string): string | undefined {
  const racine = variablesDuBloc(':root {');

  if (theme === 'sombre') {
    return racine.get(token);
  }

  return variablesDuBloc(":root[data-theme='light']").get(token) ?? racine.get(token);
}

describe('la feuille de style dit la même chose que les tokens', () => {
  for (const theme of THEMES) {
    it(`transcrit fidèlement la palette ${theme}`, () => {
      const attendu = PALETTE[theme];
      const constate: Record<string, string | undefined> = {};

      for (const token of Object.keys(attendu)) {
        constate[token] = valeurCss(theme, token);
      }

      expect(constate).toEqual(attendu);
    });

    it(`transcrit l’encre du monogramme ${theme}`, () => {
      expect(valeurCss(theme, 'monogramme-ink')).toBe(ENCRE_MONOGRAMME[theme]);
    });
  }

  it('déclare les alias de santé sans leur inventer de couleur propre', () => {
    // Un alias qui deviendrait une valeur en dur cesserait de suivre le token
    // dont il dépend, et divergerait au premier ajustement.
    expect(valeurCss('sombre', 'health-a-jour')).toBe('var(--status-fusionne)');
    expect(valeurCss('sombre', 'health-a-risque')).toBe('var(--status-reclame)');
    expect(valeurCss('sombre', 'health-bloque')).toBe('var(--pattern-securite)');
  });

  it('déclare les bornes de la jauge comme des alias', () => {
    expect(valeurCss('sombre', 'vibe-score-low')).toBe('var(--status-brouillon)');
    expect(valeurCss('sombre', 'vibe-score-mid')).toBe('var(--status-reclame)');
    expect(valeurCss('sombre', 'vibe-score-high')).toBe('var(--brand)');
  });

  it('fait de status-ouvert l’alias exact de brand', () => {
    for (const theme of THEMES) {
      expect(PALETTE[theme]['status-ouvert']).toBe(PALETTE[theme].brand);
    }
  });

  it('n’emploie que des couleurs bien formées', () => {
    for (const theme of THEMES) {
      for (const [token, valeur] of Object.entries(PALETTE[theme])) {
        expect(estHexaValide(valeur), `${theme}/${token}`).toBe(true);
      }
    }
  });
});

/** Le critère nommé par le ticket. */
describe('contraste du texte sur chaque surface', () => {
  for (const theme of THEMES) {
    for (const encre of ENCRES) {
      for (const surface of SURFACES) {
        it(`${theme} — ${encre} sur ${surface} atteint ${SEUIL_TEXTE}:1`, () => {
          const rapport = contraste(PALETTE[theme][encre]!, PALETTE[theme][surface]!);

          expect(arrondi(rapport)).toBeGreaterThanOrEqual(SEUIL_TEXTE);
        });
      }
    }
  }
});

describe('contraste des pastilles sur chaque surface', () => {
  for (const theme of THEMES) {
    for (const indicateur of INDICATEURS) {
      for (const surface of SURFACES) {
        it(`${theme} — ${indicateur} sur ${surface} atteint ${SEUIL_NON_TEXTUEL}:1`, () => {
          // Seuil des éléments non textuels : ces couleurs ne portent jamais de
          // texte, le libellé qui les accompagne est en `ink`.
          const rapport = contraste(PALETTE[theme][indicateur]!, PALETTE[theme][surface]!);

          expect(arrondi(rapport)).toBeGreaterThanOrEqual(SEUIL_NON_TEXTUEL);
        });
      }
    }
  }
});

describe('contraste du monogramme sur sa pastille de catégorie', () => {
  for (const theme of THEMES) {
    for (const categorie of CATEGORIES_PATTERN) {
      it(`${theme} — la lettre se lit sur ${categorie}`, () => {
        // Le seul texte du système qui ne se lit pas sur une surface.
        const rapport = contraste(ENCRE_MONOGRAMME[theme], PALETTE[theme][`pattern-${categorie}`]!);

        expect(arrondi(rapport)).toBeGreaterThanOrEqual(SEUIL_TEXTE);
      });
    }
  }
});

describe('écarts assumés par rapport à la palette fournie', () => {
  it('retient bien la valeur corrigée, et non celle d’origine', () => {
    for (const ecart of ECARTS_DE_PALETTE) {
      expect(PALETTE[ecart.theme][ecart.token], ecart.token).toBe(ecart.retenu);
    }
  });

  it('ne consigne que des écarts réellement nécessaires', () => {
    // Un écart dont la valeur d'origine passerait désormais le seuil n'aurait
    // plus lieu d'être : le registre resterait à corriger la palette d'un
    // problème qui n'existe plus.
    for (const ecart of ECARTS_DE_PALETTE) {
      const seuil = ecart.token.startsWith('status-') ? SEUIL_NON_TEXTUEL : SEUIL_TEXTE;
      const pire = Math.min(
        ...SURFACES.map((surface) => contraste(ecart.fourni, PALETTE[ecart.theme][surface]!)),
      );
      const contreLaPastille =
        ecart.token === 'pattern-qualite'
          ? contraste(ENCRE_MONOGRAMME[ecart.theme], ecart.fourni)
          : Number.POSITIVE_INFINITY;

      expect(Math.min(pire, contreLaPastille), ecart.token).toBeLessThan(seuil);
    }
  });

  it('conserve la teinte d’origine', () => {
    // Corriger un contraste déplace la clarté, jamais la couleur : un écart qui
    // changerait la teinte serait une décision de design, pas une correction.
    for (const ecart of ECARTS_DE_PALETTE) {
      expect(luminance(ecart.retenu), ecart.token).not.toBe(luminance(ecart.fourni));
    }
  });
});

describe('échelles', () => {
  it('déclare les quatre rayons, dont la pilule des badges', () => {
    expect(RAYONS).toEqual({ sm: 4, md: 8, lg: 12, pilule: 999 });

    for (const [nom, valeur] of Object.entries(RAYONS)) {
      expect(valeurCss('sombre', `radius-${nom}`)).toBe(`${valeur}px`);
    }
  });

  it('progresse par pas de quatre pixels', () => {
    expect(ESPACEMENTS).toEqual([4, 8, 12, 16, 24, 32, 48, 64]);
    expect(ESPACEMENTS.every((valeur) => valeur % 4 === 0)).toBe(true);
  });
});

describe('le calcul de contraste lui-même', () => {
  it('donne 21 pour du noir sur du blanc', () => {
    expect(arrondi(contraste('#000000', '#ffffff'))).toBe(21);
  });

  it('donne 1 pour deux couleurs identiques', () => {
    expect(contraste('#4c8dff', '#4c8dff')).toBe(1);
  });

  it('ne dépend pas de l’ordre des arguments', () => {
    expect(contraste('#05070c', '#e7ebf2')).toBe(contraste('#e7ebf2', '#05070c'));
  });

  it('refuse une couleur mal formée plutôt que de rendre un nombre', () => {
    expect(() => contraste('bleu', '#ffffff')).toThrow();
    expect(() => contraste('#fff', '#ffffff')).toThrow();
  });
});
