import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createServerSupabaseClient } from '../../lib/supabase/server';
import { recupererUtilisateurConnecte } from '../../features/auth/repository/session-repository';
import { SignInForm } from '../../features/auth/components/sign-in-form';
import { MagicLinkForm } from '../../features/auth/components/magic-link-form';
import { GithubButton } from '../../features/auth/components/github-button';

export const metadata: Metadata = {
  title: 'Connexion — SchemaVibe',
};

/** Messages des retours de callback ratés (magic link expiré, lien tronqué). */
const MESSAGES_ERREUR: Record<string, string> = {
  lien_invalide: 'Ce lien de connexion est incomplet. Demandez-en un nouveau.',
  lien_expire: 'Ce lien de connexion a expiré ou a déjà servi. Demandez-en un nouveau.',
};

export default async function SignInPage({ searchParams }: PageProps<'/connexion'>) {
  const client = await createServerSupabaseClient();
  const utilisateur = await recupererUtilisateurConnecte(client);

  if (utilisateur) {
    redirect('/projets');
  }

  const parametres = await searchParams;
  const codeErreur = typeof parametres.erreur === 'string' ? parametres.erreur : undefined;
  const messageInitial = codeErreur ? MESSAGES_ERREUR[codeErreur] : undefined;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Se connecter</h1>
      </header>

      <SignInForm messageInitial={messageInitial} />

      <div className="flex items-center gap-3 text-xs opacity-50">
        <span className="h-px flex-1 bg-current" />
        ou
        <span className="h-px flex-1 bg-current" />
      </div>

      <MagicLinkForm />
      <GithubButton />

      <p className="text-sm opacity-70">
        Pas encore de compte ?{' '}
        <Link href="/inscription" className="underline">
          S’inscrire
        </Link>
      </p>
    </main>
  );
}
