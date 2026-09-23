import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../lib/supabase/database.types';
import {
  creerProjet,
  listerProjets,
  mettreAJourProjet,
  recupererProjet,
  supprimerProjet,
} from '../../features/projects/repository/projects-repository';
import {
  creerClientAdmin,
  creerClientAnonyme,
  creerClientConnecte,
  creerUtilisateurDeTest,
  supprimerUtilisateurDeTest,
} from '../helpers/supabase';

/**
 * SV-003 — tests d'intégration de la couche repository des projets, contre
 * l'instance Supabase locale (section 21 du cahier des charges).
 *
 * Le repository reçoit son client Supabase en paramètre : les mêmes fonctions
 * sont donc exercées tour à tour avec les droits d'un visiteur anonyme, ceux du
 * porteur et ceux d'un tiers connecté. Ce sont les politiques RLS elles-mêmes
 * qui sont mises à l'épreuve, pas seulement les requêtes.
 */

let admin: SupabaseClient<Database>;
let anonyme: SupabaseClient<Database>;

let porteurId: string;
let porteur: SupabaseClient<Database>;
let tiersId: string;
let tiers: SupabaseClient<Database>;

let projetActifId: string;
let projetBrouillonId: string;

beforeAll(async () => {
  admin = creerClientAdmin();
  anonyme = creerClientAnonyme();

  porteurId = await creerUtilisateurDeTest(admin, 'Porteuse SV-003');
  tiersId = await creerUtilisateurDeTest(admin, 'Tiers curieux');

  porteur = await creerClientConnecte(porteurId);
  tiers = await creerClientConnecte(tiersId);

  const actif = await creerProjet(porteur, porteurId, {
    nom: 'Projet actif SV-003',
    repo_url: 'https://github.com/ghalilahlou/shemaVaib',
    statut: 'actif',
  });
  projetActifId = actif.id;

  const brouillon = await creerProjet(porteur, porteurId, {
    nom: 'Projet brouillon SV-003',
    repo_url: null,
    statut: 'brouillon',
  });
  projetBrouillonId = brouillon.id;
});

afterAll(async () => {
  await supprimerUtilisateurDeTest(admin, porteurId);
  await supprimerUtilisateurDeTest(admin, tiersId);
});

describe('creerProjet', () => {
  it('crée un projet et rend la ligne complète', async () => {
    const projet = await creerProjet(porteur, porteurId, {
      nom: 'Projet créé à la volée',
      repo_url: null,
      statut: 'actif',
    });

    expect(projet.nom).toBe('Projet créé à la volée');
    expect(projet.proprietaire_id).toBe(porteurId);
    expect(projet.statut).toBe('actif');

    await supprimerProjet(porteur, projet.id);
  });

  it('refuse de créer un projet au nom de quelqu’un d’autre', async () => {
    await expect(
      creerProjet(tiers, porteurId, { nom: 'Projet usurpé', repo_url: null, statut: 'actif' }),
    ).rejects.toThrow('Impossible de créer le projet.');
  });

  it('refuse la création à un visiteur anonyme', async () => {
    await expect(
      creerProjet(anonyme, porteurId, { nom: 'Projet anonyme', repo_url: null, statut: 'actif' }),
    ).rejects.toThrow('Impossible de créer le projet.');
  });
});

