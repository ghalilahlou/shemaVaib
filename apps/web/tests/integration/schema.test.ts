import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../lib/supabase/database.types.js';
import {
  creerClientAdmin,
  creerClientAnonyme,
  creerUtilisateurDeTest,
  supprimerUtilisateurDeTest,
} from '../helpers/supabase.js';

/**
 * SV-002 — tests d'intégration du schéma initial, contre l'instance Supabase
 * locale (section 21 du cahier des charges).
 *
 * Ils vérifient trois choses : que les 7 entités de la section 9 existent avec
 * leurs relations, que les règles métier tenues par la base sont réellement
 * appliquées, et qu'aucune table n'est exposée par accident sans Row Level
 * Security.
 */

/** Les 7 entités de la section 9, plus la table de liaison tickets/patterns. */
const TABLES = [
  'users',
  'projects',
  'milestones',
  'tickets',
  'submissions',
  'messages',
  'patterns',
  'ticket_patterns',
] as const;

let admin: SupabaseClient<Database>;
let anonyme: SupabaseClient<Database>;
let proprietaireId: string;
let projetId: string;

beforeAll(async () => {
  admin = creerClientAdmin();
  anonyme = creerClientAnonyme();

  proprietaireId = await creerUtilisateurDeTest(admin, 'Porteuse de projet');

  const { data, error } = await admin
    .from('projects')
    .insert({ proprietaire_id: proprietaireId, nom: 'Projet de test SV-002' })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`Création du projet de test impossible : ${error?.message ?? 'inconnu'}`);
  }

  projetId = data.id;
});

afterAll(async () => {
  await supprimerUtilisateurDeTest(admin, proprietaireId);
});

describe('les 7 entités de la section 9 existent', () => {
  it.each(TABLES)('la table %s est interrogeable', async (table) => {
    const { error } = await admin.from(table).select('*').limit(1);

    expect(error).toBeNull();
  });
});

describe('Row Level Security', () => {
  it.each(TABLES.filter((table) => table !== 'patterns'))(
    'la table %s n’expose rien à un client anonyme',
    async (table) => {
      const { data, error } = await anonyme.from(table).select('*');

      expect(error).toBeNull();
      expect(data).toEqual([]);
    },
  );

  it('la bibliothèque de patterns est lisible publiquement', async () => {
    const { error } = await anonyme.from('patterns').select('*');

    expect(error).toBeNull();
  });

  it('un client anonyme ne peut pas créer de projet', async () => {
    const { error } = await anonyme
      .from('projects')
      .insert({ proprietaire_id: proprietaireId, nom: 'Projet interdit' });

    expect(error).not.toBeNull();
  });

  it('le projet de test est bien visible côté service_role', async () => {
    const { data, error } = await admin.from('projects').select('id').eq('id', projetId);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });
});

describe('Definition of Ready (section 5.1)', () => {
  it('accepte un brouillon incomplet', async () => {
    const { data, error } = await admin
      .from('tickets')
      .insert({ projet_id: projetId, titre: 'Brouillon incomplet' })
      .select('id, statut')
      .single();

    expect(error).toBeNull();
    expect(data?.statut).toBe('brouillon');
  });

  it('refuse de passer « ouvert » un ticket sans contexte ni critère de test', async () => {
    const { error } = await admin.from('tickets').insert({
      projet_id: projetId,
      titre: 'Ticket incomplet ouvert de force',
      statut: 'ouvert',
    });

    expect(error).not.toBeNull();
    expect(error?.message).toContain('tickets_definition_of_ready');
  });

  it('accepte un ticket « ouvert » qui réunit tous les champs requis', async () => {
    const { data, error } = await admin
      .from('tickets')
      .insert({
        projet_id: projetId,
        titre: 'Ticket complet',
        contexte: 'Le filtre par statut manque sur la liste des tickets.',
        criteres_acceptation: 'Un filtre par statut est disponible et conserve la sélection.',
        critere_test: 'Test e2e : filtrer sur « ouvert » ne laisse que des tickets ouverts.',
        complexite: 'S',
        statut: 'ouvert',
      })
      .select('id, statut')
      .single();

    expect(error).toBeNull();
    expect(data?.statut).toBe('ouvert');
  });

  it('exige un score de confiance sur un ticket généré automatiquement', async () => {
    const { error } = await admin.from('tickets').insert({
      projet_id: projetId,
      titre: 'Ticket généré sans score',
      source: 'genere_ia',
    });

    expect(error).not.toBeNull();
    expect(error?.message).toContain('tickets_score_confiance_si_genere');
  });

  it('refuse un score de confiance hors de l’intervalle [0, 1]', async () => {
    const { error } = await admin.from('tickets').insert({
      projet_id: projetId,
      titre: 'Ticket au score aberrant',
      source: 'genere_ia',
      score_confiance: 1.5,
    });

    expect(error).not.toBeNull();
  });
});

