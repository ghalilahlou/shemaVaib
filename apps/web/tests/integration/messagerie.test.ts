import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../lib/supabase/database.types';
import {
  envoyerMessage,
  listerMessages,
  resoudreNomsAuteurs,
} from '../../features/messaging/repository/messages-repository';
import { trierEtDedupliquerMessages } from '../../features/messaging/contexte';
import { creerProjet } from '../../features/projects/repository/projects-repository';
import {
  creerTicket,
  listerPatterns,
  supprimerTicket,
} from '../../features/tickets/repository/tickets-repository';
import {
  creerClientAdmin,
  creerClientAnonyme,
  creerClientConnecte,
  creerUtilisateurDeTest,
  supprimerUtilisateurDeTest,
} from '../helpers/supabase';
import { ecouter } from '../helpers/realtime';

/**
 * SV-010 — messagerie.
 *
 * Un message suit la visibilité de ce qui le porte (section 9), et cette règle
 * doit tenir à la diffusion comme à la lecture. Chaque test négatif est précédé
 * d'une amorce : sans elle, un silence prouverait seulement que le canal n'était
 * pas encore actif.
 */

let admin: SupabaseClient<Database>;
let anonyme: SupabaseClient<Database>;
let porteurId: string;
let porteur: SupabaseClient<Database>;
let contributeurId: string;
let contributeur: SupabaseClient<Database>;

let projetPublicId: string;
let projetBrouillonId: string;
let ticketPublicId: string;
let ticketCacheId: string;
let patternId: string;

let compteurAmorce = 0;

function formulaireTicket(titre: string, projetId: string) {
  return {
    projet_id: projetId,
    titre,
    contexte: 'Un contexte suffisant.',
    criteres_acceptation: 'Des critères explicites.',
    critere_test: 'Un critère de test explicite.',
    complexite: 'S' as const,
    priorite: 'normale' as const,
    source: 'manuel' as const,
    patterns_suggeres: [patternId],
    publier: true,
  };
}

/**
 * Amorce : un message sur le canal public, que tout abonné a le droit de voir.
 * Répétée jusqu'à revenir, elle atteste que le canal délivre.
 */
async function amorcer(): Promise<void> {
  compteurAmorce += 1;
  await envoyerMessage(porteur, {
    contexte: { genre: 'projet', id: projetPublicId },
    auteurId: porteurId,
    contenu: `Amorce ${compteurAmorce}`,
  });
}

beforeAll(async () => {
  admin = creerClientAdmin();
  anonyme = creerClientAnonyme();

  porteurId = await creerUtilisateurDeTest(admin, 'Porteuse SV-010');
  contributeurId = await creerUtilisateurDeTest(admin, 'Contributeur SV-010');
  porteur = await creerClientConnecte(porteurId);
  contributeur = await creerClientConnecte(contributeurId);

  const projetPublic = await creerProjet(porteur, porteurId, {
    nom: 'Projet messagerie',
    repo_url: null,
    statut: 'actif',
  });
  projetPublicId = projetPublic.id;

  const projetBrouillon = await creerProjet(porteur, porteurId, {
    nom: 'Projet messagerie privé',
    repo_url: null,
    statut: 'brouillon',
  });
  projetBrouillonId = projetBrouillon.id;

  patternId = (await listerPatterns(anonyme)).find((pattern) => pattern.nom === 'Spec-First')!.id;

  const ticketPublic = await creerTicket(
    porteur,
    formulaireTicket('Ticket public messagerie', projetPublicId),
    'ouvert',
  );
  ticketPublicId = ticketPublic.id;

  const ticketCache = await creerTicket(
    porteur,
    formulaireTicket('Ticket privé messagerie', projetBrouillonId),
    'ouvert',
  );
  ticketCacheId = ticketCache.id;
});

afterAll(async () => {
  await supprimerTicket(porteur, ticketPublicId);
  await supprimerTicket(porteur, ticketCacheId);
  await supprimerUtilisateurDeTest(admin, porteurId);
  await supprimerUtilisateurDeTest(admin, contributeurId);
});

describe('trierEtDedupliquerMessages', () => {
  const message = (id: string, date: string, nom: string | null = null) => ({
    id,
    contenu: 'Contenu',
    cree_le: date,
    auteur_id: 'auteur',
    auteur_nom: nom,
  });

  it('trie du plus ancien au plus récent', () => {
    const tries = trierEtDedupliquerMessages([
      message('b', '2026-09-24T12:00:00Z'),
      message('a', '2026-09-24T10:00:00Z'),
    ]);

    expect(tries.map((element) => element.id)).toEqual(['a', 'b']);
  });

  it('préfère la version qui porte un nom d’auteur', () => {
    // La même ligne peut arriver deux fois : une fois au chargement, une fois
    // par l'abonnement — et l'abonnement ne connaît pas encore le nom.
    const tries = trierEtDedupliquerMessages([
      message('a', '2026-09-24T10:00:00Z', 'Alice'),
      message('a', '2026-09-24T10:00:00Z', null),
    ]);

    expect(tries).toHaveLength(1);
    expect(tries[0]?.auteur_nom).toBe('Alice');
  });
});

