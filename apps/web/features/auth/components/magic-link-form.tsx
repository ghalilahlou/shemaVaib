'use client';

import { useActionState } from 'react';
import { sendMagicLinkAction } from '../actions/sign-in';
import { ETAT_INITIAL, type AuthActionState } from '../actions/auth-action-state';
import { ChampTexte, MessageAlerte, MessageSucces } from './auth-form-fields';

/**
 * Connexion sans mot de passe : l'utilisateur reçoit un lien à usage unique.
 *
 * Le champ s'appelle `email` comme dans le formulaire de connexion, mais les
 * deux formulaires sont distincts pour que leurs états d'erreur ne se mélangent
 * pas.
 */
export function MagicLinkForm() {
  const [etat, action, enCours] = useActionState<AuthActionState, FormData>(
    sendMagicLinkAction,
    ETAT_INITIAL,
  );

  const erreursChamps = etat.statut === 'erreur' ? etat.erreursChamps : {};

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {etat.statut === 'erreur' ? <MessageAlerte message={etat.message} /> : null}
      {etat.statut === 'succes' ? <MessageSucces message={etat.message} /> : null}

      <ChampTexte
        nom="email"
        id="email-magic-link"
        label="Recevoir un lien de connexion"
        type="email"
        autoComplete="email"
        erreurs={erreursChamps.email}
        aide="Aucun mot de passe à saisir : le lien vous connecte directement."
      />

      <button
        type="submit"
        disabled={enCours}
        data-testid="magic-link-envoyer"
        className="self-start rounded-md border border-black/15 px-4 py-2 text-sm disabled:opacity-50 dark:border-white/20"
      >
        {enCours ? 'Envoi…' : 'M’envoyer un lien'}
      </button>
    </form>
  );
}
