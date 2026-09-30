import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { SourceSession } from '../../src/lib/plateforme.js';

/**
 * Préparations partagées des tests qui visent la Supabase locale (SV-018, SV-019).
 *
 * L'échange du jeton personnel est couvert par SV-014 : une personne de test
 * reçoit donc une session ouverte directement par mot de passe, pour la même
 * identité. Ce que les outils font de cette identité est ce qui est éprouvé.
 */

export const MOT_DE_PASSE = 'MotDePasseDeTest12345';

export interface Personne {
  id: string;
  nom: string;
  session: SourceSession;
}

function variable(nom: string): string {
  const valeur = process.env[nom];

  if (!valeur) {
    throw new Error(`${nom} est absent : démarrez la Supabase locale (pnpm db:start).`);
  }

  return valeur;
}

/** Client à privilèges élevés, réservé à la préparation et au constat. */
export function creerAdmin(): SupabaseClient {
  return createClient(variable('NEXT_PUBLIC_SUPABASE_URL'), variable('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Crée un compte confirmé et rend une session qui porte son identité. */
export async function creerPersonne(
  admin: SupabaseClient,
  comptes: string[],
  nom: string,
): Promise<Personne> {
  const email = `mcp-${crypto.randomUUID()}@schemavibe.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: MOT_DE_PASSE,
    email_confirm: true,
    user_metadata: { nom },
  });

  if (error || !data.user) {
    throw new Error(`Création du compte impossible : ${error?.message ?? 'inconnu'}`);
  }

  comptes.push(data.user.id);

  const client = createClient(
    variable('NEXT_PUBLIC_SUPABASE_URL'),
    variable('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { error: erreurSession } = await client.auth.signInWithPassword({
    email,
    password: MOT_DE_PASSE,
  });

  if (erreurSession) {
    throw new Error(`Ouverture de session impossible : ${erreurSession.message}`);
  }

  const id = data.user.id;

  return {
    id,
    nom,
    session: {
      identite: () => Promise.resolve({ id, nom }),
      client: () => Promise.resolve(client),
    },
  };
}

export async function supprimerComptes(admin: SupabaseClient, comptes: string[]): Promise<void> {
  for (const id of comptes) {
    await admin.auth.admin.deleteUser(id);
  }
}

export async function creerProjet(
  admin: SupabaseClient,
  proprietaireId: string,
  statut: 'actif' | 'brouillon',
): Promise<string> {
  const { data, error } = await admin
    .from('projects')
    .insert({ proprietaire_id: proprietaireId, nom: `Projet de test ${statut}`, statut })
    .select('id')
    .single();

  if (error) throw error;

  return (data as { id: string }).id;
}

export async function premierPattern(admin: SupabaseClient): Promise<{ id: string; nom: string }> {
  const { data, error } = await admin.from('patterns').select('id, nom').limit(1);

  if (error || !data?.[0]) {
    throw new Error('Bibliothèque de patterns vide.');
  }

  return data[0] as { id: string; nom: string };
}

/** Un ticket qui réunit la Definition of Ready, publié ou laissé en brouillon. */
export async function creerTicket(
  admin: SupabaseClient,
  entree: { projetId: string; patternId: string; titre: string; statut?: 'ouvert' | 'brouillon' },
): Promise<string> {
  const { data, error } = await admin
    .from('tickets')
    .insert({
      projet_id: entree.projetId,
      titre: entree.titre,
      contexte: 'Le filtre par statut manque sur la liste des tickets.',
      criteres_acceptation: 'Un filtre par statut existe et conserve la sélection.',
      critere_test: 'Filtrer sur « ouvert » ne laisse que des tickets ouverts.',
      complexite: 'S',
    })
    .select('id')
    .single();

  if (error) throw error;

  const id = (data as { id: string }).id;

  const { error: erreurLien } = await admin
    .from('ticket_patterns')
    .insert({ ticket_id: id, pattern_id: entree.patternId, role: 'suggere' });
  if (erreurLien) throw erreurLien;

  if ((entree.statut ?? 'ouvert') === 'ouvert') {
    const { error: erreurPublication } = await admin
      .from('tickets')
      .update({ statut: 'ouvert' })
      .eq('id', id);
    if (erreurPublication) throw erreurPublication;
  }

  return id;
}