describe('canal de projet', () => {
  it('accepte un message d’un utilisateur connecté et le rend lisible', async () => {
    const envoye = await envoyerMessage(contributeur, {
      contexte: { genre: 'projet', id: projetPublicId },
      auteurId: contributeurId,
      contenu: 'Bonjour le canal.',
    });

    expect(envoye.contenu).toBe('Bonjour le canal.');
    expect(envoye.auteur_nom).toBe('Contributeur SV-010');

    const messages = await listerMessages(anonyme, { genre: 'projet', id: projetPublicId });
    expect(messages.map((message) => message.id)).toContain(envoye.id);
  });

  it('refuse un visiteur anonyme', async () => {
    await expect(
      envoyerMessage(anonyme, {
        contexte: { genre: 'projet', id: projetPublicId },
        auteurId: contributeurId,
        contenu: 'Message anonyme.',
      }),
    ).rejects.toThrow('Impossible d’envoyer le message.');
  });

  it('refuse un message signé au nom d’autrui', async () => {
    await expect(
      envoyerMessage(contributeur, {
        contexte: { genre: 'projet', id: projetPublicId },
        auteurId: porteurId,
        contenu: 'Message usurpé.',
      }),
    ).rejects.toThrow('Impossible d’envoyer le message.');
  });

  it('refuse d’écrire dans un projet qu’on ne voit pas', async () => {
    await expect(
      envoyerMessage(contributeur, {
        contexte: { genre: 'projet', id: projetBrouillonId },
        auteurId: contributeurId,
        contenu: 'Message intrusif.',
      }),
    ).rejects.toThrow('Impossible d’envoyer le message.');
  });

  it('laisse le porteur écrire dans son propre projet non publié', async () => {
    const envoye = await envoyerMessage(porteur, {
      contexte: { genre: 'projet', id: projetBrouillonId },
      auteurId: porteurId,
      contenu: 'Note pour moi-même.',
    });

    expect(await listerMessages(porteur, { genre: 'projet', id: projetBrouillonId })).toHaveLength(
      1,
    );
    // Mais personne d'autre ne le voit.
    expect(await listerMessages(anonyme, { genre: 'projet', id: projetBrouillonId })).toEqual([]);
    expect(await listerMessages(contributeur, { genre: 'projet', id: projetBrouillonId })).toEqual(
      [],
    );
    expect(envoye.contenu).toBe('Note pour moi-même.');
  });

  it('rend les messages du plus ancien au plus récent', async () => {
    const messages = await listerMessages(anonyme, { genre: 'projet', id: projetPublicId });
    const dates = messages.map((message) => new Date(message.cree_le).getTime());

    expect(dates).toEqual([...dates].sort((a, b) => a - b));
  });
});

describe('fil de ticket', () => {
  it('accepte un message sur un ticket visible', async () => {
    const envoye = await envoyerMessage(contributeur, {
      contexte: { genre: 'ticket', id: ticketPublicId },
      auteurId: contributeurId,
      contenu: 'Question technique.',
    });

    const messages = await listerMessages(anonyme, { genre: 'ticket', id: ticketPublicId });

    expect(messages.map((message) => message.id)).toContain(envoye.id);
  });

  it('ne mélange pas le fil du ticket et le canal du projet', async () => {
    const duCanal = await listerMessages(anonyme, { genre: 'projet', id: projetPublicId });
    const duFil = await listerMessages(anonyme, { genre: 'ticket', id: ticketPublicId });

    expect(duCanal.some((message) => message.contenu === 'Question technique.')).toBe(false);
    expect(duFil.every((message) => message.contenu !== 'Bonjour le canal.')).toBe(true);
  });

  it('refuse d’écrire sur un ticket qu’on ne voit pas', async () => {
    await expect(
      envoyerMessage(contributeur, {
        contexte: { genre: 'ticket', id: ticketCacheId },
        auteurId: contributeurId,
        contenu: 'Message sur ticket caché.',
      }),
    ).rejects.toThrow('Impossible d’envoyer le message.');
  });

  it('cache le fil d’un ticket invisible', async () => {
    await envoyerMessage(porteur, {
      contexte: { genre: 'ticket', id: ticketCacheId },
      auteurId: porteurId,
      contenu: 'Note privée sur le ticket.',
    });

    expect(await listerMessages(anonyme, { genre: 'ticket', id: ticketCacheId })).toEqual([]);
    expect(await listerMessages(contributeur, { genre: 'ticket', id: ticketCacheId })).toEqual([]);
    expect(
      (await listerMessages(porteur, { genre: 'ticket', id: ticketCacheId })).length,
    ).toBeGreaterThan(0);
  });
});

