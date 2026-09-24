import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../lib/supabase/database.types';
import {
  creerJeton,
  listerJetons,
  revoquerJeton,
  trouverJetonParEmpreinte,
} from '../../features/api-tokens/repository/api-tokens-repository';
import {
  empreinteDe,
  engendrerJeton,
  jetonBienForme,
  jetonPorteur,
  memeEmpreinte,
  PREFIXE_JETON,
} from '../../features/api-tokens/jeton';
import {
  creerClientAdmin,
  creerClientAnonyme,
  creerClientConnecte,
  creerUtilisateurDeTest,
  supprimerUtilisateurDeTest,
} from '../helpers/supabase';

/**
 * SV-014 — jetons personnels : fabrication, visibilité, révocation.
 *
 * Le fichier voisin vérifie l'échange contre une session. Celui-ci vérifie ce
 * qui le précède : qu'un jeton appartient à quelqu'un, que personne d'autre ne
 * le voit ni ne le touche, et que les seuls chemins d'écriture sont les deux
 * fonctions prévues.
 */

let admin: SupabaseClient<Database>;
let anonyme: SupabaseClient<Database>;
let porteuse: SupabaseClient<Database>;
let tiers: SupabaseClient<Database>;
let porteuseId: string;
let tiersId: string;

beforeAll(async () => {
  admin = creerClientAdmin();
  anonyme = creerClientAnonyme();
  porteuseId = await creerUtilisateurDeTest(admin, 'Porteuse de jetons');
  tiersId = await creerUtilisateurDeTest(admin, 'Tiers curieux');
  porteuse = await creerClientConnecte(porteuseId);
  tiers = await creerClientConnecte(tiersId);
});

afterAll(async () => {
  await supprimerUtilisateurDeTest(admin, porteuseId);
  await supprimerUtilisateurDeTest(admin, tiersId);
});

