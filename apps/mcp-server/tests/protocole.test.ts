import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { creerServeur, MCP_SERVER_NAME } from '../src/index.js';
import { scanRepoResultatSchema } from '../src/tools/scan-repo.js';

/**
 * SV-011 — le contrat vu depuis un client MCP réel.
 *
 * Le fichier voisin vérifie la fonction d'analyse ; celui-ci vérifie le
 * câblage. Un outil peut très bien produire le bon résultat et rester
 * inutilisable : mal déclaré, mal nommé, ou renvoyant une sortie structurée que
 * le SDK rejette. C'est précisément ce dont dépend Claude Code.
 */

let depot = '';
let base = '';
let client: Client;

beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), 'schemavibe-protocole-'));
  depot = join(base, 'projet');
  await mkdir(join(depot, 'src'), { recursive: true });
  await writeFile(join(depot, 'src', 'index.js'), '// TODO: écrire le vrai code\n');

  client = new Client({ name: 'test', version: '0.0.0' });
  const [transportClient, transportServeur] = InMemoryTransport.createLinkedPair();

  await Promise.all([creerServeur().connect(transportServeur), client.connect(transportClient)]);
});

afterAll(async () => {
  await client.close();
  await rm(base, { recursive: true, force: true });
});

describe('déclaration de l’outil', () => {
  it('expose scan_repo, et lui seul pour l’instant', async () => {
    const { tools } = await client.listTools();

    // Les trois autres outils de la section 8 relèvent de tickets à venir :
    // les exposer vides induirait en erreur.
    expect(tools.map((outil) => outil.name)).toEqual(['scan_repo']);
  });

  it('annonce un outil en lecture seule', async () => {
    const { tools } = await client.listTools();

    expect(tools[0]?.annotations?.readOnlyHint).toBe(true);
    expect(tools[0]?.annotations?.destructiveHint).toBe(false);
  });

  it('dit dans sa description qu’il n’écrit rien sur la plateforme', async () => {
    const { tools } = await client.listTools();

    expect(tools[0]?.description).toContain('n’écrit rien');
  });

  it('déclare un schéma d’entrée et un schéma de sortie', async () => {
    const { tools } = await client.listTools();

    expect(tools[0]?.inputSchema?.properties).toHaveProperty('chemin');
    expect(tools[0]?.outputSchema?.properties).toHaveProperty('signaux');
  });
});

describe('appel de l’outil', () => {
  it('rend une sortie structurée conforme au contrat', async () => {
    const reponse = await client.callTool({ name: 'scan_repo', arguments: { chemin: depot } });

    expect(reponse.isError).toBeFalsy();
    expect(scanRepoResultatSchema.safeParse(reponse.structuredContent).success).toBe(true);
  });

  it('accompagne la sortie structurée d’un résumé lisible', async () => {
    const reponse = await client.callTool({ name: 'scan_repo', arguments: { chemin: depot } });
    const contenu = reponse.content as { type: string; text: string }[];

    expect(contenu[0]?.type).toBe('text');
    expect(contenu[0]?.text).toContain('Aucun ticket n’a été créé');
  });

  it('relève le TODO du dépôt de test', async () => {
    const reponse = await client.callTool({ name: 'scan_repo', arguments: { chemin: depot } });
    const resultat = scanRepoResultatSchema.parse(reponse.structuredContent);

    expect(resultat.todos.total).toBe(1);
    expect(resultat.todos.exemples[0]?.fichier).toBe('src/index.js');
  });

  it('signale un chemin inexistant sans rompre la connexion', async () => {
    const reponse = await client.callTool({
      name: 'scan_repo',
      arguments: { chemin: join(base, 'nulle-part') },
    });

    expect(reponse.isError).toBe(true);

    // La connexion tient : un appel suivant doit encore aboutir.
    const suivant = await client.callTool({ name: 'scan_repo', arguments: { chemin: depot } });
    expect(suivant.isError).toBeFalsy();
  });

  it('refuse un appel sans chemin', async () => {
    const reponse = await client.callTool({ name: 'scan_repo', arguments: {} });

    expect(reponse.isError).toBe(true);
  });
});

describe('identité du serveur', () => {
  it('se présente sous le nom attendu par la configuration', async () => {
    // Le nom sert de clé dans `.mcp.json` : le changer casserait les
    // configurations existantes.
    expect(MCP_SERVER_NAME).toBe('schemavibe');
  });
});
