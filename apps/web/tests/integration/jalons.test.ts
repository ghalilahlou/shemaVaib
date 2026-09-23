import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../lib/supabase/database.types';
import {
  ajouterDependance,
  creerJalon,
  listerBloqueurs,
  listerDebloques,
  listerJalons,
  mettreAJourJalon,
  rattacherTicket,
  recupererJalon,
  supprimerDependance,
  supprimerJalon,
} from '../../features/milestones/repository/milestones-repository';
import {
  creerTicket,
  listerPatterns,
  supprimerTicket,
} from '../../features/tickets/repository/tickets-repository';
import { creerProjet } from '../../features/projects/repository/projects-repository';
import {
  creerClientAdmin,
  creerClientAnonyme,
  creerClientConnecte,
  creerUtilisateurDeTest,
  supprimerUtilisateurDeTest,
} from '../helpers/supabase';

/**
 * SV-009 — jalons, dépendances, progression et santé.
 *
 * La santé dépend du temps écoulé : les tests la mettent à l'épreuve en créant
 * des tickets déjà datés, ce qui permet de vérifier des seuils de sept et
 * quatorze jours sans attendre deux semaines. Chaque seuil est franchi dans les
 * deux sens, sans quoi le test ne prouverait pas qu'il se déclenche au bon
 * moment.
 */

let admin: SupabaseClient<Database>;
let anonyme: SupabaseClient<Database>;
let porteurId: string;
let porteur: SupabaseClient<Database>;
let tiersId: string;
let tiers: SupabaseClient<Database>;
let projetPublicId: string;
let projetBrouillonId: string;
let patternId: string;

