-- SV-009 — Jalons, dépendances entre tickets, progression et santé.
--
-- POURQUOI UNE VUE ET NON UNE COLONNE
--
-- La santé d'un jalon dépend du *temps écoulé* depuis sa dernière activité : un
-- jalon inactif doit basculer « à risque » au bout de sept jours alors que rien
-- ne s'est produit. Une colonne mise à jour par trigger resterait donc figée sur
-- la dernière écriture, et il faudrait un travail planifié pour la rafraîchir —
-- c'est-à-dire une seconde source de vérité à tenir cohérente avec la première.
--
-- Calculer à la lecture supprime aussi, par construction, toute question de
-- concurrence : il n'existe aucun agrégat stocké sur lequel deux écritures
-- simultanées pourraient se marcher dessus.
--
-- La colonne `milestones.sante` posée en SV-002 a été retirée de cette
-- migration, aucune écriture ne l'alimentant encore.

-- ---------------------------------------------------------------------------
-- Dépendances entre tickets (section 11)
-- ---------------------------------------------------------------------------

create table public.ticket_dependencies (
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  bloque_par_id uuid not null references public.tickets (id) on delete cascade,
  cree_le timestamptz not null default now(),
  primary key (ticket_id, bloque_par_id),
  constraint ticket_dependencies_pas_de_boucle_directe check (ticket_id <> bloque_par_id)
);

comment on table public.ticket_dependencies is
  '« ticket_id est bloqué par bloque_par_id ». La relation inverse — débloque — se lit dans l''autre sens (SV-009).';

create index ticket_dependencies_bloque_par_idx
  on public.ticket_dependencies (bloque_par_id);

-- Deux tickets liés par une dépendance appartiennent au même projet : une
-- roadmap ne se construit pas à cheval sur plusieurs projets.
create function public.verifier_dependance_meme_projet()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  projet_du_ticket uuid;
  projet_du_bloqueur uuid;
begin
  select projet_id into projet_du_ticket from public.tickets where id = new.ticket_id;
  select projet_id into projet_du_bloqueur from public.tickets where id = new.bloque_par_id;

  if projet_du_ticket is distinct from projet_du_bloqueur then
    raise exception 'dependance_projets_differents'
      using errcode = 'P0001',
            hint = 'Les deux tickets d''une dépendance doivent appartenir au même projet.';
  end if;

  return new;
end;
$$;

create trigger ticket_dependencies_meme_projet
  before insert or update on public.ticket_dependencies
  for each row execute function public.verifier_dependance_meme_projet();

-- Un cycle de dépendances rendrait la roadmap insoluble : plus aucun ticket du
-- cycle ne pourrait jamais être débloqué. Le refus est immédiat, à l'insertion.
create function public.verifier_absence_de_cycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Part du bloqueur et remonte la chaîne : si l'on retombe sur le ticket
  -- bloqué, la dépendance qu'on tente de créer fermerait la boucle.
  if exists (
    with recursive chaine as (
      select new.bloque_par_id as ticket
      union
      select d.bloque_par_id
      from public.ticket_dependencies d
      join chaine c on d.ticket_id = c.ticket
    )
    select 1 from chaine where ticket = new.ticket_id
  ) then
    raise exception 'dependance_cyclique'
      using errcode = 'P0001',
            hint = 'Cette dépendance fermerait une boucle : le ticket se bloquerait lui-même.';
  end if;

  return new;
end;
$$;

create trigger ticket_dependencies_sans_cycle
  before insert or update on public.ticket_dependencies
  for each row execute function public.verifier_absence_de_cycle();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.ticket_dependencies enable row level security;

-- Un jalon suit la visibilité de son projet, comme les tickets.
create policy milestones_lecture_publique
  on public.milestones
  for select
  to anon, authenticated
  using (public.projet_est_public(projet_id));

create policy milestones_lecture_par_le_proprietaire
  on public.milestones
  for select
  to authenticated
  using (public.est_proprietaire_du_projet(projet_id));

create policy milestones_creation_par_le_proprietaire
  on public.milestones
  for insert
  to authenticated
  with check (public.est_proprietaire_du_projet(projet_id));

create policy milestones_maj_par_le_proprietaire
  on public.milestones
  for update
  to authenticated
  using (public.est_proprietaire_du_projet(projet_id))
  with check (public.est_proprietaire_du_projet(projet_id));