describe('listerProjets', () => {
  it('expose les projets actifs à un visiteur anonyme', async () => {
    const projets = await listerProjets(anonyme);
    const identifiants = projets.map((projet) => projet.id);

    expect(identifiants).toContain(projetActifId);
  });

  it('cache les brouillons à un visiteur anonyme', async () => {
    const projets = await listerProjets(anonyme);
    const identifiants = projets.map((projet) => projet.id);

    expect(identifiants).not.toContain(projetBrouillonId);
  });

  it('cache les brouillons d’autrui à un tiers connecté', async () => {
    const projets = await listerProjets(tiers);
    const identifiants = projets.map((projet) => projet.id);

    expect(identifiants).toContain(projetActifId);
    expect(identifiants).not.toContain(projetBrouillonId);
  });

  it('montre au porteur ses propres brouillons', async () => {
    const projets = await listerProjets(porteur);
    const identifiants = projets.map((projet) => projet.id);

    expect(identifiants).toContain(projetActifId);
    expect(identifiants).toContain(projetBrouillonId);
  });

  it('joint le nom public du porteur', async () => {
    const projets = await listerProjets(anonyme, { statut: 'actif' });
    const projet = projets.find((candidat) => candidat.id === projetActifId);

    expect(projet?.proprietaire?.nom).toBe('Porteuse SV-003');
  });

  it('filtre par statut', async () => {
    const projets = await listerProjets(porteur, { statut: 'brouillon' });

    expect(projets.every((projet) => projet.statut === 'brouillon')).toBe(true);
    expect(projets.map((projet) => projet.id)).toContain(projetBrouillonId);
  });

  it('trie du plus récent au plus ancien', async () => {
    const projets = await listerProjets(porteur);
    const dates = projets.map((projet) => new Date(projet.cree_le).getTime());
    const triees = [...dates].sort((a, b) => b - a);

    expect(dates).toEqual(triees);
  });
});

describe('recupererProjet', () => {
  it('rend un projet actif à un visiteur anonyme', async () => {
    const projet = await recupererProjet(anonyme, projetActifId);

    expect(projet?.nom).toBe('Projet actif SV-003');
    expect(projet?.repo_url).toBe('https://github.com/ghalilahlou/shemaVaib');
  });

  it('rend null sur un brouillon d’autrui, sans révéler son existence', async () => {
    expect(await recupererProjet(anonyme, projetBrouillonId)).toBeNull();
    expect(await recupererProjet(tiers, projetBrouillonId)).toBeNull();
  });

  it('rend son propre brouillon au porteur', async () => {
    const projet = await recupererProjet(porteur, projetBrouillonId);

    expect(projet?.nom).toBe('Projet brouillon SV-003');
  });

  it('rend null sur un identifiant inconnu', async () => {
    expect(await recupererProjet(porteur, crypto.randomUUID())).toBeNull();
  });
});

describe('mettreAJourProjet', () => {
  it('laisse le porteur renommer son projet', async () => {
    const projet = await creerProjet(porteur, porteurId, {
      nom: 'Nom initial',
      repo_url: null,
      statut: 'actif',
    });

    const modifie = await mettreAJourProjet(porteur, projet.id, { nom: 'Nom corrigé' });

    expect(modifie?.nom).toBe('Nom corrigé');

    await supprimerProjet(porteur, projet.id);
  });

  it('ne modifie rien quand un tiers essaie', async () => {
    const modifie = await mettreAJourProjet(tiers, projetActifId, { nom: 'Détourné' });

    expect(modifie).toBeNull();

    const inchange = await recupererProjet(anonyme, projetActifId);
    expect(inchange?.nom).toBe('Projet actif SV-003');
  });

  it('laisse le porteur publier son brouillon', async () => {
    const projet = await creerProjet(porteur, porteurId, {
      nom: 'Brouillon à publier',
      repo_url: null,
      statut: 'brouillon',
    });

    expect(await recupererProjet(anonyme, projet.id)).toBeNull();

    await mettreAJourProjet(porteur, projet.id, { statut: 'actif' });

    expect(await recupererProjet(anonyme, projet.id)).not.toBeNull();

    await supprimerProjet(porteur, projet.id);
  });
});

describe('supprimerProjet', () => {
  it('laisse le porteur supprimer son projet', async () => {
    const projet = await creerProjet(porteur, porteurId, {
      nom: 'Projet éphémère',
      repo_url: null,
      statut: 'actif',
    });

    await supprimerProjet(porteur, projet.id);

    expect(await recupererProjet(porteur, projet.id)).toBeNull();
  });

  it('ne supprime rien quand un tiers essaie', async () => {
    await supprimerProjet(tiers, projetActifId);

    expect(await recupererProjet(anonyme, projetActifId)).not.toBeNull();
  });
});
