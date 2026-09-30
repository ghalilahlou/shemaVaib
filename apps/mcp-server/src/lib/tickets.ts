import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  ticketComplexiteSchema,
  ticketPrioriteSchema,
  ticketStatutSchema,
} from '@schemavibe/shared-types';

/**
 * Accès aux tickets depuis le serveur MCP (SV-018).
 *
 * Même règle que la couche repository de la plateforme (section 18) : c'est le
 * seul module du serveur qui appelle `supabase.from(...)` ou `rpc(...)`. Le
 * client lui est passé en paramètre et porte l'identité du jeton personnel —
 * toutes ces lectures et écritures passent donc par la Row Level Security, sans
 * qu'aucune règle d'autorisation ne soit réécrite ici.
 *
 * Le client n'est pas typé par le schéma de la base (le serveur MCP ne dépend
 * pas des types générés de l'application web) : chaque réponse est donc validée
 * par un schéma Zod plutôt que simplement transtypée.
 */

export const patternSuggereSchema = z.object({
  nom: z.string(),
  categorie: z.string(),
  principe: z.string().nullable(),
});

export const ticketLieSchema = z.object({
  id: z.uuid(),
  titre: z.string(),
  statut: ticketStatutSchema,
});

export const tentativeSchema = z.object({
  cree_le: z.string(),
  resultat_qualite: z.string(),
  resume_md: z.string().nullable(),
});

export const contexteTicketSchema = z.object({
  ticket: z.object({
    id: z.uuid(),
    titre: z.string(),
    statut: ticketStatutSchema,
    reclame_par: z.uuid().nullable(),
    reclame_le: z.string().nullable(),
    complexite: ticketComplexiteSchema.nullable(),
    priorite: ticketPrioriteSchema,
    contexte: z.string().nullable(),
    criteres_acceptation: z.string().nullable(),
    critere_test: z.string().nullable(),
  }),
  projet: z.object({
    id: z.uuid(),
    nom: z.string(),
    repo_url: z.string().nullable(),
  }),
  patterns_suggeres: z.array(patternSuggereSchema),
  bloque_par: z.array(ticketLieSchema),
  tentatives_precedentes: z.array(tentativeSchema),
});

export type ContexteTicket = z.infer<typeof contexteTicketSchema>;

/** Ce que PostgREST rend pour la ligne détaillée, avant mise en forme. */
const ligneBruteSchema = z.object({
  id: z.uuid(),
  titre: z.string(),
  statut: ticketStatutSchema,
  reclame_par: z.uuid().nullable(),
  reclame_le: z.string().nullable(),
  complexite: ticketComplexiteSchema.nullable(),
  priorite: ticketPrioriteSchema,
  contexte: z.string().nullable(),
  criteres_acceptation: z.string().nullable(),
  critere_test: z.string().nullable(),
  projet: z.object({ id: z.uuid(), nom: z.string(), repo_url: z.string().nullable() }),
  liens: z.array(z.object({ role: z.string(), pattern: patternSuggereSchema.nullable() })),
  dependances: z.array(z.object({ bloqueur: ticketLieSchema.nullable() })),
  soumissions: z.array(tentativeSchema),
});

const COLONNES_CONTEXTE =
  'id, titre, statut, reclame_par, reclame_le, complexite, priorite, contexte, criteres_acceptation, critere_test, projet:projects!tickets_projet_id_fkey(id, nom, repo_url), liens:ticket_patterns(role, pattern:patterns(nom, categorie, principe)), dependances:ticket_dependencies!ticket_dependencies_ticket_id_fkey(bloqueur:tickets!ticket_dependencies_bloque_par_id_fkey(id, titre, statut)), soumissions:submissions(cree_le, resultat_qualite, resume_md)';

/** Échec technique d'un accès, distinct d'un refus métier. */
export class AccesTicketsError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'AccesTicketsError';
  }
}

