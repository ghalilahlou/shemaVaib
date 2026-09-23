import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Pattern, Ticket } from '@schemavibe/shared-types';
import type { Database } from '../../../lib/supabase/database.types';
import type { TicketFormData, TicketListFilters } from '../schema';

/**
 * Couche d'accès aux données des tickets.
 *
 * Comme pour les projets (section 18), c'est la seule couche autorisée à
 * appeler `supabase.from(...)`, et le client lui est passé en paramètre pour que
 * le comportement de la RLS soit directement testable sous chaque identité.
 */

/** Un ticket accompagné de son projet et des patterns qui lui sont rattachés. */
export interface TicketDetaille extends Ticket {
  projet: { id: string; nom: string; statut: string } | null;
  patterns_suggeres: Pick<Pattern, 'id' | 'nom' | 'categorie'>[];
}

// Littéraux d'un seul tenant, et non concaténés : PostgREST dérive le type du
// résultat de la chaîne elle-même, et une concaténation lui fait perdre cette
// inférence.
const COLONNES_TICKET =
  'id, projet_id, jalon_id, reclame_par, titre, contexte, criteres_acceptation, critere_test, complexite, statut, source, priorite, score_confiance, reclame_le, cree_le, maj_le' as const;

const COLONNES_DETAILLEES =
  'id, projet_id, jalon_id, reclame_par, titre, contexte, criteres_acceptation, critere_test, complexite, statut, source, priorite, score_confiance, reclame_le, cree_le, maj_le, projet:projects!tickets_projet_id_fkey(id, nom, statut), liens:ticket_patterns(role, pattern:patterns(id, nom, categorie))' as const;

/** Erreur remontée quand Supabase refuse ou échoue sur une opération ticket. */
export class TicketRepositoryError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'TicketRepositoryError';
  }
}

/** Forme brute rendue par PostgREST pour les liens ticket/pattern. */
interface LienBrut {
  role: string;
  pattern: Pick<Pattern, 'id' | 'nom' | 'categorie'> | null;
}

function normaliser(ligne: Record<string, unknown>): TicketDetaille {
  const { liens, ...reste } = ligne as { liens?: LienBrut[] };

  return {
    ...(reste as unknown as Ticket),
    projet: (ligne.projet as TicketDetaille['projet']) ?? null,
    patterns_suggeres: (liens ?? [])
      .filter((lien) => lien.role === 'suggere' && lien.pattern !== null)
      .map((lien) => lien.pattern!),
  };
}

/**
 * Liste les tickets visibles par le client fourni, du plus récent au plus ancien.
 *
 * Les filtres de la section 22 — par statut et par projet — sont appliqués côté
 * base ; la RLS décide en amont de ce qui est visible tout court.
 */
export async function listerTickets(
  client: SupabaseClient<Database>,
  filtres: TicketListFilters = {},
): Promise<TicketDetaille[]> {
  let requete = client
    .from('tickets')
    .select(COLONNES_DETAILLEES)
    .order('cree_le', { ascending: false });

  if (filtres.statut) {
    requete = requete.eq('statut', filtres.statut);
  }
  if (filtres.projet_id) {
    requete = requete.eq('projet_id', filtres.projet_id);
  }

  const { data, error } = await requete;

  if (error) {
    throw new TicketRepositoryError('Impossible de lister les tickets.', error);
  }

  return (data ?? []).map((ligne) => normaliser(ligne as unknown as Record<string, unknown>));
}

/** Récupère un ticket, ou `null` s'il n'existe pas ou n'est pas visible. */
export async function recupererTicket(
  client: SupabaseClient<Database>,
  id: string,
): Promise<TicketDetaille | null> {
  const { data, error } = await client
    .from('tickets')
    .select(COLONNES_DETAILLEES)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new TicketRepositoryError('Impossible de récupérer le ticket.', error);
  }

  return data ? normaliser(data as unknown as Record<string, unknown>) : null;
}

/** Compte les patterns suggérés d'un ticket — l'une des exigences de la Definition of Ready. */
export async function compterPatternsSuggeres(
  client: SupabaseClient<Database>,
  ticketId: string,
): Promise<number> {
  const { count, error } = await client
    .from('ticket_patterns')
    .select('*', { count: 'exact', head: true })
    .eq('ticket_id', ticketId)
    .eq('role', 'suggere');

  if (error) {
    throw new TicketRepositoryError('Impossible de compter les patterns du ticket.', error);
  }

  return count ?? 0;
}

/**
 * Crée un ticket, puis y rattache ses patterns suggérés.
 *
 * Le statut est décidé par l'appelant : le repository ne juge pas de la
 * Definition of Ready, il l'applique. La contrainte `tickets_definition_of_ready`
 * reste le dernier rempart côté base.
 */
export async function creerTicket(
  client: SupabaseClient<Database>,
  donnees: TicketFormData,
  statut: 'brouillon' | 'ouvert',
): Promise<Ticket> {
  const { data, error } = await client
    .from('tickets')
    .insert({
      projet_id: donnees.projet_id,
      titre: donnees.titre,
      contexte: donnees.contexte,
      criteres_acceptation: donnees.criteres_acceptation,
      critere_test: donnees.critere_test,
      complexite: donnees.complexite,
      priorite: donnees.priorite,
      source: donnees.source,
      statut,
    })
    .select(COLONNES_TICKET)
    .single();

  if (error || !data) {
    throw new TicketRepositoryError('Impossible de créer le ticket.', error);
  }

  if (donnees.patterns_suggeres.length > 0) {
    const { error: erreurLiens } = await client.from('ticket_patterns').insert(
      donnees.patterns_suggeres.map((patternId) => ({
        ticket_id: data.id,
        pattern_id: patternId,
        role: 'suggere' as const,
      })),
    );

    if (erreurLiens) {
      throw new TicketRepositoryError(
        'Impossible de rattacher les patterns au ticket.',
        erreurLiens,
      );
    }
  }

  return data;
}

/** Met à jour un ticket. Rend `null` si la RLS ne laisse rien modifier. */
export async function mettreAJourTicket(
  client: SupabaseClient<Database>,
  id: string,
  donnees: Partial<Omit<TicketFormData, 'patterns_suggeres' | 'publier'>> & {
    statut?: Ticket['statut'];
  },
): Promise<Ticket | null> {
  const { data, error } = await client
    .from('tickets')
    .update(donnees)
    .eq('id', id)
    .select(COLONNES_TICKET)
    .maybeSingle();

  if (error) {
    throw new TicketRepositoryError('Impossible de mettre à jour le ticket.', error);
  }

  return data ?? null;
}

/** Supprime un ticket. Ses soumissions, messages et liens tombent en cascade. */
export async function supprimerTicket(client: SupabaseClient<Database>, id: string): Promise<void> {
  const { error } = await client.from('tickets').delete().eq('id', id);

  if (error) {
    throw new TicketRepositoryError('Impossible de supprimer le ticket.', error);
  }
}

/** Liste la bibliothèque de patterns, pour alimenter le formulaire de création. */
export async function listerPatterns(
  client: SupabaseClient<Database>,
): Promise<Pick<Pattern, 'id' | 'nom' | 'categorie'>[]> {
  const { data, error } = await client
    .from('patterns')
    .select('id, nom, categorie')
    .order('nom', { ascending: true });

  if (error) {
    throw new TicketRepositoryError('Impossible de lister les patterns.', error);
  }

  return data ?? [];
}
