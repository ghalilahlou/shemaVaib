import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Project } from '@schemavibe/shared-types';
import type { Database } from '../../../lib/supabase/database.types';
import type { ProjectFormData, ProjectListFilters } from '../schema';

/**
 * Couche d'accès aux données des projets.
 *
 * C'est le seul endroit de la feature autorisé à appeler `supabase.from(...)`
 * (section 18 du cahier des charges) : ni les composants ni les Server Actions
 * ne touchent au client Supabase. Un changement de schéma ne se répercute donc
 * qu'ici.
 *
 * Le client Supabase est passé en paramètre plutôt que construit sur place :
 * l'appelant décide des droits — client de session en production, client
 * anonyme ou à privilèges élevés dans les tests — et le comportement de la RLS
 * devient directement testable.
 */

/** Un projet accompagné du nom public de son porteur. */
export interface ProjectAvecProprietaire extends Project {
  proprietaire: { nom: string } | null;
}

const COLONNES_PROJET = 'id, proprietaire_id, nom, repo_url, statut, cree_le, maj_le';
const COLONNES_AVEC_PROPRIETAIRE = `${COLONNES_PROJET}, proprietaire:users!projects_proprietaire_id_fkey(nom)`;

/** Erreur remontée quand Supabase refuse ou échoue sur une opération projet. */
export class ProjectRepositoryError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'ProjectRepositoryError';
  }
}

/**
 * Liste les projets visibles par le client fourni, du plus récent au plus ancien.
 *
 * La RLS fait le tri : un visiteur anonyme ne voit que les projets sortis du
 * brouillon, le porteur voit en plus les siens.
 */
export async function listerProjets(
  client: SupabaseClient<Database>,
  filtres: ProjectListFilters = {},
): Promise<ProjectAvecProprietaire[]> {
  let requete = client
    .from('projects')
    .select(COLONNES_AVEC_PROPRIETAIRE)
    .order('cree_le', { ascending: false });

  if (filtres.statut) {
    requete = requete.eq('statut', filtres.statut);
  }

  const { data, error } = await requete;

  if (error) {
    throw new ProjectRepositoryError('Impossible de lister les projets.', error);
  }

  return (data ?? []) as unknown as ProjectAvecProprietaire[];
}

/** Récupère un projet par son identifiant, ou `null` s'il n'existe pas ou n'est pas visible. */
export async function recupererProjet(
  client: SupabaseClient<Database>,
  id: string,
): Promise<ProjectAvecProprietaire | null> {
  const { data, error } = await client
    .from('projects')
    .select(COLONNES_AVEC_PROPRIETAIRE)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new ProjectRepositoryError('Impossible de récupérer le projet.', error);
  }

  return (data as unknown as ProjectAvecProprietaire | null) ?? null;
}

/**
 * Crée un projet pour le porteur indiqué.
 *
 * La RLS vérifie de son côté que `proprietaire_id` correspond bien à la session
 * appelante : ce paramètre n'est pas une permission, seulement une donnée.
 */
export async function creerProjet(
  client: SupabaseClient<Database>,
  proprietaireId: string,
  donnees: ProjectFormData,
): Promise<Project> {
  const { data, error } = await client
    .from('projects')
    .insert({
      proprietaire_id: proprietaireId,
      nom: donnees.nom,
      repo_url: donnees.repo_url,
      statut: donnees.statut,
    })
    .select(COLONNES_PROJET)
    .single();

  if (error || !data) {
    throw new ProjectRepositoryError('Impossible de créer le projet.', error);
  }

  return data;
}

/** Met à jour un projet existant. Rend `null` si la RLS ne laisse rien modifier. */
export async function mettreAJourProjet(
  client: SupabaseClient<Database>,
  id: string,
  donnees: Partial<ProjectFormData>,
): Promise<Project | null> {
  const { data, error } = await client
    .from('projects')
    .update(donnees)
    .eq('id', id)
    .select(COLONNES_PROJET)
    .maybeSingle();

  if (error) {
    throw new ProjectRepositoryError('Impossible de mettre à jour le projet.', error);
  }

  return data ?? null;
}

/** Supprime un projet. Les tickets, jalons et messages rattachés tombent en cascade. */
export async function supprimerProjet(client: SupabaseClient<Database>, id: string): Promise<void> {
  const { error } = await client.from('projects').delete().eq('id', id);

  if (error) {
    throw new ProjectRepositoryError('Impossible de supprimer le projet.', error);
  }
}