describe('cohérence des relations', () => {
  it('refuse une réclamation sans date de réclamation', async () => {
    const { error } = await admin.from('tickets').insert({
      projet_id: projetId,
      titre: 'Ticket réclamé à moitié',
      reclame_par: proprietaireId,
    });

    expect(error).not.toBeNull();
    expect(error?.message).toContain('tickets_reclamation_coherente');
  });

  it('refuse de rattacher un ticket à un jalon d’un autre projet', async () => {
    const autreProprietaire = await creerUtilisateurDeTest(admin, 'Autre porteur');

    const { data: autreProjet } = await admin
      .from('projects')
      .insert({ proprietaire_id: autreProprietaire, nom: 'Autre projet' })
      .select('id')
      .single();

    const { data: jalonEtranger } = await admin
      .from('milestones')
      .insert({ projet_id: autreProjet!.id, theme: 'Sécurisation' })
      .select('id')
      .single();

    const { error } = await admin.from('tickets').insert({
      projet_id: projetId,
      titre: 'Ticket mal rattaché',
      jalon_id: jalonEtranger!.id,
    });

    expect(error).not.toBeNull();

    await supprimerUtilisateurDeTest(admin, autreProprietaire);
  });

  it('refuse un message rattaché à la fois à un projet et à un ticket', async () => {
    const { data: ticket } = await admin
      .from('tickets')
      .insert({ projet_id: projetId, titre: 'Ticket porteur de fil' })
      .select('id')
      .single();

    const { error } = await admin.from('messages').insert({
      projet_id: projetId,
      ticket_id: ticket!.id,
      contenu: 'Message des deux côtés',
    });

    expect(error).not.toBeNull();
    expect(error?.message).toContain('messages_un_seul_contexte');
  });

  it('refuse un message rattaché à rien', async () => {
    const { error } = await admin.from('messages').insert({ contenu: 'Message orphelin' });

    expect(error).not.toBeNull();
    expect(error?.message).toContain('messages_un_seul_contexte');
  });

  it('accepte un message de canal projet et un message de fil de ticket', async () => {
    const { data: ticket } = await admin
      .from('tickets')
      .insert({ projet_id: projetId, titre: 'Ticket avec fil' })
      .select('id')
      .single();

    const { error: erreurCanal } = await admin
      .from('messages')
      .insert({ projet_id: projetId, contenu: 'Annonce sur le canal du projet' });

    const { error: erreurFil } = await admin
      .from('messages')
      .insert({ ticket_id: ticket!.id, contenu: 'Question technique sur le ticket' });

    expect(erreurCanal).toBeNull();
    expect(erreurFil).toBeNull();
  });

  it('associe un pattern à un ticket, en suggéré puis en utilisé', async () => {
    const { data: pattern } = await admin
      .from('patterns')
      .insert({ nom: `Pattern de test ${crypto.randomUUID()}`, categorie: 'execution' })
      .select('id')
      .single();

    const { data: ticket } = await admin
      .from('tickets')
      .insert({ projet_id: projetId, titre: 'Ticket à patterns' })
      .select('id')
      .single();

    const { error } = await admin.from('ticket_patterns').insert([
      { ticket_id: ticket!.id, pattern_id: pattern!.id, role: 'suggere' },
      { ticket_id: ticket!.id, pattern_id: pattern!.id, role: 'utilise' },
    ]);

    expect(error).toBeNull();
  });
});

describe('horodatage et cascade', () => {
  it('met à jour maj_le à chaque modification', async () => {
    const { data: creation } = await admin
      .from('tickets')
      .insert({ projet_id: projetId, titre: 'Ticket horodaté' })
      .select('id, maj_le')
      .single();

    const { data: modification } = await admin
      .from('tickets')
      .update({ titre: 'Ticket horodaté, renommé' })
      .eq('id', creation!.id)
      .select('maj_le')
      .single();

    expect(new Date(modification!.maj_le).getTime()).toBeGreaterThan(
      new Date(creation!.maj_le).getTime(),
    );
  });

  it('supprime les tickets d’un projet supprimé', async () => {
    const utilisateur = await creerUtilisateurDeTest(admin, 'Porteur éphémère');

    const { data: projet } = await admin
      .from('projects')
      .insert({ proprietaire_id: utilisateur, nom: 'Projet éphémère' })
      .select('id')
      .single();

    const { data: ticket } = await admin
      .from('tickets')
      .insert({ projet_id: projet!.id, titre: 'Ticket éphémère' })
      .select('id')
      .single();

    await admin.from('projects').delete().eq('id', projet!.id);

    const { data: restant } = await admin.from('tickets').select('id').eq('id', ticket!.id);

    expect(restant).toEqual([]);

    await supprimerUtilisateurDeTest(admin, utilisateur);
  });
});
