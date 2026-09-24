#!/usr/bin/env node
import { ConnexionRefusee, connexionDepuisEnvironnement } from './lib/plateforme.js';

/**
 * Vérification manuelle du branchement (SV-014).
 *
 * Tant qu'aucun outil d'écriture n'existe, rien dans le protocole MCP ne
 * permettrait de constater que l'authentification fonctionne. Cette commande
 * comble ce trou : elle échange le jeton, dit au nom de qui elle agit, et compte
 * ce que cette identité voit — un compte, pas un privilège.
 *
 *   SCHEMAVIBE_URL=… SCHEMAVIBE_TOKEN=… pnpm verifier-connexion
 */

async function principal(): Promise<void> {
  const connexion = connexionDepuisEnvironnement();
  const identite = await connexion.identite();
  const client = await connexion.client();

  const { count: projets, error } = await client
    .from('projects')
    .select('*', { count: 'exact', head: true });

  if (error) {
    throw new ConnexionRefusee(
      'echange_impossible',
      `La session a été ouverte, mais la base a refusé la lecture : ${error.message}`,
    );
  }

  console.warn(
    [
      `Connecté en tant que ${identite.nom ?? identite.id}.`,
      `${projets ?? 0} projet(s) visible(s) sous cette identité.`,
    ].join('\n'),
  );
}

principal().catch((erreur: unknown) => {
  if (erreur instanceof ConnexionRefusee) {
    console.error(`${erreur.message} (${erreur.raison})`);
  } else {
    console.error(erreur instanceof Error ? erreur.message : erreur);
  }

  process.exit(1);
});
