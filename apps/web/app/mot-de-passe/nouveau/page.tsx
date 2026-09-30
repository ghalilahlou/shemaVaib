import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createServerSupabaseClient } from '../../../lib/supabase/server';
import { recupererUtilisateurConnecte } from '../../../features/auth/repository/session-repository';
import { CHEMIN_NOUVEAU_MOT_DE_PASSE, cheminDeConnexion } from '../../../features/auth/destination';
import { NouveauMotDePasseForm } from '../../../features/auth/components/nouveau-mot-de-passe-form';

export const metadata: Metadata = {
  title: 'Nouveau mot de passe — SchemaVibe',
};

/**
 * Choix d'un nouveau mot de passe (SV-021).
 *
 * On y arrive par un lien de réinitialisation, dont le callback a déjà ouvert
 * la session, ou depuis son profil. Sans session, il n'y a aucun compte à
 * modifier : retour à la connexion, destination conservée.
 */
export default async function NouveauMotDePassePage() {
  const client = await createServerSupabaseClient();
  const utilisateur = await recupererUtilisateurConnecte(client);

  if (!utilisateur) {
    redirect(cheminDeConnexion(CHEMIN_NOUVEAU_MOT_DE_PASSE));
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Nouveau mot de passe</h1>
        <p className="text-sm opacity-70">Pour le compte {utilisateur.email}.</p>
      </header>

      <NouveauMotDePasseForm />
    </main>
  );
}
