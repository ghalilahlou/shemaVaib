-- SV-006 — Soumettre une solution à un ticket réclamé.
--
-- Applique les deux conventions de la section 18 promues après SV-005 : une
-- fonction `security definer` dédiée plutôt qu'une politique `UPDATE`
-- permissive, et une condition d'état attendu dans la clause `where`.
--
-- LE CAS ORPHELIN, ET POURQUOI IL EST TRAITÉ PLUTÔT QUE DOCUMENTÉ
--
-- Un relâchement concurrent d'une soumission pourrait laisser une soumission
-- rattachée à un ticket redevenu « ouvert » — donc une trace de travail sur un
-- ticket que plus personne ne tient. C'est peu fréquent, mais la protection est
-- ici gratuite : la transition d'état est de toute façon nécessaire, il suffit
-- de la placer AVANT l'insertion et d'en faire la garde.
--
-- L'ordre compte. Si la mise à jour ne trouve aucune ligne — parce que le ticket
-- vient d'être relâché — la fonction lève et l'insertion n'a jamais lieu. Dans
-- l'autre sens, le relâchement concurrent verra un ticket déjà passé à
-- « soumis » et sera refusé. Les deux ordres d'arrivée sont couverts, sans
-- verrou explicite ni transaction sérialisable.

-- ---------------------------------------------------------------------------
-- Soumettre
-- ---------------------------------------------------------------------------

create function public.soumettre_solution(
  ticket uuid,
  diff_url text,
  preview_url text,
  resume_md text default null
)
returns public.submissions
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat public.submissions;
  ticket_maj public.tickets;
  utilisateur uuid := (select auth.uid());
begin
  if utilisateur is null then
    raise exception 'authentification_requise'
      using errcode = '42501';
  end if;

  if coalesce(trim(diff_url), '') = '' or coalesce(trim(preview_url), '') = '' then
    raise exception 'liens_requis'
      using errcode = '22023',
            hint = 'Le lien du diff et celui de l''aperçu sont tous deux obligatoires.';
  end if;

  -- La transition d'état sert de garde. `reclame` couvre la première
  -- soumission ; `soumis` autorise les suivantes, parce que la boucle
  -- Review-Refine (section 5.2) suppose qu'on repasse plusieurs fois. Dans les
  -- deux cas, c'est le réclamant courant qui soumet, et lui seul.
  update public.tickets
  set statut = 'soumis'
  where id = ticket
    and statut in ('reclame', 'soumis')
    and reclame_par = utilisateur
  returning * into ticket_maj;

  if not found then
    raise exception 'ticket_non_soumettable'
      using errcode = 'P0001',
            hint = 'Le ticket doit être réclamé par vous pour recevoir une soumission.';
  end if;

  insert into public.submissions (ticket_id, auteur_id, diff_url, preview_url, resume_md)
  values (
    ticket,
    utilisateur,
    trim(diff_url),
    trim(preview_url),
    -- `resultat_qualite` garde sa valeur par défaut « en_attente » : aucune
    -- porte de qualité automatisée n'existe encore (section 5.6), et ce n'est
    -- pas à ce ticket de la construire.
    nullif(trim(coalesce(resume_md, '')), '')
  )
  returning * into resultat;

  return resultat;
end;
$$;

comment on function public.soumettre_solution(uuid, text, text, text) is
  'Rattache une soumission à un ticket réclamé par l''utilisateur courant et passe le ticket en « soumis » (SV-006).';

-- ---------------------------------------------------------------------------
-- Relâcher un ticket déjà soumis
-- ---------------------------------------------------------------------------

-- Sans cette extension, un ticket soumis puis abandonné resterait bloqué —
-- exactement le problème que le relâchement de SV-005 était censé écarter.
-- Les soumissions déjà rattachées sont conservées : elles font partie de
-- l'historique des tentatives (section 5.1).
create or replace function public.relacher_ticket(ticket uuid)
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
    and statut in ('reclame', 'soumis')
    and (reclame_par = utilisateur or public.est_proprietaire_du_projet(projet_id))
  returning * into resultat;

  if not found then
    raise exception 'ticket_non_relachable'
      using errcode = 'P0001',
            hint = 'Le ticket doit être réclamé ou soumis, et vous devez en être le réclamant ou porter le projet.';
  end if;

  return resultat;
end;
$$;

-- ---------------------------------------------------------------------------
-- Visibilité des soumissions
-- ---------------------------------------------------------------------------

-- Une soumission suit exactement la visibilité du ticket qui la porte
-- (section 9) : la sous-requête est soumise aux politiques de `tickets`, donc un
-- ticket invisible n'expose pas ses soumissions.
create policy submissions_lecture
  on public.submissions
  for select
  to anon, authenticated
  using (exists (select 1 from public.tickets where id = ticket_id));

-- Aucune politique d'écriture : les soumissions n'entrent que par
-- `soumettre_solution`, ce qui garantit qu'aucune ne peut exister sans la
-- transition d'état qui l'accompagne.

revoke execute on function public.soumettre_solution(uuid, text, text, text) from public, anon;
grant execute on function public.soumettre_solution(uuid, text, text, text) to authenticated;
