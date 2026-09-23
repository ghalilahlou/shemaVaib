-- SV-001 — Création automatique du profil public à l'inscription.
--
-- `public.users` porte le profil (nom, XP, Vibe Score) et `auth.users` porte
-- l'identité. Sans lien automatique entre les deux, un compte fraîchement créé
-- n'aurait pas de profil, et la moindre écriture référençant `users.id` — créer
-- un projet, réclamer un ticket — échouerait sur une clé étrangère.
--
-- Le passage par un trigger plutôt que par le code applicatif est délibéré :
-- l'inscription peut arriver par le formulaire, par un magic link ou par un
-- fournisseur OAuth, et aucun de ces chemins ne doit pouvoir l'oublier.

create function public.creer_profil_a_l_inscription()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, nom)
  values (
    new.id,
    -- `nom` vient du formulaire d'inscription ; les fournisseurs OAuth
    -- renseignent plutôt `user_name` ou `full_name`. À défaut, la partie locale
    -- de l'adresse fait un nom d'attente acceptable, que l'utilisateur pourra
    -- corriger depuis son profil.
    left(
      coalesce(
        nullif(trim(new.raw_user_meta_data ->> 'nom'), ''),
        nullif(trim(new.raw_user_meta_data ->> 'user_name'), ''),
        nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
        nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
        'Nouveau contributeur'
      ),
      80
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

comment on function public.creer_profil_a_l_inscription() is
  'Crée la ligne public.users correspondant à un compte auth.users nouvellement inscrit (SV-001).';

create trigger creer_profil_a_l_inscription
  after insert on auth.users
  for each row execute function public.creer_profil_a_l_inscription();
