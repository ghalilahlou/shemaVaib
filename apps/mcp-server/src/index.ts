#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ConnexionRefusee,
  connexionDepuisEnvironnement,
  type SourceSession,
} from './lib/plateforme.js';
import {
  ReclamationRefusee,
  claimTicketInputSchema,
  claimTicketOutputSchema,
  reclamerEtLireTicket,
  resumerEnTexte as resumerReclamation,
} from './tools/claim-ticket.js';
import {
  CreationRefusee,
  createTicketsInputSchema,
  createTicketsOutputSchema,
  preparerOuCreer,
  resumerEnTexte as resumerCreation,
} from './tools/create-tickets.js';
import {
  SoumissionRefusee,
  preparerOuSoumettre,
  resumerEnTexte as resumerSoumission,
  submitSolutionInputSchema,
  submitSolutionOutputSchema,
} from './tools/submit-solution.js';
import {
  resumerEnTexte,
  scanRepoInputSchema,
  scanRepoOutputSchema,
  scannerDepot,
} from './tools/scan-repo.js';

/**
 * Serveur MCP SchemaVibe (section 8 du cahier des charges).
 *
 * Un seul serveur pour tous les outils compatibles MCP — Claude Code, Cursor et
 * les autres — plutôt qu'une intégration par éditeur.
 *
 * `scan_repo` lit un dépôt local et n'écrit rien. `create_tickets`,
 * `claim_ticket` et `submit_solution` écrivent sur la plateforme, au nom du
 * porteur du jeton personnel (SV-014) et jamais avec plus de droits que lui ;
 * le premier et le dernier ne le font que sur confirmation explicite.
 */

export const MCP_SERVER_NAME = 'schemavibe' as const;
export const MCP_SERVER_VERSION = '0.1.0' as const;

export interface OptionsServeur {
  /**
   * Fournit la session des outils qui agissent sur la plateforme. Par défaut, la
   * connexion décrite par l'environnement ; les tests en injectent une autre.
   */
  session?: () => SourceSession;
}

/** Réponse d'échec lisible par le modèle, sans sortie structurée. */
function echec(message: string) {
  return { isError: true, content: [{ type: 'text' as const, text: message }] };
}

export function creerServeur(options: OptionsServeur = {}): McpServer {
  const serveur = new McpServer({ name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION });

  // La connexion n'est établie qu'au premier outil qui en a besoin : un serveur
  // sans jeton configuré doit continuer de servir `scan_repo`, qui n'en dépend
  // pas, et ne refuser que ce qui l'exige vraiment.
  let session: SourceSession | null = null;
  const obtenirSession = (): SourceSession =>
    (session ??= (options.session ?? connexionDepuisEnvironnement)());

  serveur.registerTool(
    'scan_repo',
    {
      title: 'Analyser un dépôt local',
      description:
        'Analyse un dépôt local — densité de commits récents, présence de tests, TODO non ' +
        'résolus — et rend un constat structuré. Lecture seule : cet outil ne crée aucun ticket ' +
        'et n’écrit rien sur la plateforme SchemaVibe.',
      inputSchema: scanRepoInputSchema,
      outputSchema: scanRepoOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ chemin }) => {
      const resultat = await scannerDepot(chemin);

      return {
        content: [{ type: 'text' as const, text: resumerEnTexte(resultat) }],
        structuredContent: resultat,
      };
    },
  );

  serveur.registerTool(
    'claim_ticket',
    {
      title: 'Réclamer un ticket',
      description:
        'Réclame un ticket ouvert de la plateforme SchemaVibe au nom du porteur du jeton ' +
        'personnel, puis rend son contexte complet : critères d’acceptation, critère de test, ' +
        'patterns suggérés, tickets bloquants et tentatives précédentes. Réclamer un ticket déjà ' +
        'tenu par la même personne reprend simplement le travail en cours.',
      inputSchema: claimTicketInputSchema,
      outputSchema: claimTicketOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ ticket }) => {
      try {
        const resultat = await reclamerEtLireTicket(obtenirSession(), ticket);

        return {
          content: [{ type: 'text' as const, text: resumerReclamation(resultat) }],
          structuredContent: resultat,
        };
      } catch (erreur) {
        if (erreur instanceof ReclamationRefusee || erreur instanceof ConnexionRefusee) {
          return echec(erreur.message);
        }

        throw erreur;
      }
    },
  );

  serveur.registerTool(
    'submit_solution',
    {
      title: 'Soumettre une solution',
      description:
        'Rattache une solution au ticket que vous tenez : lien du diff, lien de l’aperçu, et ' +
        'résumé Markdown rédigé à partir du dépôt local (fichiers modifiés, tests touchés) et de ' +
        'vos déclarations (décisions, tests lancés). Sans confirmer: true, rend seulement un ' +
        'aperçu et n’écrit rien : montrez-le à la personne avant de confirmer.',
      inputSchema: submitSolutionInputSchema,
      outputSchema: submitSolutionOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        // Chaque soumission confirmée s'ajoute à l'historique du ticket.
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (entree) => {
      try {
        const resultat = await preparerOuSoumettre(obtenirSession(), entree);

        return {
          content: [{ type: 'text' as const, text: resumerSoumission(resultat) }],
          structuredContent: resultat,
        };
      } catch (erreur) {
        if (erreur instanceof SoumissionRefusee || erreur instanceof ConnexionRefusee) {
          return echec(erreur.message);
        }

        throw erreur;
      }
    },
  );

  serveur.registerTool(
    'create_tickets',
    {
      title: 'Créer des tickets',
      description:
        'Crée un lot de tickets dans un projet que vous portez — typiquement ceux que suggère ' +
        'scan_repo. Chaque ticket est évalué selon la Definition of Ready : publié s’il est prêt ' +
        'et que publier vaut true, brouillon sinon, avec ce qui lui manque. Sans confirmer: true, ' +
        'rend seulement un aperçu et n’écrit rien : montrez-le à la personne avant de confirmer.',
      inputSchema: createTicketsInputSchema,
      outputSchema: createTicketsOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        // Un lot confirmé deux fois est refusé comme doublon, sans rien créer.
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (entree) => {
      try {
        const resultat = await preparerOuCreer(obtenirSession(), entree);

        return {
          content: [{ type: 'text' as const, text: resumerCreation(resultat) }],
          structuredContent: resultat,
        };
      } catch (erreur) {
        if (erreur instanceof CreationRefusee || erreur instanceof ConnexionRefusee) {
          return echec(erreur.message);
        }

        throw erreur;
      }
    },
  );

  return serveur;
}

/** Démarre le serveur sur l'entrée et la sortie standard. */
async function demarrer(): Promise<void> {
  const serveur = creerServeur();
  await serveur.connect(new StdioServerTransport());
}

// Le serveur ne démarre que lorsqu'il est lancé comme programme : importé par
// un test, il se contente d'exposer `creerServeur`.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  demarrer().catch((erreur: unknown) => {
    console.error('Le serveur MCP SchemaVibe n’a pas pu démarrer :', erreur);
    process.exit(1);
  });
}
