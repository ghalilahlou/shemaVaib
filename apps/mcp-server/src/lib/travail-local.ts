import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { estUnDepotGit, estUnFichierDeTest } from './analyse.js';

const executer = promisify(execFile);

/**
 * Ce que git établit du travail fait sur une branche (SV-019).
 *
 * C'est la partie du résumé de soumission qui ne dépend pas de la parole de
 * l'agent : les fichiers modifiés et les tests touchés se lisent dans le dépôt.
 * Les décisions prises et les résultats des tests locaux, eux, sont déclarés —
 * `redigerResume` les présente comme tels.
 *
 * Lecture seule, hors ligne : rien n'est poussé ni récupéré.
 */

/** Bases essayées dans l'ordre quand l'appelant n'en désigne pas. */
export const BASES_PAR_DEFAUT = ['origin/main', 'main', 'origin/master', 'master'] as const;

export type NatureModification = 'ajoute' | 'modifie' | 'supprime' | 'renomme';

export interface FichierModifie {
  chemin: string;
  nature: NatureModification;
}

export interface TravailLocal {
  /** Référence depuis laquelle le travail est compté. */
  base: string;
  fichiers: FichierModifie[];
  /** Fichiers de test ajoutés, modifiés ou renommés — pas supprimés. */
  tests_touches: string[];
  /**
   * Nombre de chemins modifiés mais non commités. Ils ne figurent pas dans
   * `fichiers` : un diff publié ne les contient pas non plus.
   */
  non_commites: number;
}

export class TravailIllisible extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TravailIllisible';
  }
}

async function git(depot: string, args: string[]): Promise<string> {
  const { stdout } = await executer('git', ['-C', depot, '-c', 'core.quotepath=false', ...args], {
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });

  return stdout;
}

async function existe(depot: string, reference: string): Promise<boolean> {
  try {
    await git(depot, ['rev-parse', '--verify', '--quiet', `${reference}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

async function resoudreBase(depot: string, demandee: string | undefined): Promise<string> {
  if (demandee) {
    if (await existe(depot, demandee)) {
      return demandee;
    }

    throw new TravailIllisible(`La base « ${demandee} » n’existe pas dans ce dépôt.`);
  }

  for (const candidate of BASES_PAR_DEFAUT) {
    if (await existe(depot, candidate)) {
      return candidate;
    }
  }

  throw new TravailIllisible(
    `Aucune base trouvée parmi ${BASES_PAR_DEFAUT.join(', ')} : précisez celle de la branche.`,
  );
}

const NATURES: Record<string, NatureModification> = {
  A: 'ajoute',
  M: 'modifie',
  D: 'supprime',
  R: 'renomme',
  // Une copie, un changement de type : pour un relecteur, le fichier a changé.
  C: 'ajoute',
  T: 'modifie',
};

/**
 * Lit la sortie de `git diff --name-status -z`, où chaque champ est terminé par
 * un octet nul et où un renommage porte deux chemins, l'ancien puis le nouveau.
 * Le format `-z` est le seul qui ne dépende ni des espaces ni des accents.
 */
function lireNameStatus(sortie: string): FichierModifie[] {
  const champs = sortie.split('\0').filter((champ) => champ.length > 0);
  const fichiers: FichierModifie[] = [];

  for (let i = 0; i < champs.length;) {
    const code = champs[i]!.charAt(0);
    const avecDeuxChemins = code === 'R' || code === 'C';
    const chemin = champs[i + (avecDeuxChemins ? 2 : 1)];

    if (chemin !== undefined) {
      fichiers.push({ chemin, nature: NATURES[code] ?? 'modifie' });
    }

    i += avecDeuxChemins ? 3 : 2;
  }

  return fichiers.sort((a, b) => a.chemin.localeCompare(b.chemin));
}

/** Décrit le travail de la branche courante depuis son point de départ sur la base. */
export async function decrireTravail(depot: string, baseDemandee?: string): Promise<TravailLocal> {
  if (!(await estUnDepotGit(depot))) {
    throw new TravailIllisible(`« ${depot} » n’est pas un dépôt git.`);
  }

  const base = await resoudreBase(depot, baseDemandee);
  // Depuis l'ancêtre commun, et non depuis la pointe de la base : ce qui a été
  // fusionné sur la base entre-temps n'est pas le travail de cette branche.
  const depart = (await git(depot, ['merge-base', base, 'HEAD'])).trim();
  const fichiers = lireNameStatus(
    await git(depot, ['diff', '--name-status', '-M', '-z', depart, 'HEAD']),
  );
  const statut = await git(depot, ['status', '--porcelain', '-z']);

  return {
    base,
    fichiers,
    tests_touches: fichiers
      .filter((fichier) => fichier.nature !== 'supprime' && estUnFichierDeTest(fichier.chemin))
      .map((fichier) => fichier.chemin),
    non_commites: statut.split('\0').filter((ligne) => /^.. /.test(ligne)).length,
  };
}
