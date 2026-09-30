import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { creerServeur } from '../src/index.js';
import { reclamerEtLireTicket } from '../src/tools/claim-ticket.js';
import {
  SoumissionRefusee,
  preparerOuSoumettre,
  submitSolutionResultatSchema,
  type MotifRefusSoumission,
} from '../src/tools/submit-solution.js';
import {
  creerAdmin,
  creerPersonne,
  creerProjet,
  creerTicket,
  premierPattern,
  supprimerComptes,
  type Personne,
} from './helpers/plateforme.js';

/**
 * SV-019 — `submit_solution` contre la Supabase locale et un vrai dépôt git.
 *
 * Trois choses sont éprouvées : sans confirmation rien n'est écrit, avec
 * confirmation c'est exactement l'aperçu qui est stocké, et seul le réclamant
 * courant peut soumettre — y compris quand le ticket lui est retiré entre deux
 * appels.
 */

const executer = promisify(execFile);

let admin: SupabaseClient;
const comptes: string[] = [];
let porteuse: Personne;
let contributrice: Personne;
let tiers: Personne;
let projet: string;
let patternId: string;
let racine = '';

const LIENS = {
  diff_url: 'https://github.com/exemple/depot/pull/7',
  preview_url: 'https://apercu.exemple.test/pr-7',
};

function entree(ticket: string, confirmer: boolean) {
  return {
    ticket,
    ...LIENS,
    decisions: ['Filtre porté par l’URL, pour survivre au rechargement.'],
    tests_locaux: { commande: 'pnpm test', reussi: true },
    confirmer,
  };
}

async function soumissions(ticket: string) {
  const { data, error } = await admin
    .from('submissions')
    .select('auteur_id, diff_url, preview_url, resume_md')
    .eq('ticket_id', ticket);

  if (error) throw error;

  return data as { auteur_id: string; diff_url: string; preview_url: string; resume_md: string }[];
}

async function statut(ticket: string): Promise<string> {
  const { data, error } = await admin.from('tickets').select('statut').eq('id', ticket).single();
  if (error) throw error;
  return (data as { statut: string }).statut;
}

async function ticketReclamePar(personne: Personne, titre: string): Promise<string> {
  const id = await creerTicket(admin, { projetId: projet, patternId, titre });
  await reclamerEtLireTicket(personne.session, id);
  return id;
}

async function motifDuRefus(promesse: Promise<unknown>): Promise<MotifRefusSoumission> {
  const erreur: unknown = await promesse.then(
    () => null,
    (raison: unknown) => raison,
  );

  expect(erreur).toBeInstanceOf(SoumissionRefusee);

  return (erreur as SoumissionRefusee).motif;
}

beforeAll(async () => {
  admin = creerAdmin();
  porteuse = await creerPersonne(admin, comptes, 'Porteuse SV-019');
  contributrice = await creerPersonne(admin, comptes, 'Contributrice SV-019');
  tiers = await creerPersonne(admin, comptes, 'Tiers SV-019');
  patternId = (await premierPattern(admin)).id;
  projet = await creerProjet(admin, porteuse.id, 'actif');

  // Le dépôt où le travail est censé avoir été fait : une base, puis une
  // branche qui ajoute un code et son test.
  racine = await mkdtemp(join(tmpdir(), 'schemavibe-soumission-'));
  const git = (...args: string[]) =>
    executer('git', ['-C', racine, '-c', 'user.name=T', '-c', 'user.email=t@t.test', ...args], {
      windowsHide: true,
    });
  await git('init', '--initial-branch=main');
  await writeFile(join(racine, 'lisez-moi.md'), 'départ\n');
  await git('add', '.');
  await git('commit', '-m', 'départ');
  await git('switch', '-c', 'travail');
  await writeFile(join(racine, 'filtre.ts'), 'export const filtre = 1;\n');
  await writeFile(join(racine, 'filtre.test.ts'), 'test("filtre", () => {});\n');
  await git('add', '.');
  await git('commit', '-m', 'filtre');
});

afterAll(async () => {
  await supprimerComptes(admin, comptes);
  await rm(racine, { recursive: true, force: true });
});

const soumettre = (personne: Personne, ticket: string, confirmer: boolean) =>
  preparerOuSoumettre(personne.session, entree(ticket, confirmer), racine);

