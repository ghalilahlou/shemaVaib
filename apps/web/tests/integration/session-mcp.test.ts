import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { refusSessionMcpSchema, sessionMcpSchema } from '@schemavibe/shared-types';
import type { Database } from '../../lib/supabase/database.types';
import { POST } from '../../app/api/mcp/session/route';
import { empreinteDe, engendrerJeton } from '../../features/api-tokens/jeton';
import {
  creerJeton,
  revoquerJeton,
} from '../../features/api-tokens/repository/api-tokens-repository';
import { creerProjet } from '../../features/projects/repository/projects-repository';
import {
  creerClientAdmin,
  creerClientConnecte,
  creerUtilisateurDeTest,
  supprimerUtilisateurDeTest,
} from '../helpers/supabase';

/**
 * SV-014 — échange d'un jeton personnel contre une session.
 *
 * C'est ici que se joue le critère du ticket. Deux affirmations à tenir, et la
 * seconde n'a de valeur que si la première a d'abord réussi : la session ouverte
 * par un jeton voit exactement ce que voit son émetteur — ni plus, ni moins — et
 * le même jeton, une fois révoqué, n'en ouvre plus aucune.
 */

const ADRESSE = 'http://127.0.0.1:3000/api/mcp/session';

let admin: SupabaseClient<Database>;
let porteuseId: string;
let tiersId: string;
let projetDeLaPorteuse: string;
let projetDuTiers: string;

/** Appelle la route comme le ferait le serveur MCP. */
async function echanger(enTete: string | null): Promise<Response> {
  return POST(
    new Request(ADRESSE, {
      method: 'POST',
      headers: enTete ? { authorization: enTete } : {},
    }),
  );
}

/** Émet un jeton pour un compte et rend le secret ainsi que son identifiant. */
async function emettreJeton(
  utilisateurId: string,
  libelle: string,
): Promise<{ secret: string; id: string }> {
  const client = await creerClientConnecte(utilisateurId);
  const secret = engendrerJeton();
  const jeton = await creerJeton(client, libelle, empreinteDe(secret));

  return { secret, id: jeton.id };
}

