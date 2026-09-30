import { resolve } from 'node:path';
import { z } from 'zod';
import { identiteMcpSchema } from '@schemavibe/shared-types';
import type { SourceSession } from '../lib/plateforme.js';
import {
  lireContexteTicket,
  soumettreSolution,
  soumissionEnregistreeSchema,
} from '../lib/tickets.js';
import { decrireTravail, type TravailLocal } from '../lib/travail-local.js';

/**
 * Outil MCP `submit_solution` (section 8, SV-019).
 *
 * Pousse une solution comme soumission du ticket, accompagnée d'un résumé
 * Markdown stocké dans `resume_md` — jamais écrit comme fichier du dépôt
 * (section 23).
 *
 * DEUX TEMPS, ET LA CONFIRMATION EST UNE DONNÉE
 *
 * Sans `confirmer: true`, l'outil ne fait que rédiger le résumé et le rendre en
 * aperçu : rien n'est écrit sur la plateforme, et la sortie le dit par
 * `soumis: false`. C'est la même règle que `scan_repo` avec son champ
 * `pousse_vers_la_plateforme` : l'absence d'écriture se vérifie dans les
 * données, pas seulement dans la documentation.
 *
 * DEUX SOURCES, ET LE RÉSUMÉ LES DISTINGUE
 *
 * Les fichiers modifiés et les tests touchés sont lus dans git. Les décisions et
 * les résultats des tests locaux sont déclarés par l'agent : le résumé les
 * présente comme tels, pour qu'un porteur de projet ne prenne pas une
 * affirmation pour une mesure. La porte de qualité automatisée (section 5.6)
 * reste à construire ; `resultat_qualite` demeure « en attente ».
 */

/** Longueur maximale conservée de la sortie d'une commande de test. */
export const MAX_SORTIE_TESTS = 2_000;

export const submitSolutionInputSchema = {
  ticket: z.uuid().describe('Identifiant du ticket réclamé.'),
  diff_url: z.url().describe('Lien vers le diff publié — une pull request, le plus souvent.'),
  preview_url: z.url().describe('Lien vers l’aperçu live de la solution.'),
  decisions: z
    .array(z.string().trim().min(1))
    .min(1)
    .describe('Décisions prises pendant le travail, une par entrée, formulées pour un relecteur.'),
  tests_locaux: z
    .object({
      commande: z.string().trim().min(1),
      reussi: z.boolean(),
      sortie: z.string().optional(),
    })
    .optional()
    .describe('Commande de test lancée localement et son résultat, si des tests ont été lancés.'),
  chemin: z
    .string()
    .min(1)
    .optional()
    .describe('Dépôt où le travail a été fait. Répertoire courant par défaut.'),
  base: z
    .string()
    .min(1)
    .optional()
    .describe('Branche de départ. origin/main, main, origin/master ou master par défaut.'),
  confirmer: z
    .boolean()
    .default(false)
    .describe(
      'false : rend seulement l’aperçu du résumé, sans rien écrire. true : soumet réellement. ' +
        'Ne passer true qu’après accord explicite de la personne sur l’aperçu.',
    ),
};

const travailSchema = z.object({
  base: z.string(),
  fichiers: z.array(
    z.object({
      chemin: z.string(),
      nature: z.enum(['ajoute', 'modifie', 'supprime', 'renomme']),
    }),
  ),
  tests_touches: z.array(z.string()),
  non_commites: z.number().int().nonnegative(),
});

export const submitSolutionOutputSchema = {
  soumis: z.boolean().describe('false pour un aperçu : rien n’a été écrit sur la plateforme.'),
  agit_au_nom_de: identiteMcpSchema,
  ticket: z.object({ id: z.uuid(), titre: z.string() }),
  resume_md: z.string(),
  travail: travailSchema,
  soumission: soumissionEnregistreeSchema.nullable(),
};

export const submitSolutionResultatSchema = z.object(submitSolutionOutputSchema);

export type SubmitSolutionResultat = z.infer<typeof submitSolutionResultatSchema>;

type Entree = z.infer<z.ZodObject<typeof submitSolutionInputSchema>>;

export type MotifRefusSoumission = 'introuvable' | 'non_tenu' | 'travail_illisible';

export class SoumissionRefusee extends Error {
  constructor(
    readonly motif: MotifRefusSoumission,
    message: string,
  ) {
    super(message);
    this.name = 'SoumissionRefusee';
  }
}

const LIBELLES_NATURE = {
  ajoute: 'ajouté',
  modifie: 'modifié',
  supprime: 'supprimé',
  renomme: 'renommé',
} as const;

function tronquer(texte: string, maximum: number): string {
  return texte.length <= maximum ? texte : `${texte.slice(0, maximum)}\n… (sortie tronquée)`;
}

/**
 * Rédige le résumé stocké dans `resume_md`.
 *
 * Fonction pure : ce qui est affiché en aperçu est exactement ce qui sera
 * soumis, puisque les deux passent par ici avec les mêmes entrées.
 */
