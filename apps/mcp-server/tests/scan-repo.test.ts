import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CheminInvalideError,
  resumerEnTexte,
  scanRepoResultatSchema,
  scannerDepot,
} from '../src/tools/scan-repo.js';
import { MAX_TODO_RAPPORTES, SEUIL_RAFALE_PAR_JOUR } from '../src/lib/analyse.js';

/**
 * SV-011 — test de contrat de l'outil `scan_repo` (section 21).
 *
 * Claude Code dépend directement du schéma de sortie de cet outil : sa forme
 * est donc vérifiée comme un contrat, sur de vrais dépôts fixture plutôt que
 * sur des doubles. Un double aurait rendu le test insensible à ce qui casse
 * réellement — un appel git qui change de format, un chemin qui n'existe pas.
 *
 * Les dates de commits sont fixées **à la création**, conformément à la règle
 * de la section 21 : un horodatage ne se recule pas après coup.
 */

const executer = promisify(execFile);

async function git(depot: string, args: string[], date?: string): Promise<void> {
  await executer('git', ['-C', depot, ...args], {
    windowsHide: true,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Fixture',
      GIT_AUTHOR_EMAIL: 'fixture@schemavibe.test',
      GIT_COMMITTER_NAME: 'Fixture',
      GIT_COMMITTER_EMAIL: 'fixture@schemavibe.test',
      ...(date ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : {}),
    },
  });
}

function ilYA(jours: number): string {
  return new Date(Date.now() - jours * 86_400_000).toISOString();
}

/** Dépôt actif, testé, sans TODO. */
let depotSain = '';
/** Dépôt vibe-codé : rafale de commits, abandonné, sans tests, plein de TODO. */
let depotAbandonne = '';
/** Export d'outil de vibe coding : pas de git du tout. */
let depotSansGit = '';

beforeAll(async () => {
  const base = await mkdtemp(join(tmpdir(), 'schemavibe-scan-'));

  // --- Dépôt sain ---------------------------------------------------------
  depotSain = join(base, 'sain');
  await mkdir(join(depotSain, 'src'), { recursive: true });
  await mkdir(join(depotSain, 'tests'), { recursive: true });
  await writeFile(join(depotSain, 'src', 'index.ts'), 'export const valeur = 1;\n');
  await writeFile(join(depotSain, 'tests', 'index.test.ts'), 'it("marche", () => {});\n');
  await writeFile(
    join(depotSain, 'package.json'),
    JSON.stringify({ name: 'sain', scripts: { test: 'vitest run' } }, null, 2),
  );

  await git(depotSain, ['init', '--initial-branch=main']);
  await git(depotSain, ['add', '.']);
  await git(depotSain, ['commit', '-m', 'Mise en place'], ilYA(5));
  await writeFile(join(depotSain, 'src', 'autre.ts'), 'export const autre = 2;\n');
  await git(depotSain, ['add', '.']);
  await git(depotSain, ['commit', '-m', 'Ajout'], ilYA(2));

  // --- Dépôt abandonné ----------------------------------------------------
  depotAbandonne = join(base, 'abandonne');
  await mkdir(join(depotAbandonne, 'src'), { recursive: true });
  await writeFile(
    join(depotAbandonne, 'src', 'app.js'),
    [
      'export function app() {',
      '  // TODO: brancher la vraie authentification',
      '  // FIXME: la validation est absente',
      '  return null;',
      '}',
      '// HACK: contournement temporaire',
    ].join('\n'),
  );
  await writeFile(
    join(depotAbandonne, 'package.json'),
    JSON.stringify(
      { name: 'abandonne', scripts: { test: 'echo "Error: no test specified" && exit 1' } },
      null,
      2,
    ),
  );

  await git(depotAbandonne, ['init', '--initial-branch=main']);
  await git(depotAbandonne, ['add', '.']);

  // Rafale : une salve de commits le même jour, il y a vingt jours. Les dates
  // sont posées à la création, jamais reculées après coup.
  const jourDeRafale = ilYA(20);
  await git(depotAbandonne, ['commit', '-m', 'Premier jet'], jourDeRafale);

  for (let index = 0; index < SEUIL_RAFALE_PAR_JOUR + 1; index += 1) {
    await writeFile(
      join(depotAbandonne, 'src', `module-${index}.js`),
      `export const n = ${index};\n`,
    );
    await git(depotAbandonne, ['add', '.']);
    await git(depotAbandonne, ['commit', '-m', `Itération ${index}`], jourDeRafale);
  }

  // --- Export sans git ----------------------------------------------------
  depotSansGit = join(base, 'export-bolt');
  await mkdir(depotSansGit, { recursive: true });
  await writeFile(join(depotSansGit, 'index.js'), '// TODO: tout reste à faire\n');
});

afterAll(async () => {
  for (const depot of [depotSain, depotAbandonne, depotSansGit]) {
    await rm(join(depot, '..'), { recursive: true, force: true });
    break;
  }
});

