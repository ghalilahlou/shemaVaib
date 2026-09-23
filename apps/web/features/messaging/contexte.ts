/**
 * Un message appartient à un canal de projet ou à un fil de ticket, jamais aux
 * deux (section 12). Ce type rend cette exclusivité inexprimable autrement, là
 * où deux champs facultatifs auraient laissé passer les combinaisons absurdes.
 */
export type ContexteDiscussion = { genre: 'projet'; id: string } | { genre: 'ticket'; id: string };

/** Un message tel qu'il s'affiche, quelle que soit sa provenance. */
export interface MessageAffiche {
  id: string;
  contenu: string;
  cree_le: string;
  auteur_id: string | null;
  auteur_nom: string | null;
}

/** Du plus ancien au plus récent — un fil se lit dans l'ordre où il s'écrit. */
export function trierEtDedupliquerMessages(messages: MessageAffiche[]): MessageAffiche[] {
  const parId = new Map<string, MessageAffiche>();

  for (const message of messages) {
    const existant = parId.get(message.id);

    // Une même ligne peut arriver deux fois — une fois au chargement, une fois
    // par l'abonnement. La version qui porte un nom d'auteur l'emporte.
    if (!existant || (existant.auteur_nom === null && message.auteur_nom !== null)) {
      parId.set(message.id, message);
    }
  }

  return [...parId.values()].sort((a, b) => a.cree_le.localeCompare(b.cree_le));
}
