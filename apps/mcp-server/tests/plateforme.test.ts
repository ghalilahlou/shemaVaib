import { describe, expect, it } from 'vitest';
import { CHEMIN_SESSION_MCP, type SessionMcp } from '@schemavibe/shared-types';
import {
  ConnexionPlateforme,
  ConnexionRefusee,
  MARGE_RENOUVELLEMENT_SECONDES,
  connexionDepuisEnvironnement,
  echangerJeton,
  VARIABLE_JETON,
  VARIABLE_URL,
} from '../src/lib/plateforme.js';

/**
 * SV-014 — le lien authentifié, vu du serveur MCP.
 *
 * La plateforme est remplacée ici par un `fetch` de substitution : ce qui est
 * vérifié n'est pas qu'elle réponde correctement — le test d'intégration
 * `session-mcp.test.ts` s'en charge contre la vraie route — mais que le serveur
 * MCP se comporte bien face à chaque réponse possible, y compris celles qu'on
 * n'a pas envie de provoquer pour de bon.
 */

const URL_PLATEFORME = 'https://schemavibe.test';
const JETON = 'svb_' + 'a'.repeat(43);

function sessionFactice(expiresAt: number): SessionMcp {
  return {
    access_token: 'jeton-acces-factice',
    expires_at: expiresAt,
    utilisateur: { id: '11111111-2222-4333-8444-555555555555', nom: 'Porteuse' },
    supabase: { url: 'https://base.schemavibe.test', cle_publique: 'cle-publique' },
  };
}

/** `fetch` de substitution qui compte ses appels et rend ce qu'on lui dit. */
function fetchFactice(reponses: (() => Response)[]): {
  appel: typeof globalThis.fetch;
  adresses: string[];
  enTetes: (string | null)[];
} {
  const adresses: string[] = [];
  const enTetes: (string | null)[] = [];

  const appel = ((entree: RequestInfo | URL, init?: RequestInit) => {
    adresses.push(String(entree));
    enTetes.push(new Headers(init?.headers).get('authorization'));

    const suivante = reponses[adresses.length - 1] ?? reponses.at(-1);

    return Promise.resolve(suivante!());
  }) as typeof globalThis.fetch;

  return { appel, adresses, enTetes };
}

function reponseSession(session: SessionMcp): () => Response {
  return () => Response.json(session);
}

function reponseRefus(erreur: string, statut = 401): () => Response {
  return () => Response.json({ erreur, message: 'Refusé.' }, { status: statut });
}

describe('échange d’un jeton', () => {
  it('appelle le chemin partagé, sur l’adresse fournie', async () => {
    const { appel, adresses } = fetchFactice([reponseSession(sessionFactice(2_000_000_000))]);

    await echangerJeton({ url: URL_PLATEFORME, jeton: JETON, fetch: appel });

    expect(adresses[0]).toBe(`${URL_PLATEFORME}${CHEMIN_SESSION_MCP}`);
  });

  it('présente le jeton en porteur', async () => {
    const { appel, enTetes } = fetchFactice([reponseSession(sessionFactice(2_000_000_000))]);

    await echangerJeton({ url: URL_PLATEFORME, jeton: JETON, fetch: appel });

    expect(enTetes[0]).toBe(`Bearer ${JETON}`);
  });

  it('rend la session telle que le contrat la décrit', async () => {
    const attendue = sessionFactice(2_000_000_000);
    const { appel } = fetchFactice([reponseSession(attendue)]);

    expect(await echangerJeton({ url: URL_PLATEFORME, jeton: JETON, fetch: appel })).toEqual(
      attendue,
    );
  });

  it('reprend la raison du refus telle que la plateforme la nomme', async () => {
    const { appel } = fetchFactice([reponseRefus('jeton_revoque')]);

    await expect(
      echangerJeton({ url: URL_PLATEFORME, jeton: JETON, fetch: appel }),
    ).rejects.toMatchObject({ raison: 'jeton_revoque' });
  });

  it('ne se prétend pas connecté sur une réponse hors contrat', async () => {
    // Un 200 dont le corps ne porte pas de jeton d'accès : typiquement une page
    // d'erreur ou un proxy qui s'est interposé.
    const { appel } = fetchFactice([() => Response.json({ bonjour: 'monde' })]);

    await expect(
      echangerJeton({ url: URL_PLATEFORME, jeton: JETON, fetch: appel }),
    ).rejects.toMatchObject({ raison: 'reponse_illisible' });
  });

  it('nomme l’échec quand la réponse d’erreur est elle-même illisible', async () => {
    const { appel } = fetchFactice([() => new Response('<html>502</html>', { status: 502 })]);

    await expect(
      echangerJeton({ url: URL_PLATEFORME, jeton: JETON, fetch: appel }),
    ).rejects.toMatchObject({ raison: 'reponse_illisible' });
  });

  it('distingue une plateforme injoignable d’un jeton refusé', async () => {
    const appel = (() => Promise.reject(new Error('ECONNREFUSED'))) as typeof globalThis.fetch;

    await expect(
      echangerJeton({ url: URL_PLATEFORME, jeton: JETON, fetch: appel }),
    ).rejects.toMatchObject({ raison: 'plateforme_injoignable' });
  });
});

