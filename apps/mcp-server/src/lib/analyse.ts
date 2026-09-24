import { execFile } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { promisify } from 'node:util';

const executer = promisify(execFile);

/**
 * Analyse locale d'un dépôt (section 8).
 *
 * Trois signaux, choisis parce qu'ils se mesurent sans rien deviner : la
 * densité de commits récents, la présence de tests, et les TODO non résolus.
 * Ils correspondent à ce que la veille de la section 25 identifie comme les
 * marques d'un projet vibe-codé laissé en l'état — une rafale de commits, puis
 * plus rien, et pas de filet.
 *
 * Tout se fait en lecture seule et hors ligne. L'analyse ne pousse rien, ne
 * crée rien, et ne contacte aucun service.
 */

/** Fenêtre d'observation de l'activité récente. */
export const FENETRE_JOURS = 30;

/** Au-delà, une journée est considérée comme une rafale (section 13). */
export const SEUIL_RAFALE_PAR_JOUR = 10;

/** Nombre maximal de TODO rapportés, pour que la sortie reste lisible. */
export const MAX_TODO_RAPPORTES = 20;

/** Dossiers jamais parcourus : volumineux, générés, ou sans intérêt. */
const DOSSIERS_IGNORES = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.next',
  'coverage',
  '.turbo',
  'vendor',
  '__pycache__',
]);

/** Extensions considérées comme du code source. */
const EXTENSIONS_SOURCE = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.rb',
  '.go',
  '.rs',
  '.java',
  '.php',
  '.sql',
  '.css',
  '.svelte',
  '.vue',
]);

/** Ce qui trahit un fichier de test, quel que soit l'écosystème. */
const MOTIFS_TEST = [
  /\.test\./,
  /\.spec\./,
  /_test\./,
  /(^|[\\/])tests?[\\/]/,
  /(^|[\\/])__tests__[\\/]/,
];

/**
 * Marqueur suivi de deux-points, éventuellement précédé d'un responsable entre
 * parenthèses — `TODO:`, `FIXME(alice):`.
 *
 * Le deux-points est exigé, et c'est ce qui sépare un relevé utile du bruit :
 * sans lui, la moindre phrase qui *mentionne* un TODO en devient un. Passé sur
 * son propre dépôt, le scanner s'en signalait vingt et un dont aucun n'en était.
 */
const MOTIF_TODO = /\b(TODO|FIXME|HACK|XXX)\b(?:\([^)]*\))?\s*:\s*(.*)$/;

export interface TodoTrouve {
  fichier: string;
  ligne: number;
  marqueur: string;
  texte: string;
}

export interface Commits {
  depot_git: boolean;
  fenetre_jours: number;
  total: number;
  par_semaine: number;
  dernier_le: string | null;
  jours_depuis_dernier: number | null;
  rafale_detectee: boolean;
  jour_le_plus_dense: number;
}

export interface Tests {
  present: boolean;
  fichiers: number;
  script_detecte: string | null;
}

export interface Todos {
  total: number;
  exemples: TodoTrouve[];
}

