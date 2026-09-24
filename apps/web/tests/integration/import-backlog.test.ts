import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../lib/supabase/database.types';
import { importerBacklog } from '../../scripts/lib/importer';
import { BACKLOG_INITIAL, ID_PROJET, NOM_PROJET } from '../../scripts/lib/backlog-initial';
import {
  listerTickets,
  recupererTicket,
} from '../../features/tickets/repository/tickets-repository';
import { listerBloqueurs } from '../../features/milestones/repository/milestones-repository';
import {
  creerClientAdmin,
  creerClientAnonyme,
  creerUtilisateurDeTest,
  supprimerUtilisateurDeTest,
} from '../helpers/supabase';

/**
 * SV-012 — import du backlog de démarrage (section 24, règle 6).
 *
 * Le critère du ticket porte sur la rejouabilité : un import relancé doit
 * mettre à jour les mêmes lignes, pas en créer de nouvelles. C'est ce qui
 * permettra de le rejouer contre un projet distant sans repartir de zéro, et
 * sans détacher les soumissions ou messages déjà rattachés aux tickets.
 */

let admin: SupabaseClient<Database>;
let anonyme: SupabaseClient<Database>;
let porteurId: string;

/** Compte les lignes d'une table rattachées aux tickets du backlog. */
async function compterLiens(table: 'ticket_patterns' | 'ticket_dependencies'): Promise<number> {
  const identifiants = BACKLOG_INITIAL.map((ticket) => ticket.id);
  const { count, error } = await admin
    .from(table)
    .select('*', { count: 'exact', head: true })
    .in('ticket_id', identifiants);

  if (error) {
    throw new Error(`Comptage impossible sur ${table} : ${error.message}`);
  }

  return count ?? 0;
}

beforeAll(async () => {
  admin = creerClientAdmin();
  anonyme = creerClientAnonyme();
  porteurId = await creerUtilisateurDeTest(admin, 'Porteuse du backlog');

  await importerBacklog(admin, porteurId);
});

afterAll(async () => {
  // Supprimer le porteur emporte le projet et ses tickets en cascade.
  await supprimerUtilisateurDeTest(admin, porteurId);
});

describe('contenu importé', () => {
  it('crée le projet sous l’identifiant attendu', async () => {
    const { data } = await admin
      .from('projects')
      .select('id, nom, statut, proprietaire_id')
      .eq('id', ID_PROJET)
      .single();

    expect(data?.nom).toBe(NOM_PROJET);
    expect(data?.statut).toBe('actif');
    expect(data?.proprietaire_id).toBe(porteurId);
  });

  it('importe tous les tickets du backlog', async () => {
    const tickets = await listerTickets(admin, { projet_id: ID_PROJET });

    expect(tickets).toHaveLength(BACKLOG_INITIAL.length);
  });

  it('marque les douze tickets du backlog de démarrage comme fusionnés', async () => {
    const livres = BACKLOG_INITIAL.filter((ticket) => ticket.statut === 'fusionne');

    expect(livres).toHaveLength(12);

    for (const attendu of livres) {
      const ticket = await recupererTicket(admin, attendu.id);
      expect(ticket?.statut, attendu.reference).toBe('fusionne');
    }
  });

  it('laisse ouverts les tickets candidats', async () => {
    const ouverts = BACKLOG_INITIAL.filter((ticket) => ticket.statut === 'ouvert');

    expect(ouverts.map((ticket) => ticket.reference)).toEqual(['SV-012', 'SV-013']);

    for (const attendu of ouverts) {
      expect((await recupererTicket(admin, attendu.id))?.statut).toBe('ouvert');
    }
  });

  it('rattache à chaque ticket son pattern suggéré', async () => {
    const ticket = await recupererTicket(admin, BACKLOG_INITIAL[0]!.id);

    expect(ticket?.patterns_suggeres.map((pattern) => pattern.nom)).toEqual(['Spec-First']);
  });

  it('ne laisse aucun pattern du backlog introuvable', async () => {
    const resultat = await importerBacklog(admin, porteurId);

    // Un pattern cité mais absent de la bibliothèque signalerait une divergence
    // entre la section 22 et la section 5.2.
    expect(resultat.patterns_introuvables).toEqual([]);
  });

  it('traduit la colonne « Dépend de » en dépendances réelles', async () => {
    const sv004 = BACKLOG_INITIAL.find((ticket) => ticket.reference === 'SV-004')!;
    const bloqueurs = await listerBloqueurs(admin, sv004.id);
    const titres = bloqueurs.map((lien) => lien.bloque_par?.titre ?? '');

    expect(titres.some((titre) => titre.startsWith('SV-002'))).toBe(true);
    expect(titres.some((titre) => titre.startsWith('SV-003'))).toBe(true);
  });

  it('n’attribue aucune dépendance au premier ticket', async () => {
    const sv000 = BACKLOG_INITIAL.find((ticket) => ticket.reference === 'SV-000')!;

    expect(await listerBloqueurs(admin, sv000.id)).toHaveLength(0);
  });
});

