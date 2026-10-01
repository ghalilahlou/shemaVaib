import { ConfigurationIncomplete, verifierConfiguration } from './lib/configuration';

/**
 * Appelée une fois au démarrage du serveur, avant la première requête (SV-022).
 *
 * Un serveur de production auquel il manque une variable journalise ce qui lui
 * manque et répond 500 à toute requête — constaté sur `next start` : le
 * processus reste en vie, mais ne sert rien. Mieux vaut un déploiement qui
 * échoue bruyamment qu'un site qui sert des pages et envoie des liens vers
 * 127.0.0.1.
 */
export function register(): void {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.NODE_ENV !== 'production') {
    return;
  }

  const problemes = verifierConfiguration(process.env);

  if (problemes.length > 0) {
    throw new ConfigurationIncomplete(problemes);
  }
}
