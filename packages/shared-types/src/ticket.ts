import { z } from 'zod';
import {
  ticketComplexiteSchema,
  ticketPrioriteSchema,
  ticketSourceSchema,
  ticketStatutSchema,
} from './enums.js';

/** Longueur maximale du titre d'un ticket, alignée sur la contrainte Postgres. */
export const MAX_TICKET_TITLE_LENGTH = 160;

/**
 * Un ticket tel qu'il est stocké (section 9 du cahier des charges), enrichi des
 * champs qu'impose la Definition of Ready de la section 5.1.
 */
export const ticketSchema = z.object({
  id: z.uuid(),
  projet_id: z.uuid(),
  jalon_id: z.uuid().nullable(),
  reclame_par: z.uuid().nullable(),
  titre: z.string().trim().min(1).max(MAX_TICKET_TITLE_LENGTH),
  contexte: z.string().nullable(),
  criteres_acceptation: z.string().nullable(),
  critere_test: z.string().nullable(),
  complexite: ticketComplexiteSchema.nullable(),
  statut: ticketStatutSchema,
  source: ticketSourceSchema,
  priorite: ticketPrioriteSchema,
  score_confiance: z.number().min(0).max(1).nullable(),
  reclame_le: z.string().nullable(),
  cree_le: z.string(),
  maj_le: z.string(),
});

export type Ticket = z.infer<typeof ticketSchema>;

/** Champs acceptés à la création d'un ticket. */
export const ticketInsertSchema = ticketSchema
  .omit({ id: true, cree_le: true, maj_le: true, reclame_par: true, reclame_le: true })
  .partial({
    jalon_id: true,
    contexte: true,
    criteres_acceptation: true,
    critere_test: true,
    complexite: true,
    statut: true,
    source: true,
    priorite: true,
    score_confiance: true,
  });

export type TicketInsert = z.infer<typeof ticketInsertSchema>;

/** Champs modifiables sur un ticket existant. */
export const ticketUpdateSchema = ticketInsertSchema.partial().omit({ projet_id: true });

export type TicketUpdate = z.infer<typeof ticketUpdateSchema>;

/**
 * Definition of Ready (section 5.1) : ce qu'un ticket doit réunir pour quitter
 * le brouillon et passer « ouvert ».
 *
 * La base garantit la partie qui tient dans une contrainte de colonne ; le
 * nombre de patterns suggérés vit dans `ticket_patterns` et doit donc être
 * fourni par l'appelant. Cette fonction est le seul endroit où la règle est
 * écrite, et elle est testée unitairement (section 21).
 */
export interface DefinitionOfReadyEntree {
  contexte: string | null;
  criteres_acceptation: string | null;
  critere_test: string | null;
  complexite: string | null;
  source: string;
  score_confiance: number | null;
  nombre_patterns_suggeres: number;
}

/** Motifs de non-conformité, dans l'ordre où ils sont vérifiés. */
export const DEFINITION_OF_READY_MOTIFS = [
  'contexte_manquant',
  'criteres_acceptation_manquants',
  'critere_test_manquant',
  'complexite_manquante',
  'aucun_pattern_suggere',
  'score_confiance_manquant',
] as const;

export type DefinitionOfReadyMotif = (typeof DEFINITION_OF_READY_MOTIFS)[number];

export interface DefinitionOfReadyResultat {
  pret: boolean;
  motifs: DefinitionOfReadyMotif[];
}

const estRenseigne = (valeur: string | null): boolean =>
  valeur !== null && valeur.trim().length > 0;

export function evaluerDefinitionOfReady(
  entree: DefinitionOfReadyEntree,
): DefinitionOfReadyResultat {
  const motifs: DefinitionOfReadyMotif[] = [];

  if (!estRenseigne(entree.contexte)) {
    motifs.push('contexte_manquant');
  }
  if (!estRenseigne(entree.criteres_acceptation)) {
    motifs.push('criteres_acceptation_manquants');
  }
  if (!estRenseigne(entree.critere_test)) {
    motifs.push('critere_test_manquant');
  }
  if (!estRenseigne(entree.complexite)) {
    motifs.push('complexite_manquante');
  }
  if (entree.nombre_patterns_suggeres < 1) {
    motifs.push('aucun_pattern_suggere');
  }
  // Un ticket généré automatiquement affiche son score de confiance (section 5.1).
  if (entree.source === 'genere_ia' && entree.score_confiance === null) {
    motifs.push('score_confiance_manquant');
  }

  return { pret: motifs.length === 0, motifs };
}
