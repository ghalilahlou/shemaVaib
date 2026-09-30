-- SV-021 — Un utilisateur ne modifie que son nom.
--
-- LA FAILLE
--
-- La migration initiale posait `users_maj_de_son_profil` : chacun pouvait
-- mettre à jour sa propre ligne `public.users`. Une politique RLS autorise ou
-- refuse une ligne entière, pas des colonnes — la politique ouvrait donc aussi
-- `xp` et `vibe_score`. Un simple
--
--   update users set xp = 999999, vibe_score = 100 where id = auth.uid()
--
-- passait sans erreur : n'importe quel compte pouvait s'attribuer sa propre
-- réputation, ce que la gamification de la section 5.5 suppose impossible.
--
-- LE CORRECTIF
--
-- C'est la convention « mutations à colonnes restreintes » de la section 18 :
-- la politique `UPDATE` disparaît, et le seul changement légitime — le nom —
-- passe par une fonction `security definer` qui n'expose que lui. `xp` et
-- `vibe_score` ne s'écrivent plus que côté serveur, par le rôle de service.
--
-- L'absence de politique d'écriture est désormais la protection ; elle est
-- couverte par un test qui tente l'écriture et constate qu'elle n'a rien changé.

drop policy users_maj_de_son_profil on public.users;

create function public.modifier_mon_nom(nom text)
returns public.users
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat public.users;
  utilisateur uuid := (select auth.uid());
begin
  if utilisateur is null then
    raise exception 'authentification_requise'
      using errcode = '42501';
  end if;

  -- La contrainte de colonne (1 à 80 caractères après trim) reste l'arbitre :
  -- un nom invalide échoue sur elle, avec son propre message.
  update public.users
  set nom = trim(modifier_mon_nom.nom)
  where id = utilisateur
  returning * into resultat;

  if not found then
    raise exception 'profil_introuvable'
      using errcode = 'P0001';
  end if;

  return resultat;
end;
$$;

comment on function public.modifier_mon_nom(text) is
  'Change le nom public de l''utilisateur courant, et rien d''autre : xp et vibe_score restent hors de sa portée (SV-021).';

revoke execute on function public.modifier_mon_nom(text) from public, anon;
grant execute on function public.modifier_mon_nom(text) to authenticated;
