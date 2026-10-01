/**
 * Configuration requise pour servir la plateforme (SV-022).
 *
 * POURQUOI ÉCHOUER AU DÉMARRAGE
 *
 * Une variable manquante ne casse rien de visible : l'application démarre, les
 * pages s'affichent, et c'est le premier lien de connexion envoyé par e-mail qui
 * pointe vers `http://127.0.0.1:3000` — la machine de la personne qui le reçoit.
 * Rien ne l'aurait signalé. `instrumentation.ts` appelle donc
 * `verifierConfiguration` avant la première requête : un serveur de production
 * incomplet ne sert aucune page (500) et journalise ce qui lui manque.
 *
 * Les fonctions prennent l'environnement en paramètre : elles se testent sans
 * toucher à `process.env`.
 */

type Environnement = Record<string, string | undefined>;

/** Adresse de développement, la seule où une valeur par défaut est acceptable. */
export const URL_DU_SITE_EN_LOCAL = 'http://127.0.0.1:3000';

const HOTES_LOCAUX = new Set(['127.0.0.1', 'localhost', '[::1]']);

export class ConfigurationIncomplete extends Error {
  constructor(readonly problemes: string[]) {
    super(
      `Configuration incomplète pour la production :\n${problemes.map((p) => `- ${p}`).join('\n')}`,
    );
    this.name = 'ConfigurationIncomplete';
  }
}

function enProduction(environnement: Environnement): boolean {
  return environnement.NODE_ENV === 'production';
}

/** Problème posé par l'adresse publique du site, ou `null` si elle convient. */
function problemeUrlDuSite(valeur: string | undefined): string | null {
  if (!valeur) {
    return 'NEXT_PUBLIC_SITE_URL est absente : les liens envoyés par e-mail pointeraient vers 127.0.0.1.';
  }

  let url: URL;

  try {
    url = new URL(valeur);
  } catch {
    return `NEXT_PUBLIC_SITE_URL n’est pas une adresse valide : « ${valeur} ».`;
  }

  // En clair, les cookies de session et les jetons d'un lien magique voyagent
  // lisibles. Seule une adresse locale y échappe — la CI sert un build de
  // production sur 127.0.0.1.
  if (url.protocol !== 'https:' && !HOTES_LOCAUX.has(url.hostname)) {
    return `NEXT_PUBLIC_SITE_URL doit être en https hors de la machine locale : « ${valeur} ».`;
  }

  if (url.pathname !== '/' || url.search || url.hash) {
    return `NEXT_PUBLIC_SITE_URL doit être une origine seule, sans chemin : « ${valeur} ».`;
  }

  return null;
}

/** Ce qui manque pour servir la production ; vide si tout est en place. */
export function verifierConfiguration(environnement: Environnement): string[] {
  const problemes: string[] = [];

  for (const nom of [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    // Requise par l'échange de jetons du serveur MCP (`/api/mcp/session`).
    'SUPABASE_SERVICE_ROLE_KEY',
  ]) {
    if (!environnement[nom]) {
      problemes.push(`${nom} est absente.`);
    }
  }

  const url = problemeUrlDuSite(environnement.NEXT_PUBLIC_SITE_URL);

  if (url) {
    problemes.push(url);
  }

  return problemes;
}

/**
 * Adresse publique du site, sans barre finale — base de toute URL envoyée hors
 * de l'application (liens par e-mail, retour OAuth, configuration du serveur
 * MCP).
 *
 * En développement, son absence retombe sur l'adresse locale. En production,
 * elle est une erreur : retomber sur 127.0.0.1 serait silencieusement faux.
 */
export function urlDuSite(environnement: Environnement = process.env): string {
  const valeur = environnement.NEXT_PUBLIC_SITE_URL;

  if (!valeur) {
    if (enProduction(environnement)) {
      throw new ConfigurationIncomplete([problemeUrlDuSite(valeur)!]);
    }

    return URL_DU_SITE_EN_LOCAL;
  }

  return valeur.replace(/\/+$/, '');
}
