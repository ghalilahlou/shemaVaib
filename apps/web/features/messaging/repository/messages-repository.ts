import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../../lib/supabase/database.types';
import type { ContexteDiscussion, MessageAffiche } from '../contexte';

/**
 * Couche d'accès aux données de la messagerie.
 *
 * Comme partout (section 18), seule couche autorisée à appeler
 * `supabase.from(...)`, client passé en paramètre pour que le comportement de
 * la RLS soit testable sous chaque identité.
 */

const COLONNES =
  'id, contenu, cree_le, auteur_id, auteur:users!messages_auteur_id_fkey(nom)' as const;

/** Erreur remontée quand Supabase refuse ou échoue sur une opération de message. */
export class MessageRepositoryError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'MessageRepositoryError';
  }
}

interface LigneBrute {
  id: string;
  contenu: string;
  cree_le: string;
  auteur_id: string | null;
  auteur: { nom: string } | null;
}

function normaliser(ligne: LigneBrute): MessageAffiche {
  return {
    id: ligne.id,
    contenu: ligne.contenu,
    cree_le: ligne.cree_le,
    auteur_id: ligne.auteur_id,
    auteur_nom: ligne.auteur?.nom ?? null,
  };
}

/** Nombre de messages chargés d'emblée dans un fil. */
export const MAX_MESSAGES_CHARGES = 200;

/** Lit un canal de projet ou un fil de ticket, du plus ancien au plus récent. */
export async function listerMessages(
  client: SupabaseClient<Database>,
  contexte: ContexteDiscussion,
): Promise<MessageAffiche[]> {
  const colonne = contexte.genre === 'projet' ? 'projet_id' : 'ticket_id';

  const { data, error } = await client
    .from('messages')
    .select(COLONNES)
    .eq(colonne, contexte.id)
    .order('cree_le', { ascending: true })
    .limit(MAX_MESSAGES_CHARGES);

  if (error) {
    throw new MessageRepositoryError('Impossible de charger la discussion.', error);
  }

  return ((data ?? []) as unknown as LigneBrute[]).map(normaliser);
}

/**
 * Publie un message.
 *
 * `auteur_id` n'est pas un paramètre libre : la politique d'écriture exige
 * qu'il corresponde à la session appelante, et le refuse sinon.
 */
export async function envoyerMessage(
  client: SupabaseClient<Database>,
  entree: { contexte: ContexteDiscussion; auteurId: string; contenu: string },
): Promise<MessageAffiche> {
  const { data, error } = await client
    .from('messages')
    .insert({
      projet_id: entree.contexte.genre === 'projet' ? entree.contexte.id : null,
      ticket_id: entree.contexte.genre === 'ticket' ? entree.contexte.id : null,
      auteur_id: entree.auteurId,
      contenu: entree.contenu,
    })
    .select(COLONNES)
    .single();

  if (error || !data) {
    throw new MessageRepositoryError('Impossible d’envoyer le message.', error);
  }

  return normaliser(data as unknown as LigneBrute);
}

/**
 * Résout les noms publics d'une poignée d'auteurs.
 *
 * Sert au fil temps réel : la charge Realtime porte l'identifiant de l'auteur,
 * pas son nom. Plutôt que de laisser le hook interroger la base — ce que la
 * convention de la section 18 lui interdit —, il passe par une Server Action qui
 * appelle cette fonction.
 */
export async function resoudreNomsAuteurs(
  client: SupabaseClient<Database>,
  identifiants: string[],
): Promise<Record<string, string>> {
  if (identifiants.length === 0) {
    return {};
  }

  const { data, error } = await client.from('users').select('id, nom').in('id', identifiants);

  if (error) {
    throw new MessageRepositoryError('Impossible de résoudre les auteurs.', error);
  }

  return Object.fromEntries((data ?? []).map((utilisateur) => [utilisateur.id, utilisateur.nom]));
}