/** Client Supabase portant le jeton d'accès rendu par l'échange. */
function clientDeSession(corps: unknown): SupabaseClient<Database> {
  const session = sessionMcpSchema.parse(corps);

  return createClient<Database>(session.supabase.url, session.supabase.cle_publique, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${session.access_token}` } },
  });
}

beforeAll(async () => {
  admin = creerClientAdmin();
  porteuseId = await creerUtilisateurDeTest(admin, 'Porteuse MCP');
  tiersId = await creerUtilisateurDeTest(admin, 'Tiers MCP');

  // Deux brouillons : invisibles de tous sauf de leur porteur. C'est le repère
  // qui permet de dire si une session est bien cantonnée à une identité.
  const porteuse = await creerClientConnecte(porteuseId);
  const tiers = await creerClientConnecte(tiersId);

  projetDeLaPorteuse = (
    await creerProjet(porteuse, porteuseId, {
      nom: 'Brouillon de la porteuse',
      repo_url: null,
      statut: 'brouillon',
    })
  ).id;
  projetDuTiers = (
    await creerProjet(tiers, tiersId, {
      nom: 'Brouillon du tiers',
      repo_url: null,
      statut: 'brouillon',
    })
  ).id;
});

/**
 * Les jetons émis sont effacés entre deux cas.
 *
 * Non par hygiène, mais parce que le plafond de dix jetons actifs est réel : un
 * fichier qui en émet une vingtaine finirait par se heurter à une protection
 * qu'il n'était pas venu éprouver. La suppression est faite avec la clé de
 * service, chemin qu'aucun code applicatif n'emprunte — c'est du nettoyage, pas
 * une opération dont on vérifie le comportement.
 */
afterEach(async () => {
  await admin.from('api_tokens').delete().in('utilisateur_id', [porteuseId, tiersId]);
});

afterAll(async () => {
  await supprimerUtilisateurDeTest(admin, porteuseId);
  await supprimerUtilisateurDeTest(admin, tiersId);
});

describe('refus', () => {
  it('refuse une requête sans en-tête Authorization', async () => {
    const reponse = await echanger(null);

    expect(reponse.status).toBe(401);
    expect(refusSessionMcpSchema.parse(await reponse.json()).erreur).toBe('jeton_absent');
  });

  it('refuse un en-tête d’un autre schéma', async () => {
    const reponse = await echanger(`Basic ${engendrerJeton()}`);

    expect(refusSessionMcpSchema.parse(await reponse.json()).erreur).toBe('jeton_absent');
  });

  it('refuse un jeton bien formé mais jamais émis', async () => {
    const reponse = await echanger(`Bearer ${engendrerJeton()}`);

    expect(reponse.status).toBe(401);
    expect(refusSessionMcpSchema.parse(await reponse.json()).erreur).toBe('jeton_inconnu');
  });
});

describe('session ouverte', () => {
  it('rend une réponse conforme au contrat partagé', async () => {
    const { secret } = await emettreJeton(porteuseId, 'Contrat');
    const reponse = await echanger(`Bearer ${secret}`);

    expect(reponse.status).toBe(200);
    expect(sessionMcpSchema.safeParse(await reponse.json()).success).toBe(true);
  });

  it('ne met pas le jeton d’accès en cache', async () => {
    const { secret } = await emettreJeton(porteuseId, 'Sans cache');
    const reponse = await echanger(`Bearer ${secret}`);

    expect(reponse.headers.get('cache-control')).toBe('no-store');
  });

  it('ne rend aucun jeton de rafraîchissement', async () => {
    const { secret } = await emettreJeton(porteuseId, 'Sans rafraîchissement');
    const corps = (await (await echanger(`Bearer ${secret}`)).json()) as Record<string, unknown>;

    // Un jeton de rafraîchissement transformerait la révocation en formalité :
    // le serveur MCP resterait connecté indéfiniment.
    expect(corps).not.toHaveProperty('refresh_token');
    expect(JSON.stringify(corps)).not.toContain('refresh');
  });

  it('nomme l’identité au nom de laquelle le serveur agira', async () => {
    const { secret } = await emettreJeton(porteuseId, 'Identité');
    const session = sessionMcpSchema.parse(await (await echanger(`Bearer ${secret}`)).json());

    expect(session.utilisateur).toEqual({ id: porteuseId, nom: 'Porteuse MCP' });
  });

  it('donne une échéance dans le futur', async () => {
    const { secret } = await emettreJeton(porteuseId, 'Échéance');
    const session = sessionMcpSchema.parse(await (await echanger(`Bearer ${secret}`)).json());

    expect(session.expires_at).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('note que le jeton a servi', async () => {
    const { secret, id } = await emettreJeton(porteuseId, 'Horodaté');

    const { data: avant } = await admin
      .from('api_tokens')
      .select('dernier_usage_le')
      .eq('id', id)
      .single();

    await echanger(`Bearer ${secret}`);

    const { data: apres } = await admin
      .from('api_tokens')
      .select('dernier_usage_le')
      .eq('id', id)
      .single();

    expect(avant?.dernier_usage_le).toBeNull();
    expect(apres?.dernier_usage_le).not.toBeNull();
  });
});

/** Le critère de test nommé par le ticket. */
describe('la session ne voit que ce que voit son émettrice', () => {
  it('donne accès au brouillon de son émettrice et à aucun autre', async () => {
    const { secret } = await emettreJeton(porteuseId, 'Cantonnée');
    const client = clientDeSession(await (await echanger(`Bearer ${secret}`)).json());

    const { data: sien } = await client
      .from('projects')
      .select('id')
      .eq('id', projetDeLaPorteuse)
      .maybeSingle();
    const { data: autre } = await client
      .from('projects')
      .select('id')
      .eq('id', projetDuTiers)
      .maybeSingle();

    expect(sien?.id).toBe(projetDeLaPorteuse);
    expect(autre).toBeNull();
  });

  it('n’emporte aucun privilège d’administration', async () => {
    const { secret } = await emettreJeton(porteuseId, 'Sans privilège');
    const client = clientDeSession(await (await echanger(`Bearer ${secret}`)).json());

    // Le tiers a des jetons ; cette session ne doit en voir aucun.
    await emettreJeton(tiersId, 'Au tiers');

    const { data } = await client.from('api_tokens').select('utilisateur_id');

    expect(data?.every((ligne) => ligne.utilisateur_id === porteuseId)).toBe(true);
  });

  it('écrit sous son identité, et refuse d’écrire sous celle d’un autre', async () => {
    const { secret } = await emettreJeton(porteuseId, 'Signature');
    const client = clientDeSession(await (await echanger(`Bearer ${secret}`)).json());

    // La réussite prouve d'abord que cette session sait écrire : sans elle, le
    // refus qui suit ne vaudrait rien.
    const projet = await creerProjet(client, porteuseId, {
      nom: 'Créé par le serveur MCP',
      repo_url: null,
      statut: 'brouillon',
    });

    const { data } = await admin
      .from('projects')
      .select('proprietaire_id')
      .eq('id', projet.id)
      .single();

    expect(data?.proprietaire_id).toBe(porteuseId);

    await expect(
      creerProjet(client, tiersId, {
        nom: 'Signé d’un autre nom',
        repo_url: null,
        statut: 'brouillon',
      }),
    ).rejects.toThrow();
  });
});

/** La seconde moitié du critère : le refus ne doit pas être un faux négatif. */
describe('révocation', () => {
  it('ferme l’échange, après avoir prouvé qu’il fonctionnait', async () => {
    const { secret, id } = await emettreJeton(porteuseId, 'À révoquer');

    const avant = await echanger(`Bearer ${secret}`);
    expect(avant.status).toBe(200);

    const porteuse = await creerClientConnecte(porteuseId);
    await revoquerJeton(porteuse, id);

    const apres = await echanger(`Bearer ${secret}`);

    expect(apres.status).toBe(401);
    expect(refusSessionMcpSchema.parse(await apres.json()).erreur).toBe('jeton_revoque');
  });

  it('ne ferme que le jeton révoqué', async () => {
    const premier = await emettreJeton(porteuseId, 'Le révoqué');
    const second = await emettreJeton(porteuseId, 'Le survivant');

    const porteuse = await creerClientConnecte(porteuseId);
    await revoquerJeton(porteuse, premier.id);

    expect((await echanger(`Bearer ${premier.secret}`)).status).toBe(401);
    expect((await echanger(`Bearer ${second.secret}`)).status).toBe(200);
  });
});
