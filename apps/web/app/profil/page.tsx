import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createServerSupabaseClient } from '../../lib/supabase/server';
import { recupererUtilisateurConnecte } from '../../features/auth/repository/session-repository';
import { cheminDeConnexion } from '../../features/auth/destination';
import { MessageSucces } from '../../features/auth/components/auth-form-fields';
import { NomForm } from '../../features/profile/components/nom-form';
import { VibeScoreGauge } from '../../components/ui/vibe-score-gauge';

export const metadata: Metadata = {
  title: 'Profil — SchemaVibe',
};

/**
 * Profil de la personne connectée (SV-021).
 *
 * Le nom se modifie ici ; l'XP et le Vibe Score se lisent seulement. Ils sont
 * calculés par la plateforme, et aucune écriture directe ne les atteint plus.
 */
export default async function ProfilPage({ searchParams }: PageProps<'/profil'>) {
  const client = await createServerSupabaseClient();
  const utilisateur = await recupererUtilisateurConnecte(client);

  if (!utilisateur) {
    redirect(cheminDeConnexion('/profil'));
  }

  const { mot_de_passe } = await searchParams;
  const profil = utilisateur.profil;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Profil</h1>
        <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>
          {utilisateur.email}
        </p>
      </header>

      {mot_de_passe === 'modifie' ? <MessageSucces message="Mot de passe modifié." /> : null}

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">Réputation</h2>
        <p className="text-sm">
          <span style={{ color: 'var(--ink-muted)' }}>XP </span>
          <span className="font-mono" data-testid="profil-xp">
            {profil?.xp ?? 0}
          </span>
        </p>
        <VibeScoreGauge score={profil?.vibe_score ?? null} />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">Identité</h2>
        <NomForm nomActuel={profil?.nom ?? ''} />
      </section>

      <section className="flex flex-col gap-2 text-sm">
        <h2 className="text-lg font-medium">Sécurité</h2>
        <Link href="/mot-de-passe/nouveau" className="underline">
          Changer de mot de passe
        </Link>
        <Link href="/parametres/jetons" className="underline">
          Jetons d’accès pour le serveur MCP
        </Link>
      </section>
    </main>
  );
}