describe('ce que la messagerie n’autorise pas', () => {
  it('refuse un message rattaché ni à un projet ni à un ticket', async () => {
    const { error } = await contributeur
      .from('messages')
      .insert({ auteur_id: contributeurId, contenu: 'Message orphelin' });

    expect(error).not.toBeNull();
  });

  it('refuse un message rattaché aux deux à la fois', async () => {
    const { error } = await contributeur.from('messages').insert({
      projet_id: projetPublicId,
      ticket_id: ticketPublicId,
      auteur_id: contributeurId,
      contenu: 'Message des deux côtés',
    });

    expect(error).not.toBeNull();
  });

  it('ne laisse personne modifier un message envoyé', async () => {
    const envoye = await envoyerMessage(contributeur, {
      contexte: { genre: 'projet', id: projetPublicId },
      auteurId: contributeurId,
      contenu: 'Message figé.',
    });

    // Hors périmètre de ce ticket : aucune politique d'écriture en mise à jour
    // n'existe, et la RLS refuse par défaut.
    const { data } = await contributeur
      .from('messages')
      .update({ contenu: 'Message réécrit.' })
      .eq('id', envoye.id)
      .select('id');

    expect(data ?? []).toEqual([]);
  });

  it('ne laisse personne supprimer un message envoyé', async () => {
    const envoye = await envoyerMessage(contributeur, {
      contexte: { genre: 'projet', id: projetPublicId },
      auteurId: contributeurId,
      contenu: 'Message indélébile.',
    });

    await contributeur.from('messages').delete().eq('id', envoye.id);

    const messages = await listerMessages(anonyme, { genre: 'projet', id: projetPublicId });
    expect(messages.map((message) => message.id)).toContain(envoye.id);
  });
});

describe('resoudreNomsAuteurs', () => {
  it('rend les noms publics demandés', async () => {
    const noms = await resoudreNomsAuteurs(anonyme, [porteurId, contributeurId]);

    expect(noms[porteurId]).toBe('Porteuse SV-010');
    expect(noms[contributeurId]).toBe('Contributeur SV-010');
  });

  it('rend un objet vide sans identifiant', async () => {
    expect(await resoudreNomsAuteurs(anonyme, [])).toEqual({});
  });
});

/**
 * La Row Level Security s'applique à la diffusion, pas seulement à la lecture
 * (convention section 18). Un visiteur ne doit rien recevoir d'une discussion
 * qu'il n'a pas le droit de lire — même pendant qu'il écoute.
 */
describe('diffusion temps réel', () => {
  it('pousse à un anonyme un message du canal public', async () => {
    let envoye = '';

    const recus = await ecouter(
      anonyme,
      ['messages'],
      amorcer,
      async () => {
        const message = await envoyerMessage(contributeur, {
          contexte: { genre: 'projet', id: projetPublicId },
          auteurId: contributeurId,
          contenu: 'Message diffusé.',
        });
        envoye = message.id;
      },
      { jusqua: (evenement) => evenement.ligne.contenu === 'Message diffusé.' },
    );

    expect(recus.some((recu) => recu.ligne.id === envoye)).toBe(true);
  });

  it('pousse à un anonyme un message du fil d’un ticket public', async () => {
    const recus = await ecouter(
      anonyme,
      ['messages'],
      amorcer,
      async () => {
        await envoyerMessage(contributeur, {
          contexte: { genre: 'ticket', id: ticketPublicId },
          auteurId: contributeurId,
          contenu: 'Message de fil diffusé.',
        });
      },
      { jusqua: (evenement) => evenement.ligne.contenu === 'Message de fil diffusé.' },
    );

    expect(recus.some((recu) => recu.ligne.contenu === 'Message de fil diffusé.')).toBe(true);
  });

  it('ne pousse rien d’un projet non publié', async () => {
    const recus = await ecouter(anonyme, ['messages'], amorcer, async () => {
      await envoyerMessage(porteur, {
        contexte: { genre: 'projet', id: projetBrouillonId },
        auteurId: porteurId,
        contenu: 'Secret de projet.',
      });
    });

    expect(recus.filter((recu) => recu.ligne.contenu === 'Secret de projet.')).toEqual([]);
  });

  it('ne pousse rien du fil d’un ticket invisible', async () => {
    const recus = await ecouter(anonyme, ['messages'], amorcer, async () => {
      await envoyerMessage(porteur, {
        contexte: { genre: 'ticket', id: ticketCacheId },
        auteurId: porteurId,
        contenu: 'Secret de ticket.',
      });
    });

    expect(recus.filter((recu) => recu.ligne.contenu === 'Secret de ticket.')).toEqual([]);
  });

  it('pousse au porteur les messages de ses propres discussions privées', async () => {
    const recus = await ecouter(
      porteur,
      ['messages'],
      amorcer,
      async () => {
        await envoyerMessage(porteur, {
          contexte: { genre: 'projet', id: projetBrouillonId },
          auteurId: porteurId,
          contenu: 'Visible du seul porteur.',
        });
      },
      { jusqua: (evenement) => evenement.ligne.contenu === 'Visible du seul porteur.' },
    );

    expect(recus.some((recu) => recu.ligne.contenu === 'Visible du seul porteur.')).toBe(true);
  });
});
