import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../../lib/supabase/database.types';

/**
 * Couche d'accès aux jetons personnels.
 *
 * Comme partout (section 18), seule couche autorisée à appeler
 * `supabase.from(...)`, client passé en paramètre pour que le comportement de la
 * RLS soit testable sous chaque identité. Deux identités la traversent ici : la
 * personne connectée, qui liste et révoque ses jetons, et le chemin d'échange,
 * qui retrouve un jeton par son empreinte avec la clé de service — une
 * recherche que la RLS ne peut pas servir, l'appelant n'étant pas encore
 * identifié à cet instant.
 */

const COLONNES = 'id, libelle, cree_le, dernier_usage_le, revoque_le' as const;

/** Un jeton tel qu'il s'affiche à son porteur : jamais le secret, jamais l'empreinte. */
export interface JetonAffiche {
  id: string;
  libelle: string;
  cree_le: string;
  dernier_usage_le: string | null;
  revoque_le: string | null;
}

/** Ce que le chemin d'échange a besoin de savoir d'un jeton présenté. */
export interface JetonReconnu {
  id: string;
  utilisateur_id: string;
  revoque_le: string | null;
  /** Nom public du porteur, rendu par la même requête pour n'en faire qu'une. */
  porteur_nom: string | null;
}

export class JetonRepositoryError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'JetonRepositoryError';
  }
}

/** Liste les jetons visibles par le client, du plus récent au plus ancien. */
export async function listerJetons(client: SupabaseClient<Database>): Promise<JetonAffiche[]> {
  const { data, error } = await client
    .from('api_tokens')
    .select(COLONNES)
    .order('cree_le', { ascending: false });

  if (error) {
    throw new JetonRepositoryError('Impossible de lire les jetons.', error);
  }

  return data ?? [];
}

/**
 * Enregistre un jeton pour l'utilisateur courant.
 *
 * Ni le propriétaire ni la date ne sont passés : la fonction les déduit de la
 * session, ce qui rend impossible d'émettre un jeton au nom d'un autre.
 */
export async function creerJeton(
  client: SupabaseClient<Database>,
  libelle: string,
  empreinte: string,
): Promise<JetonAffiche> {
  const { data, error } = await client.rpc('creer_jeton_api', {
    p_libelle: libelle,
    p_empreinte: empreinte,
  });

  if (error) {
    throw new JetonRepositoryError('Impossible de créer le jeton.', error);
  }

  return {
    id: data.id,
    libelle: data.libelle,
    cree_le: data.cree_le,
    dernier_usage_le: data.dernier_usage_le,
    revoque_le: data.revoque_le,
  };
}

/** Ferme définitivement un jeton. Une seconde révocation échoue. */
export async function revoquerJeton(
  client: SupabaseClient<Database>,
  jetonId: string,
): Promise<JetonAffiche> {
  const { data, error } = await client.rpc('revoquer_jeton_api', { p_jeton: jetonId });

  if (error) {
    throw new JetonRepositoryError('Impossible de révoquer le jeton.', error);
  }

  return {
    id: data.id,
    libelle: data.libelle,
    cree_le: data.cree_le,
    dernier_usage_le: data.dernier_usage_le,
    revoque_le: data.revoque_le,
  };
}

/**
 * Retrouve un jeton par son empreinte, révoqué ou non.
 *
 * Le client attendu ici porte la clé de service : l'appelant n'a pas encore
 * d'identité, c'est précisément ce que l'échange doit lui donner. Rendre aussi
 * les jetons révoqués est délibéré — c'est au chemin d'échange de décider, et
 * un refus explicite vaut mieux qu'un jeton introuvable.
 */
export async function trouverJetonParEmpreinte(
  client: SupabaseClient<Database>,
  empreinte: string,
): Promise<JetonReconnu | null> {
  const { data, error } = await client
    .from('api_tokens')
    .select('id, utilisateur_id, revoque_le, porteur:users!api_tokens_utilisateur_id_fkey(nom)')
    .eq('empreinte', empreinte)
    .maybeSingle();

  if (error) {
    throw new JetonRepositoryError('Impossible de vérifier le jeton.', error);
  }

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    utilisateur_id: data.utilisateur_id,
    revoque_le: data.revoque_le,
    porteur_nom: data.porteur?.nom ?? null,
  };
}

/**
 * Note qu'un jeton vient de servir.
 *
 * L'échec est volontairement silencieux pour l'appelant : ne pas avoir su
 * horodater un usage ne justifie pas de refuser une session par ailleurs
 * légitime.
 */
export async function marquerUsage(
  client: SupabaseClient<Database>,
  jetonId: string,
): Promise<void> {
  await client
    .from('api_tokens')
    .update({ dernier_usage_le: new Date().toISOString() })
    .eq('id', jetonId);
}
