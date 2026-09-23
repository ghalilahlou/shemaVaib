'use client';

import { useActionState } from 'react';
import { signInAction } from '../actions/sign-in';
import { ETAT_INITIAL, type AuthActionState } from '../actions/auth-action-state';
import { BoutonSoumettre, ChampTexte, MessageAlerte } from './auth-form-fields';

export function SignInForm({ messageInitial }: { messageInitial?: string | undefined }) {
  const [etat, action, enCours] = useActionState<AuthActionState, FormData>(
    signInAction,
    ETAT_INITIAL,
  );

  const erreursChamps = etat.statut === 'erreur' ? etat.erreursChamps : {};
  const message = etat.statut === 'erreur' ? etat.message : messageInitial;

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {message ? <MessageAlerte message={message} /> : null}

      <ChampTexte
        nom="email"
        label="Adresse e-mail"
        type="email"
        autoComplete="email"
        erreurs={erreursChamps.email}
      />
      <ChampTexte
        nom="motDePasse"
        label="Mot de passe"
        type="password"
        autoComplete="current-password"
        erreurs={erreursChamps.motDePasse}
      />

      <BoutonSoumettre enCours={enCours} libelle="Se connecter" />
    </form>
  );
}
