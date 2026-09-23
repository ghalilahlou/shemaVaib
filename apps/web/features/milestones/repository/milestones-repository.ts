import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Milestone, MilestoneAvecSante } from '@schemavibe/shared-types';
import type { Database } from '../../../lib/supabase/database.types';
import type { DependanceFormData, MilestoneFormData } from '../schema';

/**
 * Couche d'accès aux données des jalons.
 *
 * Comme partout (section 18), seule couche autorisée à appeler
 * `supabase.from(...)`, et le client lui est passé en paramètre pour que le
 * comportement de la RLS soit testable sous chaque identité.
 *
 * Les écritures visent la table `milestones` ; les lectures passent par la vue
 * `jalons_avec_sante`, qui ajoute progression et santé calculées.
 */

const COLONNES_JALON = 'id, projet_id, theme, date_cible, cree_le, maj_le' as const;

const COLONNES_AVEC_SANTE =
  'id, projet_id, theme, date_cible, cree_le, maj_le, tickets_total, tickets_acheves, tickets_restants, jours_inactivite, progression, sante' as const;

/** Erreur remontée quand Supabase refuse ou échoue sur une opération de jalon. */
export class MilestoneRepositoryError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'MilestoneRepositoryError';
  }
}

/**
 * La vue rend des colonnes nullables — c'est le propre d'une vue côté
 * générateur de types. Les valeurs, elles, ne le sont jamais pour une ligne
 * existante : cette normalisation évite de propager des `| null` jusqu'aux
 * composants.
 */
function normaliser(ligne: Record<string, unknown>): MilestoneAvecSante {
  return {
    id: ligne.id as string,
    projet_id: ligne.projet_id as string,
    theme: ligne.theme as string,
    date_cible: (ligne.date_cible as string | null) ?? null,
    cree_le: ligne.cree_le as string,
    maj_le: ligne.maj_le as string,
    tickets_total: Number(ligne.tickets_total ?? 0),
    tickets_acheves: Number(ligne.tickets_acheves ?? 0),
    tickets_restants: Number(ligne.tickets_restants ?? 0),
    jours_inactivite:
      ligne.jours_inactivite === null || ligne.jours_inactivite === undefined
        ? null
        : Number(ligne.jours_inactivite),
    progression: Number(ligne.progression ?? 0),
    sante: ligne.sante as MilestoneAvecSante['sante'],
  };
}

/** Liste les jalons d'un projet, avec progression et santé, du plus récent au plus ancien. */
export async function listerJalons(
  client: SupabaseClient<Database>,
  projetId: string,
): Promise<MilestoneAvecSante[]> {
  const { data, error } = await client
    .from('jalons_avec_sante')
    .select(COLONNES_AVEC_SANTE)
    .eq('projet_id', projetId)
    .order('cree_le', { ascending: false });

  if (error) {
    throw new MilestoneRepositoryError('Impossible de lister les jalons.', error);
  }

  return (data ?? []).map((ligne) => normaliser(ligne as unknown as Record<string, unknown>));
}

/** Récupère un jalon avec sa progression et sa santé, ou `null` s'il n'est pas visible. */
export async function recupererJalon(
  client: SupabaseClient<Database>,
  id: string,
): Promise<MilestoneAvecSante | null> {
  const { data, error } = await client
    .from('jalons_avec_sante')
    .select(COLONNES_AVEC_SANTE)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new MilestoneRepositoryError('Impossible de récupérer le jalon.', error);
  }

  return data ? normaliser(data as unknown as Record<string, unknown>) : null;
}

export async function creerJalon(
  client: SupabaseClient<Database>,
  donnees: MilestoneFormData,
): Promise<Milestone> {
  const { data, error } = await client
    .from('milestones')
    .insert({
      projet_id: donnees.projet_id,
      theme: donnees.theme,
      date_cible: donnees.date_cible,
    })
    .select(COLONNES_JALON)
    .single();

  if (error || !data) {
    throw new MilestoneRepositoryError('Impossible de créer le jalon.', error);
  }

  return data;
}

/** Met à jour un jalon. Rend `null` si la RLS ne laisse rien modifier. */
export async function mettreAJourJalon(
  client: SupabaseClient<Database>,
  id: string,
  donnees: Partial<Omit<MilestoneFormData, 'projet_id'>>,
): Promise<Milestone | null> {
  const { data, error } = await client
    .from('milestones')
    .update(donnees)
    .eq('id', id)
    .select(COLONNES_JALON)
    .maybeSingle();

  if (error) {
    throw new MilestoneRepositoryError('Impossible de mettre à jour le jalon.', error);
  }

  return data ?? null;
}

