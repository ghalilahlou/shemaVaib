import { z } from 'zod';
import { identiteMcpSchema } from '@schemavibe/shared-types';
import type { SourceSession } from '../lib/plateforme.js';
import { contexteTicketSchema, lireContexteTicket, reclamerTicket } from '../lib/tickets.js';

/**
 * Outil MCP `claim_ticket` (section 8, SV-018).
 *
 * Réclame un ticket au nom du porteur du jeton personnel, puis rend tout ce
 * qu'il faut pour y travailler : critères, critère de test, patterns suggérés,
 * tickets qui le bloquent et tentatives précédentes.
 *
 * Il n'a aucun privilège propre. La visibilité est tranchée par la RLS, et
 * l'exclusivité par le compare-and-swap de `reclamer_ticket` : ce module se
 * contente de lire, d'appeler, et d'expliquer un refus.
 *
 * Réclamer un ticket que l'on tient déjà n'est pas une erreur : c'est ainsi
 * qu'une nouvelle session reprend un travail en cours. L'outil est donc
 * idempotent pour son porteur.
 */

export const claimTicketInputSchema = {
  ticket: z.uuid().describe('Identifiant du ticket, tel qu’il figure dans l’adresse de sa page.'),
};

export const claimTicketOutputSchema = {
  reclamation: z
    .enum(['nouvelle', 'deja_la_votre'])
    .describe(
      '« nouvelle » si cet appel a réclamé le ticket, « deja_la_votre » s’il était déjà tenu.',
    ),
  agit_au_nom_de: identiteMcpSchema,
  ...contexteTicketSchema.shape,
};

export const claimTicketResultatSchema = z.object(claimTicketOutputSchema);

export type ClaimTicketResultat = z.infer<typeof claimTicketResultatSchema>;

/** Pourquoi un ticket n'a pas été réclamé. */
export type MotifRefus = 'introuvable' | 'deja_reclame' | 'non_ouvert';

export class ReclamationRefusee extends Error {
  constructor(
    readonly motif: MotifRefus,
    message: string,
  ) {
    super(message);
    this.name = 'ReclamationRefusee';
  }
}

const MESSAGE_INTROUVABLE =
  'Aucun ticket visible sous cet identifiant. Il n’existe pas, ou il n’est pas encore publié.';

function refusPourStatut(statut: string): ReclamationRefusee {
  return statut === 'reclame'
    ? new ReclamationRefusee('deja_reclame', 'Ce ticket est déjà réclamé par quelqu’un d’autre.')
    : new ReclamationRefusee(
        'non_ouvert',
        `Ce ticket est au statut « ${statut} » : seul un ticket ouvert peut être réclamé.`,
      );
}

export async function reclamerEtLireTicket(
  source: SourceSession,
  ticketId: string,
): Promise<ClaimTicketResultat> {
  const [client, identite] = await Promise.all([source.client(), source.identite()]);

  const avant = await lireContexteTicket(client, ticketId);

  if (!avant) {
    throw new ReclamationRefusee('introuvable', MESSAGE_INTROUVABLE);
  }

  if (avant.ticket.reclame_par === identite.id && avant.ticket.statut === 'reclame') {
    return { reclamation: 'deja_la_votre', agit_au_nom_de: identite, ...avant };
  }

  if (avant.ticket.statut !== 'ouvert') {
    throw refusPourStatut(avant.ticket.statut);
  }

  // Le ticket était ouvert à la lecture, mais c'est la réclamation elle-même qui
  // tranche : quelqu'un a pu le prendre entre les deux.
  if (!(await reclamerTicket(client, ticketId))) {
    const maintenant = await lireContexteTicket(client, ticketId);
    throw maintenant
      ? refusPourStatut(maintenant.ticket.statut)
      : new ReclamationRefusee('introuvable', MESSAGE_INTROUVABLE);
  }

  const apres = await lireContexteTicket(client, ticketId);

  if (!apres) {
    throw new ReclamationRefusee('introuvable', MESSAGE_INTROUVABLE);
  }

  return { reclamation: 'nouvelle', agit_au_nom_de: identite, ...apres };
}

function section(titre: string, contenu: string | null): string[] {
  return contenu?.trim() ? [`## ${titre}`, contenu.trim(), ''] : [];
}

/**
 * Version texte du résultat, pour le modèle qui l'a demandé.
 *
 * Le contexte y est repris en entier plutôt que résumé : c'est précisément ce
 * que la session doit avoir sous les yeux pour travailler sans relire la page.
 */
export function resumerEnTexte(resultat: ClaimTicketResultat): string {
  const { ticket, projet } = resultat;
  const entete =
    resultat.reclamation === 'nouvelle'
      ? `Ticket réclamé au nom de ${resultat.agit_au_nom_de.nom ?? resultat.agit_au_nom_de.id}.`
      : `Ce ticket était déjà réclamé par ${resultat.agit_au_nom_de.nom ?? resultat.agit_au_nom_de.id} : reprise du travail en cours.`;

  const bloqueurs = resultat.bloque_par.filter((lien) => lien.statut !== 'fusionne');

  return [
    entete,
    '',
    `# ${ticket.titre}`,
    `Projet : ${projet.nom}${projet.repo_url ? ` (${projet.repo_url})` : ''}`,
    `Complexité : ${ticket.complexite ?? 'non estimée'} · Priorité : ${ticket.priorite}`,
    '',
    ...section('Contexte', ticket.contexte),
    ...section('Critères d’acceptation', ticket.criteres_acceptation),
    ...section('Critère de test', ticket.critere_test),
    ...(resultat.patterns_suggeres.length
      ? [
          '## Patterns suggérés',
          ...resultat.patterns_suggeres.map(
            (pattern) =>
              `- ${pattern.nom} (${pattern.categorie})${pattern.principe ? ` — ${pattern.principe}` : ''}`,
          ),
          '',
        ]
      : []),
    ...(bloqueurs.length
      ? [
          '## Attention : bloqué par',
          ...bloqueurs.map((lien) => `- ${lien.titre} — statut « ${lien.statut} »`),
          '',
        ]
      : []),
    resultat.tentatives_precedentes.length
      ? `${resultat.tentatives_precedentes.length} tentative(s) précédente(s) sur ce ticket.`
      : 'Aucune tentative précédente.',
  ].join('\n');
}