export function redigerResume(entree: {
  titre: string;
  travail: TravailLocal;
  decisions: string[];
  tests_locaux?: Entree['tests_locaux'];
}): string {
  const { travail } = entree;
  const lignes: string[] = [`## Solution soumise pour « ${entree.titre} »`, ''];

  lignes.push(`### Fichiers modifiés (${travail.fichiers.length}) — depuis \`${travail.base}\``);
  lignes.push(
    ...(travail.fichiers.length
      ? travail.fichiers.map((f) => `- ${LIBELLES_NATURE[f.nature]} : \`${f.chemin}\``)
      : ['_Aucun fichier modifié depuis la base._']),
    '',
  );

  lignes.push('### Tests ajoutés ou modifiés');
  lignes.push(
    ...(travail.tests_touches.length
      ? travail.tests_touches.map((chemin) => `- \`${chemin}\``)
      : ['_Aucun fichier de test touché._']),
    '',
  );

  lignes.push('### Décisions prises', ...entree.decisions.map((d) => `- ${d}`), '');

  lignes.push('### Tests locaux — déclarés par l’agent, non vérifiés par la plateforme');

  if (entree.tests_locaux) {
    const { commande, reussi, sortie } = entree.tests_locaux;
    lignes.push(`- \`${commande}\` : ${reussi ? 'réussi' : '**échec**'}`);

    if (sortie?.trim()) {
      lignes.push('', '```', tronquer(sortie.trim(), MAX_SORTIE_TESTS), '```');
    }
  } else {
    lignes.push('_Aucun test local déclaré._');
  }

  if (travail.non_commites > 0) {
    lignes.push(
      '',
      `> ${travail.non_commites} fichier(s) modifié(s) mais non commité(s) ne figurent ni dans ce résumé ni dans le diff.`,
    );
  }

  return lignes.join('\n');
}

function refusNonTenu(): SoumissionRefusee {
  return new SoumissionRefusee(
    'non_tenu',
    'Vous ne tenez pas ce ticket : seul son réclamant courant peut y soumettre une solution. ' +
      'Réclamez-le d’abord avec claim_ticket.',
  );
}

export async function preparerOuSoumettre(
  source: SourceSession,
  entree: Entree,
  repertoireCourant: string = process.cwd(),
): Promise<SubmitSolutionResultat> {
  const [client, identite] = await Promise.all([source.client(), source.identite()]);
  const contexte = await lireContexteTicket(client, entree.ticket);

  if (!contexte) {
    throw new SoumissionRefusee(
      'introuvable',
      'Aucun ticket visible sous cet identifiant. Il n’existe pas, ou il n’est pas encore publié.',
    );
  }

  const tenu =
    contexte.ticket.reclame_par === identite.id &&
    (contexte.ticket.statut === 'reclame' || contexte.ticket.statut === 'soumis');

  if (!tenu) {
    throw refusNonTenu();
  }

  let travail: TravailLocal;

  try {
    travail = await decrireTravail(resolve(repertoireCourant, entree.chemin ?? '.'), entree.base);
  } catch (erreur) {
    throw new SoumissionRefusee(
      'travail_illisible',
      erreur instanceof Error ? erreur.message : 'Le dépôt local n’a pas pu être lu.',
    );
  }

  const resumeMd = redigerResume({
    titre: contexte.ticket.titre,
    travail,
    decisions: entree.decisions,
    tests_locaux: entree.tests_locaux,
  });

  const commun = {
    agit_au_nom_de: identite,
    ticket: { id: contexte.ticket.id, titre: contexte.ticket.titre },
    resume_md: resumeMd,
    travail,
  };

  if (!entree.confirmer) {
    return { soumis: false, soumission: null, ...commun };
  }

  // La lecture a dit « tenu », mais c'est `soumettre_solution` qui tranche : le
  // ticket a pu être relâché par son porteur entre les deux.
  const soumission = await soumettreSolution(client, {
    ticketId: entree.ticket,
    diffUrl: entree.diff_url,
    previewUrl: entree.preview_url,
    resumeMd,
  });

  if (!soumission) {
    throw refusNonTenu();
  }

  return { soumis: true, soumission, ...commun };
}

/** Version texte du résultat, pour le modèle qui l'a demandé. */
export function resumerEnTexte(resultat: SubmitSolutionResultat): string {
  const entete = resultat.soumis
    ? `Solution soumise sur « ${resultat.ticket.titre} » au nom de ${resultat.agit_au_nom_de.nom ?? resultat.agit_au_nom_de.id}. Le ticket passe au statut « soumis ».`
    : 'APERÇU — rien n’a été soumis. Montrez ce résumé à la personne et rappelez l’outil avec confirmer: true seulement après son accord.';

  return [entete, '', resultat.resume_md].join('\n');
}
