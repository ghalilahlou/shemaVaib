import { resolve } from 'node:path';
import { stat } from 'node:fs/promises';
import { z } from 'zod';
import {
  analyserCommits,
  analyserTests,
  analyserTodos,
  formulerSignaux,
  listerFichiers,
  MAX_TODO_RAPPORTES,
} from '../lib/analyse.js';

/**
 * Outil MCP `scan_repo` (section 8).
 *
 * Analyse un dépôt local et rend un constat structuré. Il ne pousse rien : la
 * création de tickets appartient à `create_tickets`, qui exige une confirmation
 * explicite et ne fait pas partie de ce ticket. Le champ `pousse_vers_la_plateforme`
 * le dit dans la sortie elle-même, pour que l'appelant — humain ou agent — ne
 * puisse pas s'y méprendre.
 */

export const scanRepoInputSchema = {
  chemin: z
    .string()
    .min(1)
    .describe('Chemin du dépôt à analyser, absolu ou relatif au répertoire courant.'),
};

export const scanRepoOutputSchema = {
  chemin: z.string().describe('Chemin absolu du dépôt analysé.'),
  analyse_le: z.string().describe('Horodatage ISO 8601 de l’analyse.'),
  pousse_vers_la_plateforme: z
    .literal(false)
    .describe('Toujours faux : cet outil observe, il n’écrit jamais sur la plateforme.'),
  commits: z.object({
    depot_git: z.boolean(),
    fenetre_jours: z.number().int(),
    total: z.number().int(),
    par_semaine: z.number(),
    dernier_le: z.string().nullable(),
    jours_depuis_dernier: z.number().int().nullable(),
    rafale_detectee: z.boolean(),
    jour_le_plus_dense: z.number().int(),
  }),
  tests: z.object({
    present: z.boolean(),
    fichiers: z.number().int(),
    script_detecte: z.string().nullable(),
  }),
  todos: z.object({
    total: z.number().int(),
    exemples: z.array(
      z.object({
        fichier: z.string(),
        ligne: z.number().int(),
        marqueur: z.string(),
        texte: z.string(),
      }),
    ),
  }),
  signaux: z.array(z.string()).describe('Observations en clair, sans recommandation.'),
};

export const scanRepoResultatSchema = z.object(scanRepoOutputSchema);

export type ScanRepoResultat = z.infer<typeof scanRepoResultatSchema>;

/** Erreur d'un chemin inexploitable, distincte d'une panne d'analyse. */
export class CheminInvalideError extends Error {
  constructor(chemin: string) {
    super(`Le chemin « ${chemin} » n’existe pas ou n’est pas un dossier.`);
    this.name = 'CheminInvalideError';
  }
}

/** Exécute l'analyse et rend le constat structuré. */
export async function scannerDepot(cheminDemande: string): Promise<ScanRepoResultat> {
  const chemin = resolve(cheminDemande);

  try {
    const infos = await stat(chemin);

    if (!infos.isDirectory()) {
      throw new CheminInvalideError(cheminDemande);
    }
  } catch (erreur) {
    if (erreur instanceof CheminInvalideError) {
      throw erreur;
    }
    throw new CheminInvalideError(cheminDemande);
  }

  const fichiers = await listerFichiers(chemin);

  const [commits, tests, todos] = await Promise.all([
    analyserCommits(chemin),
    analyserTests(chemin, fichiers),
    analyserTodos(chemin, fichiers),
  ]);

  return {
    chemin,
    analyse_le: new Date().toISOString(),
    pousse_vers_la_plateforme: false,
    commits,
    tests,
    todos,
    signaux: formulerSignaux(commits, tests, todos),
  };
}

/** Résumé lisible, pour les clients MCP qui n'exploitent pas la sortie structurée. */
export function resumerEnTexte(resultat: ScanRepoResultat): string {
  const lignes = [
    `Analyse de ${resultat.chemin}`,
    '',
    ...resultat.signaux.map((signal) => `- ${signal}`),
  ];

  if (resultat.todos.exemples.length > 0) {
    lignes.push('', 'TODO relevés :');

    for (const todo of resultat.todos.exemples) {
      lignes.push(`- ${todo.fichier}:${todo.ligne} — ${todo.marqueur} ${todo.texte}`.trimEnd());
    }

    if (resultat.todos.total > MAX_TODO_RAPPORTES) {
      lignes.push(`- … et ${resultat.todos.total - MAX_TODO_RAPPORTES} autres.`);
    }
  }

  lignes.push(
    '',
    'Aucun ticket n’a été créé : cet outil observe seulement. La création passe par ' +
      '`create_tickets`, qui demande une confirmation explicite.',
  );

  return lignes.join('\n');
}
