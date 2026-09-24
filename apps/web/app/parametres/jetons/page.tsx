import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { CHEMIN_SESSION_MCP } from '@schemavibe/shared-types';
import { createServerSupabaseClient } from '../../../lib/supabase/server';
import { recupererUtilisateurConnecte } from '../../../features/auth/repository/session-repository';
import { listerJetons } from '../../../features/api-tokens/repository/api-tokens-repository';
import { JetonForm } from '../../../features/api-tokens/components/jeton-form';
import { ListeJetons } from '../../../features/api-tokens/components/liste-jetons';

export const metadata: Metadata = {
  title: 'Jetons d’accès — SchemaVibe',
};

export default async function JetonsPage() {
  const client = await createServerSupabaseClient();
  const utilisateur = await recupererUtilisateurConnecte(client);

  // Rediriger plutôt que d'afficher une page vide. La RLS reste la protection :
  // cette redirection est un confort.
  if (!utilisateur) {
    redirect('/connexion?next=/parametres/jetons');
  }

  const jetons = await listerJetons(client);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-12">
      <nav>
        <Link href="/projets" className="text-sm opacity-70 hover:underline">
          ← Tous les projets
        </Link>
      </nav>

      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Jetons d’accès</h1>
        <p className="text-sm opacity-70">
          Un jeton permet au serveur MCP d’agir en votre nom depuis votre éditeur. Il ne donne
          jamais plus de droits que vous n’en avez, et n’ouvre qu’une session de courte durée :
          révoquer un jeton ferme l’accès.
        </p>
      </header>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">Nouveau jeton</h2>
        <JetonForm />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">Vos jetons</h2>
        <ListeJetons jetons={jetons} />
      </section>

      <section className="flex flex-col gap-2 text-sm">
        <h2 className="text-lg font-medium">Brancher le serveur MCP</h2>
        <p className="opacity-70">
          Dans la configuration du serveur, renseignez l’adresse de cette plateforme et le jeton :
        </p>
        <pre className="overflow-x-auto rounded-md border border-black/10 px-3 py-2 font-mono text-xs dark:border-white/15">
          {`SCHEMAVIBE_URL=${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://127.0.0.1:3000'}\nSCHEMAVIBE_TOKEN=svb_…`}
        </pre>
        <p className="opacity-60">
          Le serveur échange ce jeton contre une session sur <code>{CHEMIN_SESSION_MCP}</code>.
        </p>
      </section>
    </main>
  );
}