describe('fabrication du secret', () => {
  it('porte le préfixe qui le rend repérable', () => {
    expect(engendrerJeton().startsWith(PREFIXE_JETON)).toBe(true);
  });

  it('ne produit jamais deux fois le même jeton', () => {
    const tirages = new Set(Array.from({ length: 500 }, () => engendrerJeton()));

    expect(tirages.size).toBe(500);
  });

  it('rend une empreinte stable, en hexadécimal minuscule sur 64 caractères', () => {
    const jeton = engendrerJeton();

    expect(empreinteDe(jeton)).toBe(empreinteDe(jeton));
    expect(empreinteDe(jeton)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('donne des empreintes différentes à deux jetons voisins', () => {
    expect(empreinteDe('svb_a')).not.toBe(empreinteDe('svb_b'));
  });

  it('reconnaît un jeton bien formé et rejette ce qui n’en est pas un', () => {
    expect(jetonBienForme(engendrerJeton())).toBe(true);
    expect(jetonBienForme('svb_trop-court')).toBe(false);
    expect(jetonBienForme(engendrerJeton().slice(4))).toBe(false);
    expect(jetonBienForme('')).toBe(false);
  });

  it('compare deux empreintes sans se laisser piéger par la longueur', () => {
    const empreinte = empreinteDe('svb_exemple');

    expect(memeEmpreinte(empreinte, empreinte)).toBe(true);
    expect(memeEmpreinte(empreinte, empreinte.slice(0, 32))).toBe(false);
  });
});

describe('lecture de l’en-tête Authorization', () => {
  it('extrait un jeton porteur bien formé', () => {
    const jeton = engendrerJeton();

    expect(jetonPorteur(`Bearer ${jeton}`)).toBe(jeton);
    expect(jetonPorteur(`bearer ${jeton}`)).toBe(jeton);
  });

  it('refuse un en-tête absent, d’un autre schéma, ou bavard', () => {
    const jeton = engendrerJeton();

    expect(jetonPorteur(null)).toBeNull();
    expect(jetonPorteur(`Basic ${jeton}`)).toBeNull();
    expect(jetonPorteur('Bearer')).toBeNull();
    expect(jetonPorteur(`Bearer ${jeton} de trop`)).toBeNull();
  });
});

describe('création', () => {
  it('rattache le jeton à la session et non à ce que l’appelant prétend', async () => {
    const jeton = await creerJeton(porteuse, 'Poste de travail', empreinteDe(engendrerJeton()));

    const { data } = await admin
      .from('api_tokens')
      .select('utilisateur_id')
      .eq('id', jeton.id)
      .single();

    expect(data?.utilisateur_id).toBe(porteuseId);
  });

  it('ne rend jamais l’empreinte à l’appelant', async () => {
    const jeton = await creerJeton(porteuse, 'Sans empreinte', empreinteDe(engendrerJeton()));

    expect(jeton).not.toHaveProperty('empreinte');
  });

  it('refuse un libellé vide', async () => {
    await expect(creerJeton(porteuse, '   ', empreinteDe(engendrerJeton()))).rejects.toThrow();
  });

  it('refuse une empreinte qui n’en est pas une', async () => {
    await expect(creerJeton(porteuse, 'Mal formée', 'pas-une-empreinte')).rejects.toThrow();
  });

  it('refuse un visiteur anonyme', async () => {
    await expect(creerJeton(anonyme, 'Anonyme', empreinteDe(engendrerJeton()))).rejects.toThrow();
  });
});

describe('visibilité', () => {
  it('montre à chacun ses jetons, et à personne ceux d’autrui', async () => {
    const sien = await creerJeton(porteuse, 'À la porteuse', empreinteDe(engendrerJeton()));
    const autre = await creerJeton(tiers, 'Au tiers', empreinteDe(engendrerJeton()));

    const vusParLaPorteuse = await listerJetons(porteuse);
    const vusParLeTiers = await listerJetons(tiers);

    // Le tiers voit bien quelque chose — son propre jeton : sa liste n'est pas
    // amputée par un défaut d'accès, elle l'est par la politique.
    expect(vusParLeTiers.map((jeton) => jeton.id)).toContain(autre.id);
    expect(vusParLaPorteuse.map((jeton) => jeton.id)).toContain(sien.id);
    expect(vusParLeTiers.map((jeton) => jeton.id)).not.toContain(sien.id);
  });

  it('ne montre rien à un visiteur anonyme', async () => {
    expect(await listerJetons(anonyme)).toEqual([]);
  });
});

describe('écriture directe', () => {
  it('refuse une insertion qui contournerait la fonction', async () => {
    const { error } = await porteuse
      .from('api_tokens')
      .insert({ utilisateur_id: porteuseId, libelle: 'Forgé', empreinte: empreinteDe('x') });

    expect(error).not.toBeNull();
  });

  it('refuse de modifier un jeton à la main', async () => {
    const jeton = await creerJeton(porteuse, 'Intouchable', empreinteDe(engendrerJeton()));

    const { data, error } = await porteuse
      .from('api_tokens')
      .update({ libelle: 'Renommé' })
      .eq('id', jeton.id)
      .select('id');

    // L'absence de politique UPDATE ne produit pas d'erreur : elle rend la
    // ligne invisible à la mise à jour. C'est le nombre de lignes touchées qui
    // fait foi.
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('refuse de supprimer un jeton', async () => {
    const jeton = await creerJeton(porteuse, 'Indestructible', empreinteDe(engendrerJeton()));

    await porteuse.from('api_tokens').delete().eq('id', jeton.id);

    const { data } = await admin.from('api_tokens').select('id').eq('id', jeton.id).maybeSingle();

    expect(data?.id).toBe(jeton.id);
  });
});

describe('révocation', () => {
  it('ferme le jeton et horodate la fermeture', async () => {
    const jeton = await creerJeton(porteuse, 'À révoquer', empreinteDe(engendrerJeton()));
    const revoque = await revoquerJeton(porteuse, jeton.id);

    expect(revoque.revoque_le).not.toBeNull();
  });

  it('refuse une seconde révocation, pour ne pas repousser la date', async () => {
    const jeton = await creerJeton(porteuse, 'Une seule fois', empreinteDe(engendrerJeton()));
    const premiere = await revoquerJeton(porteuse, jeton.id);

    await expect(revoquerJeton(porteuse, jeton.id)).rejects.toThrow();

    const { data } = await admin
      .from('api_tokens')
      .select('revoque_le')
      .eq('id', jeton.id)
      .single();

    expect(data?.revoque_le).toBe(premiere.revoque_le);
  });

  it('refuse de révoquer le jeton d’autrui', async () => {
    const jeton = await creerJeton(porteuse, 'Pas à vous', empreinteDe(engendrerJeton()));

    await expect(revoquerJeton(tiers, jeton.id)).rejects.toThrow();

    const { data } = await admin
      .from('api_tokens')
      .select('revoque_le')
      .eq('id', jeton.id)
      .single();

    expect(data?.revoque_le).toBeNull();
  });
});

describe('plafond de jetons actifs', () => {
  it('refuse le onzième jeton actif, puis l’accepte après une révocation', async () => {
    const compte = await creerUtilisateurDeTest(admin, 'Collectionneur');
    const client = await creerClientConnecte(compte);

    const crees = [];
    for (let rang = 0; rang < 10; rang += 1) {
      crees.push(await creerJeton(client, `Jeton ${rang}`, empreinteDe(engendrerJeton())));
    }

    await expect(creerJeton(client, 'Le onzième', empreinteDe(engendrerJeton()))).rejects.toThrow();

    await revoquerJeton(client, crees[0]!.id);

    // Un jeton révoqué ne compte plus : la limite porte sur ce qui est ouvert,
    // pas sur l'historique.
    await expect(
      creerJeton(client, 'Le onzième, après place faite', empreinteDe(engendrerJeton())),
    ).resolves.toBeDefined();

    await supprimerUtilisateurDeTest(admin, compte);
  });
});

describe('recherche par empreinte', () => {
  it('retrouve un jeton et le nom de son porteur', async () => {
    const secret = engendrerJeton();
    const jeton = await creerJeton(porteuse, 'Reconnu', empreinteDe(secret));

    const reconnu = await trouverJetonParEmpreinte(admin, empreinteDe(secret));

    expect(reconnu).toMatchObject({
      id: jeton.id,
      utilisateur_id: porteuseId,
      revoque_le: null,
      porteur_nom: 'Porteuse de jetons',
    });
  });

  it('rend un jeton révoqué plutôt que rien, pour que le refus soit explicite', async () => {
    const secret = engendrerJeton();
    const jeton = await creerJeton(porteuse, 'Révoqué mais connu', empreinteDe(secret));
    await revoquerJeton(porteuse, jeton.id);

    const reconnu = await trouverJetonParEmpreinte(admin, empreinteDe(secret));

    expect(reconnu?.revoque_le).not.toBeNull();
  });

  it('ne retrouve rien pour un jeton jamais émis', async () => {
    expect(await trouverJetonParEmpreinte(admin, empreinteDe(engendrerJeton()))).toBeNull();
  });
});
