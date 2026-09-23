-- SV-004 — Politiques Row Level Security pour les tickets.
--
-- Un ticket hérite de la visibilité de son projet : il ne sert à rien de rendre
-- public un ticket rattaché à un projet encore en brouillon. À cela s'ajoute la
-- même règle qu'au niveau du projet — le brouillon reste privé jusqu'à ce que
-- son porteur décide de l'ouvrir (sections 5.1 et 13).

-- ---------------------------------------------------------------------------
-- Appartenance
-- ---------------------------------------------------------------------------

-- Utilisée par plusieurs politiques : la factoriser évite de répéter la
-- sous-requête et d'y introduire un écart au fil des tickets suivants.
--
-- `security definer` pour que l'évaluation ne dépende pas des politiques de
-- `projects` : ici on veut savoir qui possède le projet, pas ce que l'appelant a
-- le droit d'en voir.
create function public.est_proprietaire_du_projet(projet uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects
    where id = projet
      and proprietaire_id = (select auth.uid())
  );
$$;

-- Un projet est publiquement visible dès qu'il a quitté le brouillon.
create function public.projet_est_public(projet uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects
    where id = projet
      and statut <> 'brouillon'
  );
$$;

-- ---------------------------------------------------------------------------
-- tickets
-- ---------------------------------------------------------------------------

-- Un ticket est public quand il a quitté le brouillon *et* que son projet est
-- lui-même public. Les deux conditions comptent : ouvrir un ticket ne doit pas
-- révéler un projet que son porteur n'a pas encore publié.
create policy tickets_lecture_publique
  on public.tickets
  for select
  to anon, authenticated
  using (statut <> 'brouillon' and public.projet_est_public(projet_id));

-- Le porteur du projet voit tous ses tickets, brouillons compris.
create policy tickets_lecture_par_le_proprietaire
  on public.tickets
  for select
  to authenticated
  using (public.est_proprietaire_du_projet(projet_id));

create policy tickets_creation_par_le_proprietaire
  on public.tickets
  for insert
  to authenticated
  with check (public.est_proprietaire_du_projet(projet_id));

create policy tickets_maj_par_le_proprietaire
  on public.tickets
  for update
  to authenticated
  using (public.est_proprietaire_du_projet(projet_id))
  with check (public.est_proprietaire_du_projet(projet_id));

create policy tickets_suppression_par_le_proprietaire
  on public.tickets
  for delete
  to authenticated
  using (public.est_proprietaire_du_projet(projet_id));

-- ---------------------------------------------------------------------------
-- ticket_patterns
-- ---------------------------------------------------------------------------

-- Le lien ticket/pattern suit exactement la visibilité du ticket : la
-- sous-requête est soumise aux politiques ci-dessus, donc un ticket invisible
-- n'expose pas ses patterns.
create policy ticket_patterns_lecture
  on public.ticket_patterns
  for select
  to anon, authenticated
  using (exists (select 1 from public.tickets where id = ticket_id));

create policy ticket_patterns_ecriture_par_le_proprietaire
  on public.ticket_patterns
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.tickets
      where id = ticket_id
        and public.est_proprietaire_du_projet(projet_id)
    )
  );

create policy ticket_patterns_suppression_par_le_proprietaire
  on public.ticket_patterns
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.tickets
      where id = ticket_id
        and public.est_proprietaire_du_projet(projet_id)
    )
  );
