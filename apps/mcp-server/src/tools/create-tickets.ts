import { z } from 'zod';
import {
  MAX_TICKET_TITLE_LENGTH,
  evaluerDefinitionOfReady,
  identiteMcpSchema,
  ticketComplexiteSchema,
  ticketPrioriteSchema,
  type DefinitionOfReadyMotif,
} from '@schemavibe/shared-types';
import type { SourceSession } from '../lib/plateforme.js';
import {
  LotRefuse,
  creerTickets,
  lireProjetPorte,
  listerPatterns,
  titresDuProjet,
  type TicketALancer,
} from '../lib/tickets.js';

/**
 * Outil MCP `create_tickets` (section 8, SV-020).
 *
 * Pousse un lot de tickets vers un projet que l'on porte — typiquement ceux
 * que suggère `scan_repo`. La section 8 l'exige : **jamais sans confirmation
 * explicite**. Sans `confirmer: true`, l'outil évalue le lot et rend ce qu'il
 * créerait, sans rien écrire (`cree: false`).
 *
 * La Definition of Ready est tranchée par `evaluerDefinitionOfReady`, la seule
 * écriture de la règle (SV-004) : un ticket prêt est publié si on le demande,
 * un ticket incomplet reste en brouillon avec la liste de ce qui lui manque.
 * La création elle-même passe par `creer_tickets`, en une transaction : tout le
 * lot ou rien.
 */

/** Plafond d'un lot : au-delà, c'est un import, pas une proposition à relire. */
export const MAX_TICKETS_PAR_LOT = 25;

const ticketPropose = z.object({
  titre: z.string().trim().min(1).max(MAX_TICKET_TITLE_LENGTH),
  contexte: z.string().trim().optional(),
  criteres_acceptation: z.string().trim().optional(),
  critere_test: z.string().trim().optional(),
  complexite: ticketComplexiteSchema.optional(),
  priorite: ticketPrioriteSchema.default('normale'),
  patterns: z
    .array(z.string().trim().min(1))
    .default([])
    .describe('Noms de patterns de la bibliothèque (section 5.2), par exemple « Spec-First ».'),
  score_confiance: z.number().min(0).max(1).optional(),
});

export const createTicketsInputSchema = {
  projet: z.uuid().describe('Identifiant du projet, que vous devez porter.'),
  tickets: z.array(ticketPropose).min(1).max(MAX_TICKETS_PAR_LOT),
  publier: z
    .boolean()
    .default(false)
    .describe('true : publie les tickets qui réunissent la Definition of Ready. Brouillon sinon.'),
  confirmer: z
    .boolean()
    .default(false)
    .describe(
      'false : rend seulement ce qui serait créé, sans rien écrire. true : crée réellement. ' +
        'Ne passer true qu’après accord explicite de la personne sur l’aperçu.',
    ),
};

const ticketPrevuSchema = z.object({
  titre: z.string(),
  statut: z.enum(['ouvert', 'brouillon']),
  manques: z
    .array(z.string())
    .describe('Ce qui empêche la publication ; vide si le ticket est prêt.'),
  patterns: z.array(z.string()),
  id: z.uuid().nullable().describe('Identifiant attribué, null tant que rien n’est créé.'),
});

export const createTicketsOutputSchema = {
  cree: z.boolean().describe('false pour un aperçu : rien n’a été écrit sur la plateforme.'),
  agit_au_nom_de: identiteMcpSchema,
  projet: z.object({ id: z.uuid(), nom: z.string() }),
  tickets: z.array(ticketPrevuSchema),
};

export const createTicketsResultatSchema = z.object(createTicketsOutputSchema);

export type CreateTicketsResultat = z.infer<typeof createTicketsResultatSchema>;

type Entree = z.infer<z.ZodObject<typeof createTicketsInputSchema>>;

export type MotifRefusLot = 'projet_non_porte' | 'pattern_inconnu' | 'doublon';

export class CreationRefusee extends Error {
  constructor(
    readonly motif: MotifRefusLot,
    message: string,
  ) {
    super(message);
    this.name = 'CreationRefusee';
  }
}

/** Libellés lisibles des motifs de la Definition of Ready. */
const LIBELLES_MANQUES: Record<DefinitionOfReadyMotif, string> = {
  contexte_manquant: 'contexte',
  criteres_acceptation_manquants: 'critères d’acceptation',
  critere_test_manquant: 'critère de test',
  complexite_manquante: 'complexité',
  aucun_pattern_suggere: 'pattern suggéré',
  score_confiance_manquant: 'score de confiance',
};

const normaliser = (titre: string): string => titre.trim().toLowerCase();

