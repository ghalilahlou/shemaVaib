import Link from 'next/link';
import { signOutAction } from '../actions/sign-in';
import type { UtilisateurConnecte } from '../repository/session-repository';

/**
 * En-tête du site : c'est ici que l'état de la session devient visible.
 *
 * Sans lui, rien ne dirait à l'utilisateur s'il est connecté, et le refus de la
 * Server Action de création de projet paraîtrait arbitraire.
 */
export function SiteHeader({ utilisateur }: { utilisateur: UtilisateurConnecte | null }) {
  return (
    <header className="border-b border-black/10 dark:border-white/15">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-6 py-3">
        <Link href="/" className="font-semibold tracking-tight">
          SchemaVibe
        </Link>

        <nav className="flex items-center gap-3 text-sm">
          <Link href="/projets" className="opacity-70 hover:opacity-100">
            Projets
          </Link>

          {utilisateur ? (
            <>
              <span data-testid="session-utilisateur" className="opacity-70">
                {utilisateur.profil?.nom ?? utilisateur.email}
              </span>
              <form action={signOutAction}>
                <button
                  type="submit"
                  data-testid="deconnexion"
                  className="rounded-md border border-black/15 px-3 py-1 dark:border-white/20"
                >
                  Se déconnecter
                </button>
              </form>
            </>
          ) : (
            <>
              <Link
                href="/connexion"
                data-testid="lien-connexion"
                className="opacity-70 hover:opacity-100"
              >
                Se connecter
              </Link>
              <Link
                href="/inscription"
                data-testid="lien-inscription"
                className="rounded-md bg-foreground px-3 py-1 text-background"
              >
                S’inscrire
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
