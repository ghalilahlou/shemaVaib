-- SV-003 — Politiques Row Level Security pour les projets.
--
-- La migration initiale avait activé la RLS sans ouvrir de politique sur
-- `projects` : la table était donc close pour tout le monde sauf `service_role`.
-- Ce ticket expose le CRUD Projets, il doit donc dire précisément qui voit quoi.
--
-- Deux principes, tirés du cahier des charges :
--   - un projet vivant est visible (section 5.4, dashboard pulse) ;
--   - c'est le porteur qui décide de ce qu'il ouvre publiquement (section 13),
--     ce que traduit ici le statut « brouillon », qui reste privé.

-- ---------------------------------------------------------------------------
-- users : le profil est public par construction (section 9)
-- ---------------------------------------------------------------------------

-- Nom, XP et Vibe Score alimentent les leaderboards de la section 5.5 : ce sont
-- des données publiques. L'identité — e-mail, mot de passe, fournisseur OAuth —
-- reste dans auth.users, qui n'est pas exposé.
create policy users_lecture_publique
  on public.users
  for select
  to anon, authenticated
  using (true);

-- La politique users_lecture_de_son_profil de la migration initiale devient
-- redondante : deux politiques SELECT permissives se cumulent en OR.
drop policy users_lecture_de_son_profil on public.users;

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------

-- Un projet qui a quitté le brouillon est visible de tous, connecté ou non.
create policy projects_lecture_publique
  on public.projects
  for select
  to anon, authenticated
  using (statut <> 'brouillon');

-- Le porteur voit ses propres projets, brouillons compris.
create policy projects_lecture_par_le_proprietaire
  on public.projects
  for select
  to authenticated
  using ((select auth.uid()) = proprietaire_id);

-- On ne crée un projet que pour soi : `with check` empêche de désigner un autre
-- porteur que soi-même.
create policy projects_creation_par_le_proprietaire
  on public.projects
  for insert
  to authenticated
  with check ((select auth.uid()) = proprietaire_id);

-- La double clause interdit aussi bien de modifier le projet d'autrui que de
-- transférer le sien à quelqu'un d'autre par un update.
create policy projects_maj_par_le_proprietaire
  on public.projects
  for update
  to authenticated
  using ((select auth.uid()) = proprietaire_id)
  with check ((select auth.uid()) = proprietaire_id);

create policy projects_suppression_par_le_proprietaire
  on public.projects
  for delete
  to authenticated
  using ((select auth.uid()) = proprietaire_id);
