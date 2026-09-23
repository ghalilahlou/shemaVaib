'use client';

import { useState } from 'react';
import { createBrowserSupabaseClient } from '../../../lib/supabase/client';

/**
 * Connexion via GitHub.
 *
 * La redirection part du navigateur parce qu'elle a besoin de l'origine réelle
 * de la page. Le retour, lui, atterrit sur `/auth/callback`, où le code est
 * échangé contre une session côté serveur.
 *
 * Le bouton n'est rendu que si le fournisseur est effectivement configuré :
 * l'afficher sans identifiants GitHub valides ne mènerait qu'à une page
 * d'erreur du fournisseur.
 */
export function GithubButton() {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function seConnecter() {
    setEnCours(true);
    setErreur(null);

    const client = createBrowserSupabaseClient();
    const { error } = await client.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });

    if (error) {
      setErreur('La connexion via GitHub est indisponible pour le moment.');
      setEnCours(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={seConnecter}
        disabled={enCours}
        data-testid="github-connexion"
        className="flex items-center justify-center gap-2 rounded-md border border-black/15 px-4 py-2 text-sm disabled:opacity-50 dark:border-white/20"
      >
        {enCours ? 'Redirection…' : 'Continuer avec GitHub'}
      </button>
      {erreur ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {erreur}
        </p>
      ) : null}
    </div>
  );
}
