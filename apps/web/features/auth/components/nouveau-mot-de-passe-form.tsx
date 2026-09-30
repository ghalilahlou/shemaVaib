'use client';

import { useActionState } from 'react';
import { definirMotDePasseAction } from '../actions/mot-de-passe';
import { ETAT_INITIAL, type AuthActionState } from '../actions/auth-action-state';
import { MIN_PASSWORD_LENGTH } from '../schema';
import { BoutonSoumettre, ChampTexte, MessageAlerte } from './auth-form-fields';

export function NouveauMotDePasseForm() {
  const [etat, action, enCours] = useActionState<AuthActionState, FormData>(
    definirMotDePasseAction,
    ETAT_INITIAL,
  );

  const erreursChamps = etat.statut === 'erreur' ? etat.erreursChamps : {};

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {etat.statut === 'erreur' ? <MessageAlerte message={etat.message} /> : null}

      <ChampTexte
        nom="motDePasse"
        label="Nouveau mot de passe"
        type="password"
        autoComplete="new-password"
        erreurs={erreursChamps.motDePasse}
        aide={`Au moins ${MIN_PASSWORD_LENGTH} caractères, avec une minuscule, une majuscule et un chiffre.`}
      />
      <ChampTexte
        nom="confirmation"
        label="Confirmer le mot de passe"
        type="password"
        autoComplete="new-password"
        erreurs={erreursChamps.confirmation}
      />

      <BoutonSoumettre enCours={enCours} libelle="Enregistrer le mot de passe" />
    </form>
  );
}
