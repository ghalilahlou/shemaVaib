import { describe, expect, it } from 'vitest';
import {
  ConfigurationIncomplete,
  URL_DU_SITE_EN_LOCAL,
  urlDuSite,
  verifierConfiguration,
} from '../../lib/configuration';

/**
 * SV-022 — ce qu'un serveur de production exige avant de démarrer.
 *
 * Logique pure : l'environnement est passé en paramètre, `process.env` n'est
 * jamais modifié.
 */

const COMPLET = {
  NODE_ENV: 'production',
  NEXT_PUBLIC_SUPABASE_URL: 'https://projet.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'cle-publique',
  SUPABASE_SERVICE_ROLE_KEY: 'cle-de-service',
  NEXT_PUBLIC_SITE_URL: 'https://schemavibe.exemple',
};

describe('verifierConfiguration', () => {
  it('ne trouve rien à redire à une configuration complète', () => {
    expect(verifierConfiguration(COMPLET)).toEqual([]);
  });

  it('accepte une adresse locale en http — la CI sert un build de production sur 127.0.0.1', () => {
    expect(
      verifierConfiguration({ ...COMPLET, NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3000' }),
    ).toEqual([]);
  });

  it.each([
    ['NEXT_PUBLIC_SUPABASE_URL'],
    ['NEXT_PUBLIC_SUPABASE_ANON_KEY'],
    ['SUPABASE_SERVICE_ROLE_KEY'],
    ['NEXT_PUBLIC_SITE_URL'],
  ])('signale %s absente, en la nommant', (nom) => {
    const problemes = verifierConfiguration({ ...COMPLET, [nom]: undefined });

    expect(problemes).toHaveLength(1);
    expect(problemes[0]).toContain(nom);
  });

  it('énumère tous les manques à la fois, pas seulement le premier', () => {
    expect(verifierConfiguration({ NODE_ENV: 'production' })).toHaveLength(4);
  });

  it.each([
    ['en http hors de la machine locale', 'http://schemavibe.exemple', 'https'],
    ['illisible', 'schemavibe', 'pas une adresse valide'],
    ['avec un chemin', 'https://schemavibe.exemple/app', 'origine seule'],
  ])('refuse une adresse du site %s', (_cas, valeur, attendu) => {
    const problemes = verifierConfiguration({ ...COMPLET, NEXT_PUBLIC_SITE_URL: valeur });

    expect(problemes).toHaveLength(1);
    expect(problemes[0]).toContain(attendu);
  });
});

describe('urlDuSite', () => {
  it('rend l’adresse configurée, sans barre finale', () => {
    expect(urlDuSite({ ...COMPLET, NEXT_PUBLIC_SITE_URL: 'https://schemavibe.exemple/' })).toBe(
      'https://schemavibe.exemple',
    );
  });

  it('retombe sur l’adresse locale en développement', () => {
    expect(urlDuSite({ NODE_ENV: 'development' })).toBe(URL_DU_SITE_EN_LOCAL);
  });

  it('refuse de retomber sur 127.0.0.1 en production', () => {
    expect(() => urlDuSite({ NODE_ENV: 'production' })).toThrow(ConfigurationIncomplete);
  });
});