describe('conformité des tickets importés', () => {
  it('satisfait la Definition of Ready pour tout ticket sorti du brouillon', async () => {
    // La contrainte Postgres aurait refusé l'insertion sinon : ce test constate
    // que le backlog transcrit est bien complet, pas que la base fonctionne.
    for (const attendu of BACKLOG_INITIAL) {
      const ticket = await recupererTicket(admin, attendu.id);

      expect(ticket?.contexte?.trim(), attendu.reference).toBeTruthy();
      expect(ticket?.criteres_acceptation?.trim(), attendu.reference).toBeTruthy();
      expect(ticket?.critere_test?.trim(), attendu.reference).toBeTruthy();
      expect(ticket?.complexite, attendu.reference).not.toBeNull();
      expect(ticket?.patterns_suggeres.length, attendu.reference).toBeGreaterThan(0);
    }
  });

  it('expose le projet et ses tickets à un visiteur anonyme', async () => {
    // Le projet est actif et les tickets ne sont pas des brouillons : la
    // roadmap du projet lui-même est publique.
    const tickets = await listerTickets(anonyme, { projet_id: ID_PROJET });

    expect(tickets).toHaveLength(BACKLOG_INITIAL.length);
  });
});

/** Le critère de test nommé par le ticket. */
describe('rejouabilité', () => {
  it('ne duplique ni tickets, ni patterns, ni dépendances', async () => {
    const avant = {
      tickets: (await listerTickets(admin, { projet_id: ID_PROJET })).length,
      patterns: await compterLiens('ticket_patterns'),
      dependances: await compterLiens('ticket_dependencies'),
    };

    await importerBacklog(admin, porteurId);
    await importerBacklog(admin, porteurId);

    expect({
      tickets: (await listerTickets(admin, { projet_id: ID_PROJET })).length,
      patterns: await compterLiens('ticket_patterns'),
      dependances: await compterLiens('ticket_dependencies'),
    }).toEqual(avant);
  });

  it('conserve les identifiants d’un import à l’autre', async () => {
    const avant = (await listerTickets(admin, { projet_id: ID_PROJET }))
      .map((ticket) => ticket.id)
      .sort();

    await importerBacklog(admin, porteurId);

    const apres = (await listerTickets(admin, { projet_id: ID_PROJET }))
      .map((ticket) => ticket.id)
      .sort();

    // Des identifiants qui changent détacheraient soumissions et messages.
    expect(apres).toEqual(avant);
  });

  it('préserve une soumission rattachée avant un nouvel import', async () => {
    const ticket = BACKLOG_INITIAL.find((candidat) => candidat.reference === 'SV-000')!;

    const { data: soumission } = await admin
      .from('submissions')
      .insert({
        ticket_id: ticket.id,
        auteur_id: porteurId,
        diff_url: 'https://github.com/ghalilahlou/shemaVaib/pull/1/files',
        preview_url: 'https://apercu.schemavibe.test/pr-1',
      })
      .select('id')
      .single();

    await importerBacklog(admin, porteurId);

    const { data: apres } = await admin
      .from('submissions')
      .select('id')
      .eq('id', soumission!.id)
      .maybeSingle();

    expect(apres?.id).toBe(soumission!.id);
  });

  it('remet à jour un titre modifié à la main', async () => {
    const ticket = BACKLOG_INITIAL.find((candidat) => candidat.reference === 'SV-005')!;

    await admin.from('tickets').update({ titre: 'Titre égaré' }).eq('id', ticket.id);

    await importerBacklog(admin, porteurId);

    // L'import fait autorité sur le contenu du backlog : il corrige une
    // divergence au lieu de la laisser s'installer.
    expect((await recupererTicket(admin, ticket.id))?.titre).toBe(ticket.titre);
  });
});