/** Supprime un jalon. Les tickets rattachés sont détachés, pas supprimés. */
export async function supprimerJalon(client: SupabaseClient<Database>, id: string): Promise<void> {
  const { error } = await client.from('milestones').delete().eq('id', id);

  if (error) {
    throw new MilestoneRepositoryError('Impossible de supprimer le jalon.', error);
  }
}

/**
 * Rattache un ticket existant à un jalon, ou l'en détache avec `null`.
 *
 * Rend `null` si la RLS refuse : le rattachement passe par la politique
 * d'écriture des tickets, réservée au porteur du projet.
 */
export async function rattacherTicket(
  client: SupabaseClient<Database>,
  ticketId: string,
  jalonId: string | null,
): Promise<{ id: string; jalon_id: string | null } | null> {
  const { data, error } = await client
    .from('tickets')
    .update({ jalon_id: jalonId })
    .eq('id', ticketId)
    .select('id, jalon_id')
    .maybeSingle();

  if (error) {
    throw new MilestoneRepositoryError('Impossible de rattacher le ticket au jalon.', error);
  }

  return data ?? null;
}

/** Une dépendance, accompagnée du ticket bloquant tel qu'on l'affiche. */
export interface DependanceDetaillee {
  ticket_id: string;
  bloque_par_id: string;
  bloque_par: { id: string; titre: string; statut: string } | null;
}

/** Les tickets qui bloquent celui-ci. */
export async function listerBloqueurs(
  client: SupabaseClient<Database>,
  ticketId: string,
): Promise<DependanceDetaillee[]> {
  const { data, error } = await client
    .from('ticket_dependencies')
    .select(
      'ticket_id, bloque_par_id, bloque_par:tickets!ticket_dependencies_bloque_par_id_fkey(id, titre, statut)',
    )
    .eq('ticket_id', ticketId);

  if (error) {
    throw new MilestoneRepositoryError('Impossible de lister les dépendances.', error);
  }

  return (data ?? []) as unknown as DependanceDetaillee[];
}

/** Les tickets que celui-ci débloque — la relation lue dans l'autre sens. */
export async function listerDebloques(
  client: SupabaseClient<Database>,
  ticketId: string,
): Promise<{ ticket_id: string; titre: string }[]> {
  const { data, error } = await client
    .from('ticket_dependencies')
    .select('ticket_id, ticket:tickets!ticket_dependencies_ticket_id_fkey(id, titre)')
    .eq('bloque_par_id', ticketId);

  if (error) {
    throw new MilestoneRepositoryError('Impossible de lister les tickets débloqués.', error);
  }

  return ((data ?? []) as unknown as { ticket_id: string; ticket: { titre: string } | null }[]).map(
    (ligne) => ({ ticket_id: ligne.ticket_id, titre: ligne.ticket?.titre ?? '' }),
  );
}

/** Erreur métier d'une dépendance refusée, distincte d'une panne technique. */
export class DependanceError extends Error {
  constructor(
    readonly motif: 'cycle' | 'projets_differents' | 'refusee',
    message: string,
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = 'DependanceError';
  }
}

/** Déclare que `ticket_id` est bloqué par `bloque_par_id`. */
export async function ajouterDependance(
  client: SupabaseClient<Database>,
  donnees: DependanceFormData,
): Promise<void> {
  const { error } = await client.from('ticket_dependencies').insert({
    ticket_id: donnees.ticket_id,
    bloque_par_id: donnees.bloque_par_id,
  });

  if (error) {
    const motif = error.message.includes('dependance_cyclique')
      ? 'cycle'
      : error.message.includes('dependance_projets_differents')
        ? 'projets_differents'
        : 'refusee';

    throw new DependanceError(motif, 'Cette dépendance ne peut pas être créée.', error);
  }
}

export async function supprimerDependance(
  client: SupabaseClient<Database>,
  donnees: DependanceFormData,
): Promise<void> {
  const { error } = await client
    .from('ticket_dependencies')
    .delete()
    .eq('ticket_id', donnees.ticket_id)
    .eq('bloque_par_id', donnees.bloque_par_id);

  if (error) {
    throw new MilestoneRepositoryError('Impossible de supprimer la dépendance.', error);
  }
}
