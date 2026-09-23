-- SV-002 — Schéma de données initial
--
-- Traduit le modèle de données logique de la section 9 du cahier des charges :
-- users, projects, milestones, tickets, submissions, messages, patterns, plus la
-- table de liaison ticket_patterns qui porte la relation many-to-many
-- « TICKETS }o--o{ PATTERNS ».
--
-- Conventions (section 19) : snake_case, tables au pluriel, noms de colonnes en
-- français comme dans le diagramme entité-relation.

-- ---------------------------------------------------------------------------
-- Types énumérés
-- ---------------------------------------------------------------------------

-- Cycle de vie d'un projet.
create type public.projet_statut as enum ('brouillon', 'actif', 'en_pause', 'archive');

-- Indicateur de santé d'un jalon, recalculé automatiquement (section 11).
create type public.jalon_sante as enum ('a_jour', 'a_risque', 'bloque');

-- Cycle de vie d'un ticket (section 10). Un ticket naît en brouillon et ne
-- passe « ouvert » qu'une fois la Definition of Ready satisfaite (section 5.1).
create type public.ticket_statut as enum (
  'brouillon',
  'ouvert',
  'reclame',
  'en_revue',
  'fusionne',
  'ferme'
);

-- Origine d'un ticket (section 10 : création manuelle, scan IDE, découverte).
create type public.ticket_source as enum (
  'manuel',
  'scan_mcp',
  'decouverte_github',
  'genere_ia'
);

create type public.ticket_priorite as enum ('basse', 'normale', 'haute', 'critique');

-- Complexité estimée, imposée par la Definition of Ready (section 5.1).
create type public.ticket_complexite as enum ('S', 'M', 'L');

-- Un pattern est soit suggéré à la création du ticket, soit tagué comme
-- réellement utilisé une fois le ticket résolu (section 5.2).
create type public.ticket_pattern_role as enum ('suggere', 'utilise');

-- Résultat de la porte de qualité automatisée (section 5.6).
create type public.soumission_resultat as enum ('en_attente', 'succes', 'echec');

-- ---------------------------------------------------------------------------
-- Horodatage partagé
-- ---------------------------------------------------------------------------

-- Met à jour maj_le à chaque UPDATE. Attachée à toutes les tables qui portent
-- cette colonne, pour qu'aucune couche applicative n'ait à y penser.
create function public.touch_maj_le()
returns trigger
language plpgsql
as $$
begin
  new.maj_le = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------

-- Profil public adossé à auth.users, qui reste la source de vérité de
-- l'identité. Le parcours d'inscription et de connexion est le ticket SV-001.
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  nom text not null check (length(trim(nom)) between 1 and 80),
  xp integer not null default 0 check (xp >= 0),
  vibe_score text,
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now()
);

comment on table public.users is
  'Profil public d''un utilisateur. L''identité vit dans auth.users.';

comment on column public.users.vibe_score is
  'Score composite rapidité + qualité + revue par les pairs (section 16).';

create trigger users_touch_maj_le
  before update on public.users
  for each row execute function public.touch_maj_le();

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  proprietaire_id uuid not null references public.users (id) on delete cascade,
  nom text not null check (length(trim(nom)) between 1 and 120),
  repo_url text,
  statut public.projet_statut not null default 'brouillon',
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now()
);

create index projects_proprietaire_id_idx on public.projects (proprietaire_id);
create index projects_statut_idx on public.projects (statut);

create trigger projects_touch_maj_le
  before update on public.projects
  for each row execute function public.touch_maj_le();

-- ---------------------------------------------------------------------------
-- milestones
-- ---------------------------------------------------------------------------

-- Un jalon est un thème, pas une date (section 11) : date_cible reste optionnelle.
--
-- La santé du jalon n'est pas une colonne : elle dépend du temps écoulé depuis
-- la dernière activité, donc une valeur stockée deviendrait fausse sans
-- qu'aucune écriture n'ait lieu. Elle est calculée à la lecture par la vue
-- `jalons_avec_sante` (SV-009).
create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  projet_id uuid not null references public.projects (id) on delete cascade,
  theme text not null check (length(trim(theme)) between 1 and 120),
  date_cible date,
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now()
);

create index milestones_projet_id_idx on public.milestones (projet_id);

create trigger milestones_touch_maj_le
  before update on public.milestones
  for each row execute function public.touch_maj_le();

-- ---------------------------------------------------------------------------
-- tickets
-- ---------------------------------------------------------------------------

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  projet_id uuid not null references public.projects (id) on delete cascade,
  jalon_id uuid references public.milestones (id) on delete set null,
  reclame_par uuid references public.users (id) on delete set null,
  titre text not null check (length(trim(titre)) between 1 and 160),
  contexte text,
  criteres_acceptation text,
  critere_test text,
  complexite public.ticket_complexite,
  statut public.ticket_statut not null default 'brouillon',
  source public.ticket_source not null default 'manuel',
  priorite public.ticket_priorite not null default 'normale',
  score_confiance numeric(3, 2) check (score_confiance between 0 and 1),
  reclame_le timestamptz,
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now(),

  -- Definition of Ready (section 5.1) : un ticket ne quitte le brouillon que si
  -- contexte, critères d'acceptation, critère de test et complexité sont
  -- renseignés. L'exigence « au moins un pattern suggéré » porte sur une autre
  -- table et est vérifiée au-dessus, au ticket SV-004.
  constraint tickets_definition_of_ready check (
    statut = 'brouillon'
    or (
      length(trim(coalesce(contexte, ''))) > 0
      and length(trim(coalesce(criteres_acceptation, ''))) > 0
      and length(trim(coalesce(critere_test, ''))) > 0
      and complexite is not null
    )
  ),

  -- Un ticket généré automatiquement affiche son score de confiance (section 5.1).
  constraint tickets_score_confiance_si_genere check (
    source <> 'genere_ia' or score_confiance is not null
  ),

  -- Un ticket réclamé a forcément un réclamant et une date de réclamation (SV-005).
  constraint tickets_reclamation_coherente check (
    (reclame_par is null) = (reclame_le is null)
  )
);

