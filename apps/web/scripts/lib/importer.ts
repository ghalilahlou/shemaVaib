import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../lib/supabase/database.types';
import { BACKLOG_INITIAL, ID_PROJET, NOM_PROJET, type TicketDuBacklog } from './backlog-initial';

/**
 * Import du backlog de démarrage dans la plateforme (section 24, règle 6).
 *
 * Ce module joue le rôle d'une couche repository, et en respecte la règle : il
 * est le seul du chemin d'import à appeler `supabase.from(...)`. Il ne vit pas
 * sous `features/` parce qu'il ne sert aucune page — c'est une tâche
 * d'administration, exécutée à la main, jamais dans le cycle d'une requête. Il
 * n'importe donc pas `server-only`, qui l'empêcherait de tourner comme script.
 *
 * L'opération est rejouable de bout en bout. Les identifiants des tickets et du
 * projet sont fixes (voir `backlog-initial.ts`), et tout passe par des `upsert` :
 * relancer l'import met à jour les mêmes lignes, ne duplique rien, et préserve
 * les soumissions et messages déjà rattachés.
 */

export interface ResultatImport {
  projet_id: string;
  tickets_importes: number;
  patterns_rattaches: number;
  dependances_creees: number;
  /** Patterns cités par le backlog mais absents de la bibliothèque. */
  patterns_introuvables: string[];
}

export class ImportError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'ImportError';
  }
}

/**
 * Importe le backlog sous le projet dédié, créé s'il n'existe pas.
 *
 * Le client doit porter des droits suffisants pour écrire sous le compte
 * indiqué : en pratique, la clé `service_role`. L'import est une opération
 * d'administration, pas une action d'utilisateur.
 */
export async function importerBacklog(
  client: SupabaseClient<Database>,
  proprietaireId: string,
  backlog: TicketDuBacklog[] = BACKLOG_INITIAL,
): Promise<ResultatImport> {
  const { error: erreurProjet } = await client.from('projects').upsert(
    {
      id: ID_PROJET,
      proprietaire_id: proprietaireId,
      nom: NOM_PROJET,
      repo_url: 'https://github.com/ghalilahlou/shemaVaib',
      statut: 'actif',
    },
    { onConflict: 'id' },
  );

  if (erreurProjet) {
    throw new ImportError('Impossible de créer ou mettre à jour le projet.', erreurProjet);
  }

  const { error: erreurTickets } = await client.from('tickets').upsert(
    backlog.map((ticket) => ({
      id: ticket.id,
      projet_id: ID_PROJET,
      titre: ticket.titre,
      contexte: ticket.contexte,
      criteres_acceptation: ticket.criteres_acceptation,
      critere_test: ticket.critere_test,
      complexite: ticket.complexite,
      statut: ticket.statut,
      source: 'manuel' as const,
      priorite: 'normale' as const,
    })),
    { onConflict: 'id' },
  );

  if (erreurTickets) {
    throw new ImportError('Impossible d’importer les tickets.', erreurTickets);
  }

  const { patternsRattaches, patternsIntrouvables } = await rattacherPatterns(client, backlog);
  const dependancesCreees = await creerDependances(client, backlog);

  return {
    projet_id: ID_PROJET,
    tickets_importes: backlog.length,
    patterns_rattaches: patternsRattaches,
    dependances_creees: dependancesCreees,
    patterns_introuvables: patternsIntrouvables,
  };
}

/**
 * Rattache à chaque ticket son pattern suggéré.
 *
 * Un pattern cité mais absent de la bibliothèque n'interrompt pas l'import : il
 * est signalé dans le résultat. Échouer ici laisserait un import à moitié fait,
 * ce qui est pire qu'un rattachement manquant et signalé.
 */
async function rattacherPatterns(
  client: SupabaseClient<Database>,
  backlog: TicketDuBacklog[],
): Promise<{ patternsRattaches: number; patternsIntrouvables: string[] }> {
  const noms = [...new Set(backlog.map((ticket) => ticket.pattern))];

  const { data, error } = await client.from('patterns').select('id, nom').in('nom', noms);

  if (error) {
    throw new ImportError('Impossible de lire la bibliothèque de patterns.', error);
  }

  const parNom = new Map((data ?? []).map((pattern) => [pattern.nom, pattern.id]));
  const introuvables = noms.filter((nom) => !parNom.has(nom));

  const liens = backlog
    .map((ticket) => ({ ticket, patternId: parNom.get(ticket.pattern) }))
    .filter((entree): entree is { ticket: TicketDuBacklog; patternId: string } =>
      Boolean(entree.patternId),
    )
    .map((entree) => ({
      ticket_id: entree.ticket.id,
      pattern_id: entree.patternId,
      role: 'suggere' as const,
    }));

  if (liens.length > 0) {
    const { error: erreurLiens } = await client
      .from('ticket_patterns')
      .upsert(liens, { onConflict: 'ticket_id,pattern_id,role' });

    if (erreurLiens) {
      throw new ImportError('Impossible de rattacher les patterns.', erreurLiens);
    }
  }

  return { patternsRattaches: liens.length, patternsIntrouvables: introuvables };
}

/** Traduit la colonne « Dépend de » de la section 22 en dépendances réelles. */
async function creerDependances(
  client: SupabaseClient<Database>,
  backlog: TicketDuBacklog[],
): Promise<number> {
  const parReference = new Map(backlog.map((ticket) => [ticket.reference, ticket.id]));

  const liens = backlog.flatMap((ticket) =>
    ticket.depend_de
      .map((reference) => parReference.get(reference))
      .filter((bloqueurId): bloqueurId is string => Boolean(bloqueurId))
      .map((bloqueurId) => ({ ticket_id: ticket.id, bloque_par_id: bloqueurId })),
  );

  if (liens.length === 0) {
    return 0;
  }

  const { error } = await client
    .from('ticket_dependencies')
    .upsert(liens, { onConflict: 'ticket_id,bloque_par_id' });

  if (error) {
    throw new ImportError('Impossible de créer les dépendances entre tickets.', error);
  }

  return liens.length;
}