/**
 * Lit tout ce qu'il faut pour travailler sur un ticket, ou `null` s'il n'est
 * pas visible.
 *
 * « Inexistant » et « invisible » rendent la même chose : c'est la RLS qui en
 * décide, et distinguer les deux révélerait l'existence d'un ticket que
 * l'appelant n'a pas le droit de voir.
 */
export async function lireContexteTicket(
  client: SupabaseClient,
  ticketId: string,
): Promise<ContexteTicket | null> {
  const { data, error } = await client
    .from('tickets')
    .select(COLONNES_CONTEXTE)
    .eq('id', ticketId)
    .maybeSingle();

  if (error) {
    throw new AccesTicketsError('Le ticket n’a pas pu être lu.', error);
  }

  if (!data) {
    return null;
  }

  const ligne = ligneBruteSchema.parse(data);

  return {
    ticket: {
      id: ligne.id,
      titre: ligne.titre,
      statut: ligne.statut,
      reclame_par: ligne.reclame_par,
      reclame_le: ligne.reclame_le,
      complexite: ligne.complexite,
      priorite: ligne.priorite,
      contexte: ligne.contexte,
      criteres_acceptation: ligne.criteres_acceptation,
      critere_test: ligne.critere_test,
    },
    projet: ligne.projet,
    patterns_suggeres: ligne.liens
      .filter((lien) => lien.role === 'suggere' && lien.pattern !== null)
      .map((lien) => lien.pattern!),
    // Un bloqueur que la RLS masque — ticket d'un autre projet en brouillon —
    // arrive à `null` : il est écarté plutôt qu'affiché vide.
    bloque_par: ligne.dependances.flatMap((lien) => (lien.bloqueur ? [lien.bloqueur] : [])),
    tentatives_precedentes: [...ligne.soumissions].sort((a, b) =>
      b.cree_le.localeCompare(a.cree_le),
    ),
  };
}

/**
 * Réclame un ticket pour l'identité du client.
 *
 * Passe par `reclamer_ticket`, dont la clause `where` porte l'état attendu
 * (compare-and-swap, SV-005) : c'est la base, et non ce module, qui garantit
 * qu'une seule réclamation aboutit. Rend `false` quand la condition n'est plus
 * remplie, sans distinguer davantage — la fonction ne le fait pas non plus.
 */
export async function reclamerTicket(client: SupabaseClient, ticketId: string): Promise<boolean> {
  const { error } = await client.rpc('reclamer_ticket', { ticket: ticketId });

  if (!error) {
    return true;
  }

  if (error.message.includes('ticket_non_reclamable')) {
    return false;
  }

  throw new AccesTicketsError('La réclamation a échoué.', error);
}

export const soumissionEnregistreeSchema = z.object({
  id: z.uuid(),
  cree_le: z.string(),
});

export type SoumissionEnregistree = z.infer<typeof soumissionEnregistreeSchema>;

/**
 * Rattache une soumission au ticket, au nom de l'identité du client.
 *
 * Passe par `soumettre_solution`, où la transition du ticket vers « soumis » sert
 * de garde à l'insertion (SV-006) : seul le réclamant courant peut soumettre, et
 * un ticket relâché entre-temps ne reçoit rien. Rend `null` quand cette garde
 * refuse, sans distinguer davantage.
 */
export async function soumettreSolution(
  client: SupabaseClient,
  entree: { ticketId: string; diffUrl: string; previewUrl: string; resumeMd: string },
): Promise<SoumissionEnregistree | null> {
  const { data, error } = await client.rpc('soumettre_solution', {
    ticket: entree.ticketId,
    diff_url: entree.diffUrl,
    preview_url: entree.previewUrl,
    resume_md: entree.resumeMd,
  });

  if (!error) {
    return soumissionEnregistreeSchema.parse(data);
  }

  if (error.message.includes('ticket_non_soumettable')) {
    return null;
  }

  throw new AccesTicketsError('La soumission a échoué.', error);
}