create policy milestones_suppression_par_le_proprietaire
  on public.milestones
  for delete
  to authenticated
  using (public.est_proprietaire_du_projet(projet_id));

-- Une dépendance se lit dès lors que les deux tickets qu'elle relie sont
-- visibles ; les sous-requêtes sont soumises aux politiques de `tickets`.
create policy ticket_dependencies_lecture
  on public.ticket_dependencies
  for select
  to anon, authenticated
  using (
    exists (select 1 from public.tickets where id = ticket_id)
    and exists (select 1 from public.tickets where id = bloque_par_id)
  );

create policy ticket_dependencies_ecriture_par_le_proprietaire
  on public.ticket_dependencies
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.tickets
      where id = ticket_id and public.est_proprietaire_du_projet(projet_id)
    )
  );

create policy ticket_dependencies_suppression_par_le_proprietaire
  on public.ticket_dependencies
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.tickets
      where id = ticket_id and public.est_proprietaire_du_projet(projet_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Progression et santé (section 11)
-- ---------------------------------------------------------------------------

-- Définition opérationnelle retenue, et les deux points qu'elle a fallu
-- trancher :
--
--   * « tickets restants » désigne les tickets qui n'ont pas atteint « soumis ».
--     L'ordre de l'énumération `ticket_statut` sert de comparateur : brouillon,
--     ouvert, réclamé viennent avant ; soumis, en revue, fusionné, fermé après.
--
--   * le rythme réel est donné en tickets sur sept jours, le rythme requis en
--     tickets par jour. Les deux sont ramenés à la même unité — tickets par
--     jour — avant d'être comparés, sans quoi la comparaison n'aurait pas de
--     sens.
create view public.jalons_avec_sante
with (security_invoker = on)
as
with agregats as (
  select
    m.id as jalon_id,
    count(t.id) as tickets_total,
    count(t.id) filter (where t.statut >= 'soumis') as tickets_acheves,
    count(t.id) filter (where t.statut < 'soumis') as tickets_restants,
    count(t.id) filter (where t.maj_le >= now() - interval '7 days') as changements_7j,
    max(t.maj_le) as derniere_activite
  from public.milestones m
  left join public.tickets t on t.jalon_id = m.id
  group by m.id
),
calculs as (
  select
    m.*,
    a.tickets_total,
    a.tickets_acheves,
    a.tickets_restants,
    a.changements_7j,
    a.derniere_activite,
    case
      when a.derniere_activite is null then null
      else floor(extract(epoch from (now() - a.derniere_activite)) / 86400)::int
    end as jours_inactivite,
    a.changements_7j / 7.0 as rythme_reel,
    case
      when m.date_cible is null or a.tickets_restants = 0 then null
      -- Une échéance fixée au jour même laisse zéro jour : on compte un jour
      -- plancher plutôt que de diviser par zéro.
      else a.tickets_restants::numeric / greatest((m.date_cible - current_date), 1)
    end as rythme_requis
  from public.milestones m
  join agregats a on a.jalon_id = m.id
)
select
  c.id,
  c.projet_id,
  c.theme,
  c.date_cible,
  c.cree_le,
  c.maj_le,
  c.tickets_total,
  c.tickets_acheves,
  c.tickets_restants,
  c.jours_inactivite,
  case
    when c.tickets_total = 0 then 0
    else round(100.0 * c.tickets_acheves / c.tickets_total)::int
  end as progression,
  (
    case
      -- Rien à faire, ou tout est fait : le jalon est à jour.
      when c.tickets_total = 0 or c.tickets_restants = 0 then 'a_jour'
      when c.date_cible is null then
        case
          when c.jours_inactivite >= 14 then 'bloque'
          when c.jours_inactivite >= 7 then 'a_risque'
          else 'a_jour'
        end
      else
        case
          -- Échéance dépassée alors qu'il reste du travail.
          when c.date_cible < current_date then 'bloque'
          when c.jours_inactivite >= 14 then 'bloque'
          when c.rythme_reel < c.rythme_requis / 2 then 'a_risque'
          else 'a_jour'
        end
    end
  )::public.jalon_sante as sante
from calculs c;

comment on view public.jalons_avec_sante is
  'Jalons enrichis de leur progression et de leur santé, calculées à la lecture (SV-009).';
