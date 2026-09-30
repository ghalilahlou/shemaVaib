'use client';

import { useActionState } from 'react';
import { demanderReinitialisationAction } from '../actions/mot-de-passe';
import { ETAT_INITIAL, type AuthActionState } from '../actions/auth-action-state';
import { BoutonSoumettre, ChampTexte, MessageAlerte, MessageSucces } from './auth-form-fields';

export function MotDePasseOublieForm() {
  const [etat, action, enCours] = useActionState<AuthActionState, FormData>(
    demanderReinitialisationAction,
    ETAT_INITIAL,
  );

  const erreursChamps = etat.statut === 'erreur' ? etat.erreursChamps : {};

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {etat.statut === 'erreur' ? <MessageAlerte message={etat.message} /> : null}
      {etat.statut === 'succes' ? <MessageSucces message={etat.message} /> : null}

      <ChampTexte
        nom="email"
        label="Adresse e-mail"
        type="email"
        autoComplete="email"
        erreurs={erreursChamps.email}
      />

      <BoutonSoumettre enCours={enCours} libelle="Recevoir un lien" />
    </form>
  );
}