describe('aperçu, puis soumission confirmée', () => {
  let ticket: string;
  let apercu: Awaited<ReturnType<typeof soumettre>>;

  beforeAll(async () => {
    ticket = await ticketReclamePar(contributrice, 'Ticket à soumettre');
    apercu = await soumettre(contributrice, ticket, false);
  });

  it('sans confirmation, rend le résumé et n’écrit rien', async () => {
    expect(apercu.soumis).toBe(false);
    expect(apercu.soumission).toBeNull();
    expect(apercu.resume_md).toContain('`filtre.test.ts`');
    expect(await soumissions(ticket)).toEqual([]);
    expect(await statut(ticket)).toBe('reclame');
  });

  it('avec confirmation, stocke exactement l’aperçu, au nom de la réclamante', async () => {
    const resultat = await soumettre(contributrice, ticket, true);

    expect(resultat.soumis).toBe(true);
    expect(resultat.soumission).not.toBeNull();
    expect(await soumissions(ticket)).toEqual([
      { auteur_id: contributrice.id, ...LIENS, resume_md: apercu.resume_md },
    ]);
    expect(await statut(ticket)).toBe('soumis');
  });

  it('accepte une seconde soumission, comme le veut la boucle Review-Refine', async () => {
    await soumettre(contributrice, ticket, true);

    expect(await soumissions(ticket)).toHaveLength(2);
  });
});

describe('qui peut soumettre', () => {
  it('pas quelqu’un d’autre que le réclamant, même en simple aperçu', async () => {
    const ticket = await ticketReclamePar(contributrice, 'Ticket tenu par une autre');

    expect(await motifDuRefus(soumettre(tiers, ticket, false))).toBe('non_tenu');
    expect(await motifDuRefus(soumettre(tiers, ticket, true))).toBe('non_tenu');
    expect(await soumissions(ticket)).toEqual([]);
  });

  it('plus la réclamante, une fois le ticket relâché par la porteuse', async () => {
    const ticket = await ticketReclamePar(contributrice, 'Ticket repris par la porteuse');

    // Le témoin : l'aperçu passe tant qu'elle le tient.
    expect((await soumettre(contributrice, ticket, false)).soumis).toBe(false);

    const client = await porteuse.session.client();
    const { error } = await client.rpc('relacher_ticket', { ticket });
    expect(error).toBeNull();

    expect(await motifDuRefus(soumettre(contributrice, ticket, true))).toBe('non_tenu');
    expect(await soumissions(ticket)).toEqual([]);
  });

  it('un ticket invisible est introuvable', async () => {
    expect(await motifDuRefus(soumettre(contributrice, crypto.randomUUID(), false))).toBe(
      'introuvable',
    );
  });

  it('un dépôt illisible est refusé avant toute écriture', async () => {
    const ticket = await ticketReclamePar(contributrice, 'Ticket au dépôt introuvable');

    const refus = preparerOuSoumettre(
      contributrice.session,
      { ...entree(ticket, true), chemin: join(racine, 'nexiste-pas') },
      racine,
    );

    expect(await motifDuRefus(refus)).toBe('travail_illisible');
    expect(await soumissions(ticket)).toEqual([]);
  });
});

describe('à travers un client MCP réel', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ name: 'test', version: '0.0.0' });
    const [transportClient, transportServeur] = InMemoryTransport.createLinkedPair();

    await Promise.all([
      creerServeur({ session: () => contributrice.session }).connect(transportServeur),
      client.connect(transportClient),
    ]);
  });

  afterAll(async () => {
    await client.close();
  });

  it('n’écrit rien quand confirmer est omis', async () => {
    const ticket = await ticketReclamePar(contributrice, 'Ticket soumis par le protocole');
    const { confirmer: _omis, ...sansConfirmation } = entree(ticket, false);

    const resultat = await client.callTool({
      name: 'submit_solution',
      arguments: { ...sansConfirmation, chemin: racine },
    });

    expect(resultat.isError).toBeFalsy();
    expect(submitSolutionResultatSchema.parse(resultat.structuredContent).soumis).toBe(false);
    expect(JSON.stringify(resultat.content)).toContain('APERÇU');
    expect(await soumissions(ticket)).toEqual([]);
  });

  it('refuse un lien de diff qui n’est pas une URL', async () => {
    const ticket = await ticketReclamePar(contributrice, 'Ticket au lien invalide');

    const resultat = await client.callTool({
      name: 'submit_solution',
      arguments: { ...entree(ticket, true), diff_url: 'pas une url', chemin: racine },
    });

    expect(resultat.isError).toBe(true);
    expect(await soumissions(ticket)).toEqual([]);
  });
});