export async function preparerOuCreer(
  source: SourceSession,
  entree: Entree,
): Promise<CreateTicketsResultat> {
  const [client, identite] = await Promise.all([source.client(), source.identite()]);

  const projet = await lireProjetPorte(client, entree.projet);

  if (!projet) {
    throw new CreationRefusee(
      'projet_non_porte',
      'Aucun projet que vous portez sous cet identifiant : seul le porteur d’un projet peut y créer des tickets.',
    );
  }

  const bibliotheque = await listerPatterns(client);
  const parNom = new Map(bibliotheque.map((pattern) => [normaliser(pattern.nom), pattern]));
  const inconnus = [
    ...new Set(
      entree.tickets
        .flatMap((ticket) => ticket.patterns)
        .filter((nom) => !parNom.has(normaliser(nom))),
    ),
  ];

  if (inconnus.length) {
    throw new CreationRefusee(
      'pattern_inconnu',
      `Pattern(s) inconnu(s) : ${inconnus.join(', ')}. Patterns disponibles : ${bibliotheque
        .map((pattern) => pattern.nom)
        .join(', ')}.`,
    );
  }

  // Doublons, dans le lot comme avec l'existant. La base les refuse aussi ; les
  // relever ici permet de les nommer tous dès l'aperçu.
  const existants = new Set((await titresDuProjet(client, projet.id)).map(normaliser));
  const vus = new Set<string>();
  const doublons: string[] = [];

  for (const ticket of entree.tickets) {
    const cle = normaliser(ticket.titre);
    if (existants.has(cle) || vus.has(cle)) doublons.push(ticket.titre);
    vus.add(cle);
  }

  if (doublons.length) {
    throw new CreationRefusee(
      'doublon',
      `Titre(s) déjà présent(s) dans le projet ou répété(s) dans le lot : ${doublons.join(', ')}.`,
    );
  }

  const nomsDePatterns = new Map(bibliotheque.map((pattern) => [pattern.id, pattern.nom]));

  const prepares = entree.tickets.map((ticket) => {
    const patterns = [...new Set(ticket.patterns.map((nom) => parNom.get(normaliser(nom))!.id))];
    const dor = evaluerDefinitionOfReady({
      contexte: ticket.contexte ?? null,
      criteres_acceptation: ticket.criteres_acceptation ?? null,
      critere_test: ticket.critere_test ?? null,
      complexite: ticket.complexite ?? null,
      source: 'scan_mcp',
      score_confiance: ticket.score_confiance ?? null,
      nombre_patterns_suggeres: patterns.length,
    });

    const aLancer: TicketALancer = {
      titre: ticket.titre,
      contexte: ticket.contexte ?? null,
      criteres_acceptation: ticket.criteres_acceptation ?? null,
      critere_test: ticket.critere_test ?? null,
      complexite: ticket.complexite ?? null,
      priorite: ticket.priorite,
      score_confiance: ticket.score_confiance ?? null,
      patterns,
      publier: entree.publier && dor.pret,
    };

    return {
      aLancer,
      prevu: {
        titre: ticket.titre,
        statut: aLancer.publier ? ('ouvert' as const) : ('brouillon' as const),
        manques: dor.motifs.map((motif) => LIBELLES_MANQUES[motif]),
        patterns: patterns.map((id) => nomsDePatterns.get(id)!),
        id: null,
      },
    };
  });

  const commun = { agit_au_nom_de: identite, projet };

  if (!entree.confirmer) {
    return { cree: false, tickets: prepares.map(({ prevu }) => prevu), ...commun };
  }

  let crees: Awaited<ReturnType<typeof creerTickets>>;

  try {
    crees = await creerTickets(
      client,
      projet.id,
      prepares.map(({ aLancer }) => aLancer),
    );
  } catch (erreur) {
    if (erreur instanceof LotRefuse) {
      throw new CreationRefusee(
        erreur.motif === 'doublon' ? 'doublon' : 'projet_non_porte',
        erreur.message,
      );
    }
    throw erreur;
  }

  // Chaque ligne créée est rattachée à sa proposition par le titre, unique dans
  // le lot, plutôt que par sa position : rien n'oblige la réponse à suivre
  // l'ordre d'envoi.
  const parTitre = new Map(crees.map((ligne) => [normaliser(ligne.titre), ligne]));

  return {
    cree: true,
    tickets: prepares.map(({ prevu }) => {
      const ligne = parTitre.get(normaliser(prevu.titre))!;
      return {
        ...prevu,
        id: ligne.id,
        statut: ligne.statut === 'ouvert' ? ('ouvert' as const) : ('brouillon' as const),
      };
    }),
    ...commun,
  };
}

/** Version texte du résultat, pour le modèle qui l'a demandé. */
export function resumerEnTexte(resultat: CreateTicketsResultat): string {
  const entete = resultat.cree
    ? `${resultat.tickets.length} ticket(s) créé(s) dans « ${resultat.projet.nom} » au nom de ${resultat.agit_au_nom_de.nom ?? resultat.agit_au_nom_de.id}.`
    : `APERÇU — rien n’a été créé. Voici ce que le lot donnerait dans « ${resultat.projet.nom} ». Montrez-le à la personne et rappelez l’outil avec confirmer: true seulement après son accord.`;

  return [
    entete,
    '',
    ...resultat.tickets.map((ticket) => {
      const etat =
        ticket.statut === 'ouvert'
          ? 'publié'
          : `brouillon${ticket.manques.length ? ` — manque : ${ticket.manques.join(', ')}` : ''}`;
      return `- ${ticket.titre} (${etat})${ticket.patterns.length ? ` · ${ticket.patterns.join(', ')}` : ''}`;
    }),
  ].join('\n');
}