describe('mémoire de la session', () => {
  it('n’échange qu’une fois tant que la session est valide', async () => {
    const { appel, adresses } = fetchFactice([reponseSession(sessionFactice(2_000))]);
    const connexion = new ConnexionPlateforme({
      url: URL_PLATEFORME,
      jeton: JETON,
      fetch: appel,
      maintenant: () => 1_000,
    });

    await connexion.session();
    await connexion.session();
    await connexion.client();

    expect(adresses).toHaveLength(1);
  });

  it('renouvelle avant l’échéance plutôt qu’après', async () => {
    let horloge = 1_000;
    const { appel, adresses } = fetchFactice([
      reponseSession(sessionFactice(1_000 + MARGE_RENOUVELLEMENT_SECONDES + 10)),
      reponseSession(sessionFactice(9_000)),
    ]);
    const connexion = new ConnexionPlateforme({
      url: URL_PLATEFORME,
      jeton: JETON,
      fetch: appel,
      maintenant: () => horloge,
    });

    await connexion.session();

    // Encore valide, mais dans la marge : la session doit déjà être refaite.
    horloge = 1_000 + 11;
    await connexion.session();

    expect(adresses).toHaveLength(2);
  });

  it('ne déclenche qu’un échange pour deux appels simultanés', async () => {
    const { appel, adresses } = fetchFactice([reponseSession(sessionFactice(2_000))]);
    const connexion = new ConnexionPlateforme({
      url: URL_PLATEFORME,
      jeton: JETON,
      fetch: appel,
      maintenant: () => 1_000,
    });

    await Promise.all([connexion.session(), connexion.session(), connexion.identite()]);

    expect(adresses).toHaveLength(1);
  });

  it('réessaie après un échec au lieu de rester bloquée', async () => {
    let echoue = true;
    const appel = (() =>
      echoue
        ? Promise.reject(new Error('ECONNREFUSED'))
        : Promise.resolve(Response.json(sessionFactice(2_000)))) as typeof globalThis.fetch;

    const connexion = new ConnexionPlateforme({
      url: URL_PLATEFORME,
      jeton: JETON,
      fetch: appel,
      maintenant: () => 1_000,
    });

    await expect(connexion.session()).rejects.toBeInstanceOf(ConnexionRefusee);

    echoue = false;

    expect((await connexion.identite()).nom).toBe('Porteuse');
  });
});

describe('client Supabase', () => {
  it('vise la base annoncée par la plateforme', async () => {
    const { appel } = fetchFactice([reponseSession(sessionFactice(2_000))]);
    const connexion = new ConnexionPlateforme({
      url: URL_PLATEFORME,
      jeton: JETON,
      fetch: appel,
      maintenant: () => 1_000,
    });

    // Le serveur MCP ne connaît pas l'adresse de la base : il l'apprend de
    // l'échange. C'est ce qui lui évite une configuration en double.
    const client = await connexion.client();

    expect(client.realtimeUrl.toString()).toContain('base.schemavibe.test');
  });
});

describe('configuration par l’environnement', () => {
  it('construit la connexion quand les deux variables sont là', () => {
    const connexion = connexionDepuisEnvironnement({
      [VARIABLE_URL]: URL_PLATEFORME,
      [VARIABLE_JETON]: JETON,
    });

    expect(connexion).toBeInstanceOf(ConnexionPlateforme);
  });

  it('refuse au démarrage plutôt qu’au premier appel d’outil', () => {
    expect(() => connexionDepuisEnvironnement({ [VARIABLE_JETON]: JETON })).toThrow(
      ConnexionRefusee,
    );
    expect(() => connexionDepuisEnvironnement({ [VARIABLE_URL]: URL_PLATEFORME })).toThrow(
      ConnexionRefusee,
    );
  });

  it('dit où créer un jeton quand il manque', () => {
    expect(() => connexionDepuisEnvironnement({ [VARIABLE_URL]: URL_PLATEFORME })).toThrow(
      /parametres\/jetons/,
    );
  });
});