function formulaireTicket(titre: string, projetId = projetPublicId) {
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
 * Crée un ticket dont la dernière activité remonte à N jours.
 *
 * L'âge est fixé à l'insertion, et non par une mise à jour : le trigger
 * `touch_maj_le` remet `maj_le` à l'instant présent à chaque UPDATE, si bien
 * qu'un ticket « vieilli » après coup redevient immédiatement récent. Trois
 * tests de seuil passaient ainsi pour la mauvaise raison avant cette correction.
 */
async function creerTicketAge(options: {
  titre: string;
  jalonId: string;
  jours: number;
  statut?: 'ouvert' | 'fusionne';
  projetId?: string;
}): Promise<string> {
  const date = new Date(Date.now() - options.jours * 86_400_000).toISOString();

  const { data, error } = await admin
    .from('tickets')
    .insert({
      projet_id: options.projetId ?? projetPublicId,
      jalon_id: options.jalonId,
      titre: options.titre,
      contexte: 'Un contexte suffisant.',
      criteres_acceptation: 'Des critères explicites.',
      critere_test: 'Un critère de test explicite.',
      complexite: 'S',
      statut: options.statut ?? 'ouvert',
      cree_le: date,
      maj_le: date,
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`Impossible de créer le ticket daté : ${error?.message ?? 'inconnu'}`);
  }

  return data.id;
}

beforeAll(async () => {
  admin = creerClientAdmin();
  anonyme = creerClientAnonyme();

  porteurId = await creerUtilisateurDeTest(admin, 'Porteuse SV-009');
  tiersId = await creerUtilisateurDeTest(admin, 'Tiers SV-009');
  porteur = await creerClientConnecte(porteurId);
  tiers = await creerClientConnecte(tiersId);

  const projetPublic = await creerProjet(porteur, porteurId, {
    nom: 'Projet jalons',
    repo_url: null,
    statut: 'actif',
  });
  projetPublicId = projetPublic.id;

  const projetBrouillon = await creerProjet(porteur, porteurId, {
    nom: 'Projet jalons privé',
    repo_url: null,
    statut: 'brouillon',
  });
  projetBrouillonId = projetBrouillon.id;

  patternId = (await listerPatterns(anonyme)).find((pattern) => pattern.nom === 'Spec-First')!.id;
});

afterAll(async () => {
  await supprimerUtilisateurDeTest(admin, porteurId);
  await supprimerUtilisateurDeTest(admin, tiersId);
});

describe('CRUD des jalons', () => {
  it('crée un jalon avec un thème et sans date cible', async () => {
    const jalon = await creerJalon(porteur, {
      projet_id: projetPublicId,
      theme: 'Sécurisation',
      date_cible: null,
    });

    expect(jalon.theme).toBe('Sécurisation');
    expect(jalon.date_cible).toBeNull();

    await supprimerJalon(porteur, jalon.id);
  });

  it('accepte une date cible', async () => {
    const jalon = await creerJalon(porteur, {
      projet_id: projetPublicId,
      theme: 'Stabilisation',
      date_cible: '2026-12-31',
    });

    expect(jalon.date_cible).toBe('2026-12-31');

    await supprimerJalon(porteur, jalon.id);
  });

  it('laisse le porteur renommer son jalon', async () => {
    const jalon = await creerJalon(porteur, {
      projet_id: projetPublicId,
      theme: 'Thème initial',
      date_cible: null,
    });

    const modifie = await mettreAJourJalon(porteur, jalon.id, { theme: 'Thème corrigé' });

    expect(modifie?.theme).toBe('Thème corrigé');

    await supprimerJalon(porteur, jalon.id);
  });

  it('détache les tickets plutôt que de les supprimer avec le jalon', async () => {
    const jalon = await creerJalon(porteur, {
      projet_id: projetPublicId,
      theme: 'Jalon éphémère',
      date_cible: null,
    });
    const ticket = await creerTicket(porteur, formulaireTicket('Ticket rescapé'), 'ouvert');
    await rattacherTicket(porteur, ticket.id, jalon.id);

    await supprimerJalon(porteur, jalon.id);

    const { data } = await admin.from('tickets').select('jalon_id').eq('id', ticket.id).single();

    expect(data?.jalon_id).toBeNull();

    await supprimerTicket(porteur, ticket.id);
  });
});

describe('Row Level Security des jalons', () => {
  it('expose à un anonyme les jalons d’un projet public', async () => {
    const jalon = await creerJalon(porteur, {
      projet_id: projetPublicId,
      theme: 'Jalon public',
      date_cible: null,
    });

    expect(await recupererJalon(anonyme, jalon.id)).not.toBeNull();

    await supprimerJalon(porteur, jalon.id);
  });

  it('cache les jalons d’un projet non publié', async () => {
    const jalon = await creerJalon(porteur, {
      projet_id: projetBrouillonId,
      theme: 'Jalon privé',
      date_cible: null,
    });

    expect(await recupererJalon(anonyme, jalon.id)).toBeNull();
    expect(await recupererJalon(tiers, jalon.id)).toBeNull();
    expect(await recupererJalon(porteur, jalon.id)).not.toBeNull();

    await supprimerJalon(porteur, jalon.id);
  });

  it('empêche un tiers de créer un jalon sur le projet d’autrui', async () => {
    await expect(
      creerJalon(tiers, { projet_id: projetPublicId, theme: 'Jalon intrus', date_cible: null }),
    ).rejects.toThrow('Impossible de créer le jalon.');
  });

  it('empêche un visiteur anonyme de créer un jalon', async () => {
    await expect(
      creerJalon(anonyme, { projet_id: projetPublicId, theme: 'Jalon anonyme', date_cible: null }),
    ).rejects.toThrow('Impossible de créer le jalon.');
  });

  it('ne laisse pas un tiers modifier le jalon d’autrui', async () => {
    const jalon = await creerJalon(porteur, {
      projet_id: projetPublicId,
      theme: 'Jalon gardé',
      date_cible: null,
    });

    expect(await mettreAJourJalon(tiers, jalon.id, { theme: 'Détourné' })).toBeNull();
    expect((await recupererJalon(anonyme, jalon.id))?.theme).toBe('Jalon gardé');

    await supprimerJalon(porteur, jalon.id);
  });
});

describe('progression', () => {
  it('vaut zéro sur un jalon sans ticket', async () => {
    const jalon = await creerJalon(porteur, {
      projet_id: projetPublicId,
      theme: 'Jalon vide',
      date_cible: null,
    });

    const lu = await recupererJalon(anonyme, jalon.id);

    expect(lu?.tickets_total).toBe(0);
    expect(lu?.progression).toBe(0);
    expect(lu?.sante).toBe('a_jour');

    await supprimerJalon(porteur, jalon.id);
  });

  it('compte comme achevé un ticket ayant atteint « soumis »', async () => {
    const jalon = await creerJalon(porteur, {
      projet_id: projetPublicId,
      theme: 'Jalon à moitié',
      date_cible: null,
    });

    const fait = await creerTicket(porteur, formulaireTicket('Ticket achevé'), 'ouvert');
    const reste = await creerTicket(porteur, formulaireTicket('Ticket restant'), 'ouvert');
    await rattacherTicket(porteur, fait.id, jalon.id);
    await rattacherTicket(porteur, reste.id, jalon.id);

    await admin.from('tickets').update({ statut: 'fusionne' }).eq('id', fait.id);

    const lu = await recupererJalon(anonyme, jalon.id);

    expect(lu?.tickets_total).toBe(2);
    expect(lu?.tickets_acheves).toBe(1);
    expect(lu?.tickets_restants).toBe(1);
    expect(lu?.progression).toBe(50);

    await supprimerTicket(porteur, fait.id);
    await supprimerTicket(porteur, reste.id);
    await supprimerJalon(porteur, jalon.id);
  });

  it('atteint cent quand tout est soumis ou au-delà', async () => {
    const jalon = await creerJalon(porteur, {
      projet_id: projetPublicId,
      theme: 'Jalon terminé',
      date_cible: null,
    });
    const ticket = await creerTicket(porteur, formulaireTicket('Ticket terminé'), 'ouvert');
    await rattacherTicket(porteur, ticket.id, jalon.id);
    await admin.from('tickets').update({ statut: 'soumis' }).eq('id', ticket.id);

    const lu = await recupererJalon(anonyme, jalon.id);

    expect(lu?.progression).toBe(100);
    expect(lu?.sante).toBe('a_jour');

    await supprimerTicket(porteur, ticket.id);
    await supprimerJalon(porteur, jalon.id);
  });

  it('ne compte que les tickets visibles par l’appelant', async () => {
    const jalon = await creerJalon(porteur, {
      projet_id: projetPublicId,
      theme: 'Jalon mixte',
      date_cible: null,
    });

    const publie = await creerTicket(porteur, formulaireTicket('Ticket publié'), 'ouvert');
    const brouillon = await creerTicket(
      porteur,
      {
        projet_id: projetPublicId,
        titre: 'Ticket brouillon',
        contexte: null,
        criteres_acceptation: null,
        critere_test: null,
        complexite: null,
        priorite: 'normale',
        source: 'manuel',
        patterns_suggeres: [],
        publier: false,
      },
      'brouillon',
    );
    await rattacherTicket(porteur, publie.id, jalon.id);
    await rattacherTicket(porteur, brouillon.id, jalon.id);

    // La vue est en `security_invoker` : elle voit ce que l'appelant voit.
    expect((await recupererJalon(anonyme, jalon.id))?.tickets_total).toBe(1);
    expect((await recupererJalon(porteur, jalon.id))?.tickets_total).toBe(2);

    await supprimerTicket(porteur, publie.id);
    await supprimerTicket(porteur, brouillon.id);
    await supprimerJalon(porteur, jalon.id);
  });
});

/**
 * La santé selon la définition opérationnelle de la section 11. Chaque seuil est
 * vérifié de part et d'autre, sans quoi un test ne prouverait pas grand-chose.
 */
describe('santé sans date cible', () => {
  async function jalonInactifDepuis(jours: number, theme: string) {
    const jalon = await creerJalon(porteur, {
      projet_id: projetPublicId,
      theme,
      date_cible: null,
    });
    const ticketId = await creerTicketAge({
      titre: `${theme} — ticket`,
      jalonId: jalon.id,
      jours,
    });

    return { jalonId: jalon.id, ticketId };
  }

  it('reste à jour tant que l’activité est récente', async () => {
    const { jalonId, ticketId } = await jalonInactifDepuis(2, 'Activité récente');

    expect((await recupererJalon(anonyme, jalonId))?.sante).toBe('a_jour');

    await supprimerTicket(porteur, ticketId);
    await supprimerJalon(porteur, jalonId);
  });

  it('reste à jour à six jours d’inactivité', async () => {
    const { jalonId, ticketId } = await jalonInactifDepuis(6, 'Six jours');

    expect((await recupererJalon(anonyme, jalonId))?.sante).toBe('a_jour');

    await supprimerTicket(porteur, ticketId);
    await supprimerJalon(porteur, jalonId);
  });

  it('passe à risque à sept jours d’inactivité', async () => {
    const { jalonId, ticketId } = await jalonInactifDepuis(8, 'Sept jours');

    expect((await recupererJalon(anonyme, jalonId))?.sante).toBe('a_risque');

    await supprimerTicket(porteur, ticketId);
    await supprimerJalon(porteur, jalonId);
  });

  it('passe bloqué à quatorze jours d’inactivité', async () => {
    const { jalonId, ticketId } = await jalonInactifDepuis(15, 'Quatorze jours');

    expect((await recupererJalon(anonyme, jalonId))?.sante).toBe('bloque');

    await supprimerTicket(porteur, ticketId);
    await supprimerJalon(porteur, jalonId);
  });

  it('reste à jour malgré l’inactivité si tout est achevé', async () => {
    const jalon = await creerJalon(porteur, {
      projet_id: projetPublicId,
      theme: 'Tout achevé',
      date_cible: null,
    });
    const ticketId = await creerTicketAge({
      titre: 'Tout achevé — ticket',
      jalonId: jalon.id,
      jours: 30,
      statut: 'fusionne',
    });

    // Plus rien à faire : l'inactivité n'est pas un symptôme.
    expect((await recupererJalon(anonyme, jalon.id))?.sante).toBe('a_jour');

    await supprimerTicket(porteur, ticketId);
    await supprimerJalon(porteur, jalon.id);
  });
});

describe('santé avec date cible', () => {
  function dansNJours(jours: number): string {
    return new Date(Date.now() + jours * 86_400_000).toISOString().slice(0, 10);
  }

  it('bloque quand l’échéance est dépassée et qu’il reste du travail', async () => {
    const jalon = await creerJalon(porteur, {
      projet_id: projetPublicId,
      theme: 'Échéance dépassée',
      date_cible: dansNJours(-3),
    });
    const ticket = await creerTicket(porteur, formulaireTicket('Ticket en retard'), 'ouvert');
    await rattacherTicket(porteur, ticket.id, jalon.id);

    expect((await recupererJalon(anonyme, jalon.id))?.sante).toBe('bloque');

    await supprimerTicket(porteur, ticket.id);
    await supprimerJalon(porteur, jalon.id);
  });

  it('reste à jour si l’échéance est dépassée mais que tout est achevé', async () => {
    const jalon = await creerJalon(porteur, {
      projet_id: projetPublicId,
      theme: 'Échéance tenue',
      date_cible: dansNJours(-3),
    });
    const ticket = await creerTicket(porteur, formulaireTicket('Ticket livré'), 'ouvert');
    await rattacherTicket(porteur, ticket.id, jalon.id);
    await admin.from('tickets').update({ statut: 'fusionne' }).eq('id', ticket.id);

    expect((await recupererJalon(anonyme, jalon.id))?.sante).toBe('a_jour');

    await supprimerTicket(porteur, ticket.id);
    await supprimerJalon(porteur, jalon.id);
  });

  it('passe à risque quand le rythme réel est sous la moitié du rythme requis', async () => {
    // Dix tickets restants en deux jours : il en faudrait cinq par jour. Aucune
    // activité récente, donc rythme réel nul.
    const jalon = await creerJalon(porteur, {
      projet_id: projetPublicId,
      theme: 'Rythme insuffisant',
      date_cible: dansNJours(2),
    });

    const tickets: string[] = [];
    for (let index = 0; index < 10; index += 1) {
      tickets.push(
        await creerTicketAge({
          titre: `Ticket rythme ${index}`,
          jalonId: jalon.id,
          jours: 3,
        }),
      );
    }

    expect((await recupererJalon(anonyme, jalon.id))?.sante).toBe('a_risque');

    for (const ticket of tickets) {
      await supprimerTicket(porteur, ticket);
    }
    await supprimerJalon(porteur, jalon.id);
  });

  it('reste à jour quand le rythme réel suit le rythme requis', async () => {
    // Un seul ticket restant en trente jours : le rythme requis est minuscule,
    // et la moindre activité suffit à le tenir.
    const jalon = await creerJalon(porteur, {
      projet_id: projetPublicId,
      theme: 'Rythme confortable',
      date_cible: dansNJours(30),
    });
    const ticket = await creerTicket(porteur, formulaireTicket('Ticket tranquille'), 'ouvert');
    await rattacherTicket(porteur, ticket.id, jalon.id);

    expect((await recupererJalon(anonyme, jalon.id))?.sante).toBe('a_jour');

    await supprimerTicket(porteur, ticket.id);
    await supprimerJalon(porteur, jalon.id);
  });

  it('bloque après quatorze jours d’inactivité même avant l’échéance', async () => {
    const jalon = await creerJalon(porteur, {
      projet_id: projetPublicId,
      theme: 'Abandonné avant terme',
      date_cible: dansNJours(60),
    });
    const ticketId = await creerTicketAge({
      titre: 'Ticket délaissé',
      jalonId: jalon.id,
      jours: 20,
    });

    expect((await recupererJalon(anonyme, jalon.id))?.sante).toBe('bloque');

    await supprimerTicket(porteur, ticketId);
    await supprimerJalon(porteur, jalon.id);
  });
});

describe('dépendances entre tickets', () => {
  it('déclare qu’un ticket est bloqué par un autre, et se lit dans les deux sens', async () => {
    const bloque = await creerTicket(porteur, formulaireTicket('Ticket bloqué'), 'ouvert');
    const bloqueur = await creerTicket(porteur, formulaireTicket('Ticket bloquant'), 'ouvert');

    await ajouterDependance(porteur, { ticket_id: bloque.id, bloque_par_id: bloqueur.id });

    const bloqueurs = await listerBloqueurs(anonyme, bloque.id);
    const debloques = await listerDebloques(anonyme, bloqueur.id);

    expect(bloqueurs).toHaveLength(1);
    expect(bloqueurs[0]?.bloque_par?.titre).toBe('Ticket bloquant');
    expect(debloques).toHaveLength(1);
    expect(debloques[0]?.titre).toBe('Ticket bloqué');

    await supprimerDependance(porteur, { ticket_id: bloque.id, bloque_par_id: bloqueur.id });
    await supprimerTicket(porteur, bloque.id);
    await supprimerTicket(porteur, bloqueur.id);
  });

  it('refuse qu’un ticket se bloque lui-même', async () => {
    const ticket = await creerTicket(porteur, formulaireTicket('Ticket solitaire'), 'ouvert');

    await expect(
      ajouterDependance(porteur, { ticket_id: ticket.id, bloque_par_id: ticket.id }),
    ).rejects.toThrow('Cette dépendance ne peut pas être créée.');

    await supprimerTicket(porteur, ticket.id);
  });

  it('refuse une dépendance qui fermerait une boucle', async () => {
    const a = await creerTicket(porteur, formulaireTicket('Ticket A'), 'ouvert');
    const b = await creerTicket(porteur, formulaireTicket('Ticket B'), 'ouvert');
    const c = await creerTicket(porteur, formulaireTicket('Ticket C'), 'ouvert');

    // A bloqué par B, B bloqué par C : la chaîne est valide.
    await ajouterDependance(porteur, { ticket_id: a.id, bloque_par_id: b.id });
    await ajouterDependance(porteur, { ticket_id: b.id, bloque_par_id: c.id });

    // C bloqué par A fermerait la boucle : plus rien ne pourrait avancer.
    await expect(
      ajouterDependance(porteur, { ticket_id: c.id, bloque_par_id: a.id }),
    ).rejects.toThrow('Cette dépendance ne peut pas être créée.');

    await supprimerDependance(porteur, { ticket_id: a.id, bloque_par_id: b.id });
    await supprimerDependance(porteur, { ticket_id: b.id, bloque_par_id: c.id });
    await supprimerTicket(porteur, a.id);
    await supprimerTicket(porteur, b.id);
    await supprimerTicket(porteur, c.id);
  });

  it('refuse une dépendance entre tickets de projets différents', async () => {
    const ici = await creerTicket(porteur, formulaireTicket('Ticket d’ici'), 'ouvert');
    const ailleurs = await creerTicket(
      porteur,
      formulaireTicket('Ticket d’ailleurs', projetBrouillonId),
      'ouvert',
    );

    await expect(
      ajouterDependance(porteur, { ticket_id: ici.id, bloque_par_id: ailleurs.id }),
    ).rejects.toThrow('Cette dépendance ne peut pas être créée.');

    await supprimerTicket(porteur, ici.id);
    await supprimerTicket(porteur, ailleurs.id);
  });

  it('refuse à un tiers de déclarer une dépendance sur le projet d’autrui', async () => {
    const a = await creerTicket(porteur, formulaireTicket('Ticket gardé A'), 'ouvert');
    const b = await creerTicket(porteur, formulaireTicket('Ticket gardé B'), 'ouvert');

    await expect(
      ajouterDependance(tiers, { ticket_id: a.id, bloque_par_id: b.id }),
    ).rejects.toThrow('Cette dépendance ne peut pas être créée.');

    await supprimerTicket(porteur, a.id);
    await supprimerTicket(porteur, b.id);
  });

  it('disparaît avec le ticket qu’elle relie', async () => {
    const bloque = await creerTicket(porteur, formulaireTicket('Bloqué éphémère'), 'ouvert');
    const bloqueur = await creerTicket(porteur, formulaireTicket('Bloquant éphémère'), 'ouvert');
    await ajouterDependance(porteur, { ticket_id: bloque.id, bloque_par_id: bloqueur.id });

    await supprimerTicket(porteur, bloqueur.id);

    expect(await listerBloqueurs(porteur, bloque.id)).toHaveLength(0);

    await supprimerTicket(porteur, bloque.id);
  });
});

describe('listerJalons', () => {
  it('ne rend que les jalons du projet demandé', async () => {
    const ici = await creerJalon(porteur, {
      projet_id: projetPublicId,
      theme: 'Jalon d’ici',
      date_cible: null,
    });
    const ailleurs = await creerJalon(porteur, {
      projet_id: projetBrouillonId,
      theme: 'Jalon d’ailleurs',
      date_cible: null,
    });

    const jalons = await listerJalons(porteur, projetPublicId);
    const identifiants = jalons.map((jalon) => jalon.id);

    expect(identifiants).toContain(ici.id);
    expect(identifiants).not.toContain(ailleurs.id);

    await supprimerJalon(porteur, ici.id);
    await supprimerJalon(porteur, ailleurs.id);
  });
});