describe('contrat de sortie', () => {
  it('respecte le schéma déclaré, sur un dépôt sain', async () => {
    const resultat = await scannerDepot(depotSain);

    // C'est le test de contrat proprement dit : Claude Code dépend de cette
    // forme, elle est donc validée par le schéma lui-même.
    expect(scanRepoResultatSchema.safeParse(resultat).success).toBe(true);
  });

  it('respecte le schéma sur un dépôt abandonné', async () => {
    expect(scanRepoResultatSchema.safeParse(await scannerDepot(depotAbandonne)).success).toBe(true);
  });

  it('respecte le schéma sur un dossier sans git', async () => {
    expect(scanRepoResultatSchema.safeParse(await scannerDepot(depotSansGit)).success).toBe(true);
  });

  it('annonce toujours qu’aucun ticket n’a été poussé', async () => {
    const resultat = await scannerDepot(depotSain);

    // Le champ est un littéral `false` dans le schéma : il ne peut pas devenir
    // vrai sans que le contrat change, ce qu'un relecteur verrait.
    expect(resultat.pousse_vers_la_plateforme).toBe(false);
  });

  it('rend un chemin absolu, quel que soit le chemin demandé', async () => {
    const resultat = await scannerDepot(depotSain);

    expect(resultat.chemin).toBe(depotSain);
  });

  it('refuse un chemin inexistant sans planter le serveur', async () => {
    await expect(scannerDepot(join(depotSain, 'nulle-part'))).rejects.toBeInstanceOf(
      CheminInvalideError,
    );
  });
});

describe('densité de commits', () => {
  it('compte les commits récents d’un dépôt actif', async () => {
    const { commits } = await scannerDepot(depotSain);

    expect(commits.depot_git).toBe(true);
    expect(commits.total).toBe(2);
    expect(commits.jours_depuis_dernier).toBeLessThanOrEqual(3);
    expect(commits.rafale_detectee).toBe(false);
  });

  it('détecte une rafale sur un dépôt vibe-codé', async () => {
    const { commits } = await scannerDepot(depotAbandonne);

    expect(commits.rafale_detectee).toBe(true);
    expect(commits.jour_le_plus_dense).toBeGreaterThanOrEqual(SEUIL_RAFALE_PAR_JOUR);
  });

  it('signale l’abandon d’un dépôt sans activité récente', async () => {
    const resultat = await scannerDepot(depotAbandonne);

    expect(resultat.commits.jours_depuis_dernier).toBeGreaterThanOrEqual(14);
    expect(resultat.signaux.join(' ')).toContain('Dernier commit il y a');
  });

  it('traite l’absence de git comme un constat, pas comme une erreur', async () => {
    const resultat = await scannerDepot(depotSansGit);

    expect(resultat.commits.depot_git).toBe(false);
    expect(resultat.commits.total).toBe(0);
    expect(resultat.signaux.join(' ')).toContain('Aucun dépôt git');
  });
});

describe('présence de tests', () => {
  it('reconnaît un dépôt testé', async () => {
    const { tests } = await scannerDepot(depotSain);

    expect(tests.present).toBe(true);
    expect(tests.fichiers).toBeGreaterThan(0);
    expect(tests.script_detecte).toBe('vitest run');
  });

  it('ne se laisse pas prendre par le script `test` par défaut de npm', async () => {
    const { tests } = await scannerDepot(depotAbandonne);

    // `echo "Error: no test specified" && exit 1` n'est pas un filet de tests.
    expect(tests.present).toBe(false);
    expect(tests.script_detecte).toBeNull();
  });

  it('signale l’absence de tests en clair', async () => {
    const resultat = await scannerDepot(depotAbandonne);

    expect(resultat.signaux.join(' ')).toContain('Aucun fichier de test détecté');
  });
});

describe('TODO non résolus', () => {
  it('relève TODO, FIXME et HACK', async () => {
    const { todos } = await scannerDepot(depotAbandonne);

    expect(todos.total).toBe(3);
    expect(todos.exemples.map((todo) => todo.marqueur).sort()).toEqual(['FIXME', 'HACK', 'TODO']);
  });

  it('rend le fichier et la ligne de chacun', async () => {
    const { todos } = await scannerDepot(depotAbandonne);
    const premier = todos.exemples.find((todo) => todo.marqueur === 'TODO');

    expect(premier?.fichier).toBe('src/app.js');
    expect(premier?.ligne).toBe(2);
    expect(premier?.texte).toContain('authentification');
  });

  it('n’en trouve aucun dans un dépôt propre', async () => {
    const { todos } = await scannerDepot(depotSain);

    expect(todos.total).toBe(0);
    expect(todos.exemples).toEqual([]);
  });

  it('borne le nombre d’exemples rapportés', async () => {
    const { todos } = await scannerDepot(depotAbandonne);

    expect(todos.exemples.length).toBeLessThanOrEqual(MAX_TODO_RAPPORTES);
  });
});

describe('résumé en texte', () => {
  it('reprend chaque signal et rappelle qu’aucun ticket n’a été créé', async () => {
    const resultat = await scannerDepot(depotAbandonne);
    const texte = resumerEnTexte(resultat);

    for (const signal of resultat.signaux) {
      expect(texte).toContain(signal);
    }

    expect(texte).toContain('Aucun ticket n’a été créé');
    expect(texte).toContain('create_tickets');
  });

  it('cite les TODO relevés avec leur emplacement', async () => {
    const texte = resumerEnTexte(await scannerDepot(depotAbandonne));

    expect(texte).toContain('src/app.js:2');
  });
});
