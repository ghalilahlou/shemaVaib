import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TravailIllisible, decrireTravail } from '../src/lib/travail-local.js';
import { MAX_SORTIE_TESTS, redigerResume } from '../src/tools/submit-solution.js';

/**
 * SV-019 — ce que git établit du travail d'une branche, contre de vrais dépôts.
 *
 * Le dépôt fixture réunit ce qui piège un analyseur naïf : un renommage, une
 * suppression, un nom accentué avec espace, un commit arrivé sur la base après
 * le départ de la branche, et des modifications jamais commitées.
 */

const executer = promisify(execFile);

let racine = '';
let depot = '';

async function git(...args: string[]): Promise<void> {
  await executer('git', ['-C', depot, ...args], {
    windowsHide: true,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@schemavibe.test',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@schemavibe.test',
    },
  });
}

async function ecrire(chemin: string, contenu: string): Promise<void> {
  await mkdir(dirname(join(depot, chemin)), { recursive: true });
  await writeFile(join(depot, chemin), contenu);
}

beforeAll(async () => {
  racine = await mkdtemp(join(tmpdir(), 'schemavibe-travail-'));
  depot = join(racine, 'projet');
  await mkdir(depot);

  await git('init', '--initial-branch=main');
  await ecrire('src/a.ts', 'export const a = 1;\n');
  await ecrire('src/b.ts', 'export const b = 1;\n');
  await ecrire('src/ancien.ts', 'export const nom = "un contenu assez long pour être reconnu";\n');
  await git('add', '.');
  await git('commit', '-m', 'départ');

  await git('switch', '-c', 'travail');
  await ecrire('src/a.ts', 'export const a = 2;\n');
  await git('rm', '-q', 'src/b.ts');
  await git('mv', 'src/ancien.ts', 'src/nouveau.ts');
  await ecrire('src/filtre.test.ts', 'test("filtre", () => {});\n');
  await ecrire('docs/note à relire.md', 'Une note.\n');
  await git('add', '.');
  await git('commit', '-m', 'travail du ticket');

  // Arrivé sur la base après le départ de la branche : ce n'est pas le travail
  // de la branche, et il ne doit pas apparaître.
  await git('switch', 'main');
  await ecrire('src/hors-branche.ts', 'export const h = 1;\n');
  await git('add', '.');
  await git('commit', '-m', 'autre travail sur main');
  await git('switch', 'travail');

  // Jamais commité : une modification, et un fichier inconnu de git.
  await ecrire('src/a.ts', 'export const a = 3;\n');
  await ecrire('brouillon.txt', 'pas commité\n');
});

afterAll(async () => {
  await rm(racine, { recursive: true, force: true });
});

describe('decrireTravail', () => {
  it('liste ce que la branche a changé depuis son départ, et seulement cela', async () => {
    const travail = await decrireTravail(depot);

    expect(travail.base).toBe('main');
    expect(travail.fichiers).toEqual([
      { chemin: 'docs/note à relire.md', nature: 'ajoute' },
      { chemin: 'src/a.ts', nature: 'modifie' },
      { chemin: 'src/b.ts', nature: 'supprime' },
      { chemin: 'src/filtre.test.ts', nature: 'ajoute' },
      { chemin: 'src/nouveau.ts', nature: 'renomme' },
    ]);
  });

  it('reconnaît les tests touchés selon les motifs de scan_repo', async () => {
    expect((await decrireTravail(depot)).tests_touches).toEqual(['src/filtre.test.ts']);
  });

  it('compte à part ce qui n’est pas commité', async () => {
    expect((await decrireTravail(depot)).non_commites).toBe(2);
  });

  it('accepte une base désignée', async () => {
    expect((await decrireTravail(depot, 'main')).base).toBe('main');
  });

  it('refuse une base inexistante en la nommant', async () => {
    await expect(decrireTravail(depot, 'develop')).rejects.toThrow(/develop/);
    await expect(decrireTravail(depot, 'develop')).rejects.toBeInstanceOf(TravailIllisible);
  });

  it('refuse un répertoire qui n’est pas un dépôt git', async () => {
    await expect(decrireTravail(racine)).rejects.toBeInstanceOf(TravailIllisible);
  });
});

describe('redigerResume', () => {
  const travail = {
    base: 'main',
    fichiers: [
      { chemin: 'src/a.ts', nature: 'modifie' as const },
      { chemin: 'src/a.test.ts', nature: 'ajoute' as const },
    ],
    tests_touches: ['src/a.test.ts'],
    non_commites: 0,
  };

  it('sépare ce que git établit de ce que l’agent déclare', () => {
    const resume = redigerResume({
      titre: 'Filtrer les tickets',
      travail,
      decisions: ['Filtre porté par l’URL, pour survivre au rechargement.'],
      tests_locaux: { commande: 'pnpm test', reussi: true },
    });

    expect(resume).toContain('### Fichiers modifiés (2) — depuis `main`');
    expect(resume).toContain('- ajouté : `src/a.test.ts`');
    expect(resume).toContain('- Filtre porté par l’URL, pour survivre au rechargement.');
    expect(resume).toContain('déclarés par l’agent, non vérifiés par la plateforme');
    expect(resume).toContain('- `pnpm test` : réussi');
  });

  it('dit un échec de tests en clair et tronque une sortie trop longue', () => {
    const resume = redigerResume({
      titre: 'T',
      travail,
      decisions: ['d'],
      tests_locaux: {
        commande: 'pnpm test',
        reussi: false,
        sortie: 'x'.repeat(MAX_SORTIE_TESTS + 50),
      },
    });

    expect(resume).toContain('**échec**');
    expect(resume).toContain('(sortie tronquée)');
    expect(resume).not.toContain('x'.repeat(MAX_SORTIE_TESTS + 1));
  });

  it('signale ce qui n’est pas commité, et l’absence de tests déclarés', () => {
    const resume = redigerResume({
      titre: 'T',
      travail: { ...travail, non_commites: 3 },
      decisions: ['d'],
    });

    expect(resume).toContain('3 fichier(s) modifié(s) mais non commité(s)');
    expect(resume).toContain('_Aucun test local déclaré._');
  });
});