create index tickets_projet_id_idx on public.tickets (projet_id);
create index tickets_jalon_id_idx on public.tickets (jalon_id);
create index tickets_reclame_par_idx on public.tickets (reclame_par);
create index tickets_statut_idx on public.tickets (statut);

create trigger tickets_touch_maj_le
  before update on public.tickets
  for each row execute function public.touch_maj_le();

-- Un jalon et son ticket doivent appartenir au même projet.
create function public.verifier_jalon_meme_projet()
returns trigger
language plpgsql
as $$
declare
  projet_du_jalon uuid;
begin
  if new.jalon_id is null then
    return new;
  end if;

  select projet_id into projet_du_jalon
  from public.milestones
  where id = new.jalon_id;

  if projet_du_jalon is distinct from new.projet_id then
    raise exception 'Le jalon % appartient a un autre projet que le ticket', new.jalon_id;
  end if;

  return new;
end;
$$;

create trigger tickets_jalon_meme_projet
  before insert or update of jalon_id, projet_id on public.tickets
  for each row execute function public.verifier_jalon_meme_projet();

-- ---------------------------------------------------------------------------
-- submissions
-- ---------------------------------------------------------------------------

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  auteur_id uuid references public.users (id) on delete set null,
  diff_url text,
  preview_url text,
  resultat_qualite public.soumission_resultat not null default 'en_attente',
  resume_md text,
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now()
);

comment on column public.submissions.resume_md is
  'Résumé Markdown généré par submit_solution (section 8), stocké en base et jamais comme fichier du dépôt.';

create index submissions_ticket_id_idx on public.submissions (ticket_id);
create index submissions_auteur_id_idx on public.submissions (auteur_id);

create trigger submissions_touch_maj_le
  before update on public.submissions
  for each row execute function public.touch_maj_le();

-- ---------------------------------------------------------------------------
-- patterns
-- ---------------------------------------------------------------------------

-- Bibliothèque de patterns de vibe coding (section 5.2). Le seed des 8 patterns
-- documentés est le ticket SV-008.
create table public.patterns (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique check (length(trim(nom)) between 1 and 80),
  categorie text not null check (length(trim(categorie)) between 1 and 60),
  principe text,
  cas_usage text,
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now()
);

create trigger patterns_touch_maj_le
  before update on public.patterns
  for each row execute function public.touch_maj_le();

-- ---------------------------------------------------------------------------
-- ticket_patterns
-- ---------------------------------------------------------------------------

-- Porte la relation many-to-many entre tickets et patterns. Le rôle distingue
-- le pattern suggéré à la création de celui réellement utilisé à la résolution,
-- ce qui alimente la base de connaissance empirique de la section 5.2.
create table public.ticket_patterns (
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  pattern_id uuid not null references public.patterns (id) on delete cascade,
  role public.ticket_pattern_role not null default 'suggere',
  cree_le timestamptz not null default now(),
  primary key (ticket_id, pattern_id, role)
);

create index ticket_patterns_pattern_id_idx on public.ticket_patterns (pattern_id);

-- ---------------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------------

-- Un seul système, deux contextes (section 12) : un message est rattaché soit à
-- un projet (canal général), soit à un ticket (fil dédié), jamais aux deux.
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  projet_id uuid references public.projects (id) on delete cascade,
  ticket_id uuid references public.tickets (id) on delete cascade,
  auteur_id uuid references public.users (id) on delete set null,
  contenu text not null check (length(trim(contenu)) between 1 and 10000),
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now(),

  constraint messages_un_seul_contexte check (
    (projet_id is not null) <> (ticket_id is not null)
  )
);

create index messages_projet_id_idx on public.messages (projet_id, cree_le desc);
create index messages_ticket_id_idx on public.messages (ticket_id, cree_le desc);

create trigger messages_touch_maj_le
  before update on public.messages
  for each row execute function public.touch_maj_le();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

-- RLS activée sans exception : aucune table du schéma public n'est accessible
-- par défaut. C'est la position par défaut qu'impose la Vibe Security Gate
-- (section 5.6) et que motive la veille de la section 25. Les politiques fines
-- par rôle accompagnent les tickets qui exposent réellement chaque entité
-- (SV-003 pour les projets, SV-004 pour les tickets, etc.) ; la clé
-- service_role, utilisée côté serveur et dans les tests, n'y est pas soumise.

alter table public.users enable row level security;
alter table public.projects enable row level security;
alter table public.milestones enable row level security;
alter table public.tickets enable row level security;
alter table public.submissions enable row level security;
alter table public.patterns enable row level security;
alter table public.ticket_patterns enable row level security;
alter table public.messages enable row level security;

-- Seule exception ouverte dès maintenant : la bibliothèque de patterns est un
-- référentiel public, en lecture seule pour tout le monde.
create policy patterns_lecture_publique
  on public.patterns
  for select
  to anon, authenticated
  using (true);

-- Chacun lit et met à jour son propre profil.
create policy users_lecture_de_son_profil
  on public.users
  for select
  to authenticated
  using ((select auth.uid()) = id);

create policy users_maj_de_son_profil
  on public.users
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
