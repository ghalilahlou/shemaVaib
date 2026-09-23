import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createServerSupabaseClient } from '../../lib/supabase/server';
import { recupererUtilisateurConnecte } from '../../features/auth/repository/session-repository';
import { SignUpForm } from '../../features/auth/components/sign-up-form';
import { GithubButton } from '../../features/auth/components/github-button';

export const metadata: Metadata = {
  title: 'Inscription — SchemaVibe',
};

export default async function SignUpPage() {
  const client = await createServerSupabaseClient();
  const utilisateur = await recupererUtilisateurConnecte(client);

  if (utilisateur) {
    redirect('/projets');
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Créer un compte</h1>
        <p className="text-sm opacity-70">
          Un compte vous permet de porter vos propres projets et de réclamer des tickets.
        </p>
      </header>

      <SignUpForm />

      <div className="flex items-center gap-3 text-xs opacity-50">
        <span className="h-px flex-1 bg-current" />
        ou
        <span className="h-px flex-1 bg-current" />
      </div>

      <GithubButton />

      <p className="text-sm opacity-70">
        Déjà un compte ?{' '}
        <Link href="/connexion" className="underline">
          Se connecter
        </Link>
      </p>
    </main>
  );
}
