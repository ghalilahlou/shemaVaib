import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  CHEMIN_SESSION_MCP,
  refusSessionMcpSchema,
  sessionMcpSchema,
  type IdentiteMcp,
  type RefusSessionMcp,
  type SessionMcp,
} from '@schemavibe/shared-types';

/**
 * Lien authentifié entre le serveur MCP et la plateforme (SV-014).
 *
 * Le serveur ne connaît que deux choses : l'adresse de la plateforme et un
 * jeton personnel. Tout le reste — où se trouve la base, avec quelle clé
 * publique s'y adresser, au nom de qui — lui est appris par l'échange.
 *
 * Il n'obtient jamais de jeton de rafraîchissement : la session expire d'elle-
 * même et se renouvelle en représentant le jeton. C'est ce qui donne son effet à
 * la révocation, et c'est aussi pourquoi cette classe garde la session en
 * mémoire plutôt que de l'écrire quelque part.
 */

/** Marge prise sur l'échéance : mieux vaut renouveler tôt qu'échouer en plein appel. */
export const MARGE_RENOUVELLEMENT_SECONDES = 60;

export class ConnexionRefusee extends Error {
  constructor(
    readonly raison: RefusSessionMcp['erreur'] | 'reponse_illisible' | 'plateforme_injoignable',
    message: string,
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = 'ConnexionRefusee';
  }
}

export interface OptionsConnexion {
  /** Adresse de la plateforme, sans le chemin. */
  url: string;
  jeton: string;
  /** Injectable pour les tests ; le `fetch` global sinon. */
  fetch?: typeof globalThis.fetch;
  /** Injectable pour les tests ; l'horloge sinon. En secondes Unix. */
  maintenant?: () => number;
}

/** Échange un jeton personnel contre une session, sans rien mémoriser. */
export async function echangerJeton(options: OptionsConnexion): Promise<SessionMcp> {
  const appel = options.fetch ?? globalThis.fetch;
  const adresse = new URL(CHEMIN_SESSION_MCP, options.url).toString();

  let reponse: Response;

  try {
    reponse = await appel(adresse, {
      method: 'POST',
      headers: { authorization: `Bearer ${options.jeton}`, accept: 'application/json' },
    });
  } catch (erreur) {
    throw new ConnexionRefusee(
      'plateforme_injoignable',
      `La plateforme n’a pas répondu à ${adresse}.`,
      erreur,
    );
  }

  const corps: unknown = await reponse.json().catch(() => null);

  if (!reponse.ok) {
    const refus = refusSessionMcpSchema.safeParse(corps);

    throw new ConnexionRefusee(
      refus.success ? refus.data.erreur : 'reponse_illisible',
      refus.success ? refus.data.message : `La plateforme a refusé le jeton (${reponse.status}).`,
    );
  }

  const session = sessionMcpSchema.safeParse(corps);

  if (!session.success) {
    throw new ConnexionRefusee(
      'reponse_illisible',
      'La réponse de la plateforme ne correspond pas au contrat de session attendu.',
      session.error,
    );
  }

  return session.data;
}

export class ConnexionPlateforme {
  readonly #options: OptionsConnexion;
  readonly #maintenant: () => number;
  #session: SessionMcp | null = null;
  /** Échange en cours, partagé pour que deux appels simultanés n'en déclenchent pas deux. */
  #enCours: Promise<SessionMcp> | null = null;

  constructor(options: OptionsConnexion) {
    this.#options = options;
    this.#maintenant = options.maintenant ?? (() => Math.floor(Date.now() / 1000));
  }

  /** Session valide, renouvelée si l'échéance approche. */
  async session(): Promise<SessionMcp> {
    if (this.#session && !this.#expire(this.#session)) {
      return this.#session;
    }

    this.#enCours ??= echangerJeton(this.#options)
      .then((session) => {
        this.#session = session;
        return session;
      })
      .finally(() => {
        this.#enCours = null;
      });

    return this.#enCours;
  }

  /** Identité au nom de laquelle le serveur agit. */
  async identite(): Promise<IdentiteMcp> {
    return (await this.session()).utilisateur;
  }

  /**
   * Client Supabase portant cette identité.
   *
   * Reconstruit à chaque renouvellement : le jeton d'accès voyage dans un
   * en-tête fixé à la construction, il ne peut pas être remplacé en place.
   */
  async client(): Promise<SupabaseClient> {
    const session = await this.session();

    return createClient(session.supabase.url, session.supabase.cle_publique, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${session.access_token}` } },
    });
  }

  #expire(session: SessionMcp): boolean {
    return session.expires_at - MARGE_RENOUVELLEMENT_SECONDES <= this.#maintenant();
  }
}

/** Nom des variables lues, repris tel quel par la page de configuration de la plateforme. */
export const VARIABLE_URL = 'SCHEMAVIBE_URL';
export const VARIABLE_JETON = 'SCHEMAVIBE_TOKEN';

/**
 * Construit la connexion à partir de l'environnement.
 *
 * L'absence de jeton est une erreur immédiate et explicite : découvrir au
 * premier appel d'outil que le serveur n'est pas configuré coûte bien plus cher
 * que de le dire au démarrage.
 */
export function connexionDepuisEnvironnement(
  environnement: NodeJS.ProcessEnv = process.env,
): ConnexionPlateforme {
  const url = environnement[VARIABLE_URL];
  const jeton = environnement[VARIABLE_JETON];

  if (!url) {
    throw new ConnexionRefusee(
      'plateforme_injoignable',
      `${VARIABLE_URL} est absent de l’environnement : indiquez l’adresse de la plateforme.`,
    );
  }

  if (!jeton) {
    throw new ConnexionRefusee(
      'jeton_absent',
      `${VARIABLE_JETON} est absent de l’environnement : créez un jeton depuis /parametres/jetons.`,
    );
  }

  return new ConnexionPlateforme({ url, jeton });
}
