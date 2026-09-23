-- SV-005 — Réclamer et relâcher un ticket.
--
-- Deux décisions de conception, l'une et l'autre motivées par ce qu'une simple
-- politique RLS ne sait pas faire.
--
-- 1. POURQUOI DES FONCTIONS PLUTÔT QU'UNE POLITIQUE `UPDATE` PERMISSIVE
--
-- Une politique RLS autorise ou refuse une ligne entière : elle ne sait pas
-- restreindre les colonnes modifiées. Ouvrir `UPDATE` sur `tickets` aux
-- contributeurs pour qu'ils puissent les réclamer leur permettrait du même coup
-- d'en réécrire le titre, le contexte ou les critères d'acceptation. Ces deux
-- fonctions exposent donc exactement une opération chacune, et la politique
-- d'écriture de SV-004 reste réservée au porteur du projet.
--
-- 2. POURQUOI UN COMPARE-AND-SWAP ET NON UN UPDATE SUR L'IDENTIFIANT SEUL
--
-- Deux contributeurs peuvent réclamer le même ticket au même instant. Un
-- `update ... where id = ?` laisserait passer les deux : le second écraserait
-- simplement le premier réclamant, sans que personne ne s'en aperçoive.
--
-- La condition porte donc aussi sur l'état attendu — `statut = 'ouvert'` et
-- `reclame_par is null`. En lecture validée (READ COMMITTED), la seconde
-- transaction attend le verrou de la première, puis réévalue sa clause `where`
-- sur la ligne telle qu'elle vient d'être modifiée : le statut y vaut désormais
-- « reclame », la condition est fausse, aucune ligne n'est touchée. Le second
-- appelant reçoit une erreur explicite au lieu d'un succès mensonger.

-- ---------------------------------------------------------------------------
-- Réclamer
-- ---------------------------------------------------------------------------

create function public.reclamer_ticket(ticket uuid)
returns public.tickets
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat public.tickets;
  utilisateur uuid := (select auth.uid());
begin
  if utilisateur is null then
    raise exception 'authentification_requise'
      using errcode = '42501';
  end if;

  update public.tickets
  set
    statut = 'reclame',
    reclame_par = utilisateur,
    reclame_le = now()
  where id = ticket
    -- Compare-and-swap : l'état attendu fait partie de la condition.
    and statut = 'ouvert'
    and reclame_par is null
    -- `security definer` contourne la RLS : la visibilité doit donc être
    -- revérifiée ici. Un ticket rattaché à un projet encore en brouillon n'est
    -- pas public, il n'est pas réclamable.
    and public.projet_est_public(projet_id)
  returning * into resultat;

  if not found then
    raise exception 'ticket_non_reclamable'
      using errcode = 'P0001',
            hint = 'Le ticket doit être ouvert, public et non déjà réclamé.';
  end if;

  return resultat;
end;
$$;

comment on function public.reclamer_ticket(uuid) is
  'Réclame un ticket ouvert pour l''utilisateur courant. Compare-and-swap : une seule réclamation aboutit (SV-005).';

-- ---------------------------------------------------------------------------
-- Relâcher
-- ---------------------------------------------------------------------------

-- Sans cette opération, un ticket réclamé puis abandonné resterait bloqué
-- indéfiniment : personne d'autre ne pourrait le reprendre.
create function public.relacher_ticket(ticket uuid)
returns public.tickets
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat public.tickets;
  utilisateur uuid := (select auth.uid());
begin
  if utilisateur is null then
    raise exception 'authentification_requise'
      using errcode = '42501';
  end if;

  update public.tickets
  set
    statut = 'ouvert',
    reclame_par = null,
    reclame_le = null
  where id = ticket
    and statut = 'reclame'
    -- Le réclamant se désiste lui-même ; le porteur du projet peut le faire à
    -- sa place, ce qui est la seule façon de débloquer un ticket abandonné.
    and (reclame_par = utilisateur or public.est_proprietaire_du_projet(projet_id))
  returning * into resultat;

  if not found then
    raise exception 'ticket_non_relachable'
      using errcode = 'P0001',
            hint = 'Le ticket doit être réclamé, et vous devez en être le réclamant ou porter le projet.';
  end if;

  return resultat;
end;
$$;

comment on function public.relacher_ticket(uuid) is
  'Relâche un ticket réclamé, par son réclamant ou par le porteur du projet (SV-005).';

-- ---------------------------------------------------------------------------
-- Droits d'exécution
-- ---------------------------------------------------------------------------

-- Une fonction est exécutable par tous par défaut. Ces deux-là étant
-- `security definer`, le retrait explicite du rôle anonyme est la seconde
-- barrière — la première étant le contrôle de `auth.uid()` dans le corps.
revoke execute on function public.reclamer_ticket(uuid) from public, anon;
revoke execute on function public.relacher_ticket(uuid) from public, anon;

grant execute on function public.reclamer_ticket(uuid) to authenticated;
grant execute on function public.relacher_ticket(uuid) to authenticated;
