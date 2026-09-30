'use client';

import { useActionState } from 'react';
import { modifierNomAction } from '../actions/modifier-nom';
import { ETAT_INITIAL_PROFIL, type ProfilActionState } from '../actions/profil-action-state';
import {
  BoutonSoumettre,
  ChampTexte,
  MessageAlerte,
  MessageSucces,
} from '../../auth/components/auth-form-fields';

export function NomForm({ nomActuel }: { nomActuel: string }) {
  const [etat, action, enCours] = useActionState<ProfilActionState, FormData>(
    modifierNomAction,
    ETAT_INITIAL_PROFIL,
  );

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {etat.statut === 'erreur' ? <MessageAlerte message={etat.message} /> : null}
      {etat.statut === 'succes' ? <MessageSucces message={etat.message} /> : null}

      <ChampTexte
        nom="nom"
        label="Nom public"
        autoComplete="name"
        valeurInitiale={nomActuel}
        aide="C’est ce nom que voient les autres contributeurs."
      />

      <BoutonSoumettre enCours={enCours} libelle="Enregistrer" />
    </form>
  );
}
