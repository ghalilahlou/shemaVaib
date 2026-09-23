'use client';

import { useActionState } from 'react';
import { signUpAction } from '../actions/sign-up';
import { ETAT_INITIAL, type AuthActionState } from '../actions/auth-action-state';
import { MIN_PASSWORD_LENGTH } from '../schema';
import { BoutonSoumettre, ChampTexte, MessageAlerte } from './auth-form-fields';

export function SignUpForm() {
  const [etat, action, enCours] = useActionState<AuthActionState, FormData>(
    signUpAction,
    ETAT_INITIAL,
  );

  const erreursChamps = etat.statut === 'erreur' ? etat.erreursChamps : {};

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {etat.statut === 'erreur' ? <MessageAlerte message={etat.message} /> : null}

      <ChampTexte
        nom="nom"
        label="Nom"
        autoComplete="name"
        erreurs={erreursChamps.nom}
        aide="C’est ce nom que verront les autres contributeurs."
      />
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
        autoComplete="new-password"
        erreurs={erreursChamps.motDePasse}
        aide={`Au moins ${MIN_PASSWORD_LENGTH} caractères, avec une minuscule, une majuscule et un chiffre.`}
      />

      <BoutonSoumettre enCours={enCours} libelle="Créer mon compte" />
    </form>
  );
}