/** Rend `true` si le chemin est un dépôt git exploitable. */
export async function estUnDepotGit(chemin: string): Promise<boolean> {
  try {
    await executer('git', ['-C', chemin, 'rev-parse', '--git-dir'], { windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Densité de commits sur la fenêtre d'observation.
 *
 * Un dépôt sans git n'est pas une erreur : c'est un export d'outil de vibe
 * coding, cas explicitement visé par le scanner (section 6). L'analyse le dit
 * plutôt que d'échouer.
 */
export async function analyserCommits(chemin: string): Promise<Commits> {
  const vide: Commits = {
    depot_git: false,
    fenetre_jours: FENETRE_JOURS,
    total: 0,
    par_semaine: 0,
    dernier_le: null,
    jours_depuis_dernier: null,
    rafale_detectee: false,
    jour_le_plus_dense: 0,
  };

  if (!(await estUnDepotGit(chemin))) {
    return vide;
  }

  let sortie = '';

  try {
    const resultat = await executer(
      'git',
      ['-C', chemin, 'log', `--since=${FENETRE_JOURS}.days`, '--date=short', '--format=%cd'],
      { windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
    );
    sortie = resultat.stdout;
  } catch {
    // Un dépôt sans commit fait échouer `git log` : c'est un dépôt git vide,
    // pas une anomalie.
    return { ...vide, depot_git: true };
  }

  const dates = sortie
    .split('\n')
    .map((ligne) => ligne.trim())
    .filter((ligne) => ligne.length > 0);

  const parJour = new Map<string, number>();
  for (const date of dates) {
    parJour.set(date, (parJour.get(date) ?? 0) + 1);
  }

  const jourLePlusDense = parJour.size === 0 ? 0 : Math.max(...parJour.values());
  const dernier = await dernierCommit(chemin);

  return {
    depot_git: true,
    fenetre_jours: FENETRE_JOURS,
    total: dates.length,
    par_semaine: Math.round((dates.length / FENETRE_JOURS) * 7 * 10) / 10,
    dernier_le: dernier,
    jours_depuis_dernier: dernier === null ? null : joursDepuis(dernier),
    rafale_detectee: jourLePlusDense >= SEUIL_RAFALE_PAR_JOUR,
    jour_le_plus_dense: jourLePlusDense,
  };
}

async function dernierCommit(chemin: string): Promise<string | null> {
  try {
    const { stdout } = await executer(
      'git',
      ['-C', chemin, 'log', '-1', '--date=short', '--format=%cd'],
      { windowsHide: true },
    );
    const date = stdout.trim();
    return date.length > 0 ? date : null;
  } catch {
    return null;
  }
}

function joursDepuis(date: string): number {
  const ecart = Date.now() - new Date(`${date}T00:00:00Z`).getTime();
  return Math.max(0, Math.floor(ecart / 86_400_000));
}

/** Parcourt récursivement le dépôt et rend les chemins relatifs des fichiers source. */
export async function listerFichiers(racine: string): Promise<string[]> {
  const trouves: string[] = [];

  async function parcourir(dossier: string): Promise<void> {
    let entrees;

    try {
      entrees = await readdir(dossier, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entree of entrees) {
      if (entree.isDirectory()) {
        if (!DOSSIERS_IGNORES.has(entree.name)) {
          await parcourir(join(dossier, entree.name));
        }
        continue;
      }

      trouves.push(join(dossier, entree.name));
    }
  }

  await parcourir(racine);

  return trouves.map((chemin) => relative(racine, chemin).split(sep).join('/'));
}

/** Présence d'un filet de tests, par les fichiers et par les scripts déclarés. */
export async function analyserTests(racine: string, fichiers: string[]): Promise<Tests> {
  const fichiersTest = fichiers.filter((fichier) =>
    MOTIFS_TEST.some((motif) => motif.test(`/${fichier}`)),
  );

  return {
    present: fichiersTest.length > 0,
    fichiers: fichiersTest.length,
    script_detecte: await scriptDeTest(racine),
  };
}

/** Le script `test` déclaré dans le package.json racine, s'il existe. */
async function scriptDeTest(racine: string): Promise<string | null> {
  const chemin = join(racine, 'package.json');

  try {
    await stat(chemin);
    const contenu = JSON.parse(await readFile(chemin, 'utf8')) as {
      scripts?: Record<string, string>;
    };
    const script = contenu.scripts?.test;

    // `npm init` écrit un script `test` qui ne fait qu'échouer : le compter
    // comme un filet de tests serait trompeur.
    if (!script || script.includes('no test specified')) {
      return null;
    }

    return script;
  } catch {
    return null;
  }
}

/** TODO, FIXME, HACK et XXX laissés dans le code source. */
export async function analyserTodos(racine: string, fichiers: string[]): Promise<Todos> {
  const exemples: TodoTrouve[] = [];
  let total = 0;

  for (const fichier of fichiers) {
    const extension = fichier.slice(fichier.lastIndexOf('.'));

    if (!EXTENSIONS_SOURCE.has(extension)) {
      continue;
    }

    let contenu: string;

    try {
      contenu = await readFile(join(racine, fichier), 'utf8');
    } catch {
      continue;
    }

    const lignes = contenu.split('\n');

    for (let index = 0; index < lignes.length; index += 1) {
      const correspondance = MOTIF_TODO.exec(lignes[index] ?? '');

      if (!correspondance) {
        continue;
      }

      total += 1;

      if (exemples.length < MAX_TODO_RAPPORTES) {
        exemples.push({
          fichier,
          ligne: index + 1,
          marqueur: correspondance[1] ?? 'TODO',
          texte: (correspondance[2] ?? '').trim().slice(0, 160),
        });
      }
    }
  }

  return { total, exemples };
}

/**
 * Observations en clair, tirées des trois mesures.
 *
 * Elles décrivent ce qui a été constaté, sans jamais recommander d'action ni
 * préjuger de ce qu'il faudrait faire : la décision appartient au porteur du
 * projet, et l'outil ne pousse rien (section 8).
 */
export function formulerSignaux(commits: Commits, tests: Tests, todos: Todos): string[] {
  const signaux: string[] = [];

  if (!commits.depot_git) {
    signaux.push(
      'Aucun dépôt git : l’historique est indisponible, ce qui est fréquent sur un export d’outil de vibe coding.',
    );
  } else if (commits.total === 0) {
    signaux.push(`Aucun commit sur les ${commits.fenetre_jours} derniers jours.`);
  } else {
    signaux.push(
      `${commits.total} commits sur ${commits.fenetre_jours} jours, soit ${commits.par_semaine} par semaine.`,
    );
  }

  if (commits.rafale_detectee) {
    signaux.push(
      `Rafale détectée : jusqu’à ${commits.jour_le_plus_dense} commits en une seule journée.`,
    );
  }

  if (commits.jours_depuis_dernier !== null && commits.jours_depuis_dernier >= 14) {
    signaux.push(`Dernier commit il y a ${commits.jours_depuis_dernier} jours.`);
  }

  signaux.push(
    tests.present
      ? `${tests.fichiers} fichiers de test détectés.`
      : 'Aucun fichier de test détecté.',
  );

  if (tests.script_detecte === null) {
    signaux.push('Aucun script de test déclaré dans le package.json.');
  }

  if (todos.total > 0) {
    signaux.push(`${todos.total} TODO ou FIXME non résolus.`);
  }

  return signaux;
}
