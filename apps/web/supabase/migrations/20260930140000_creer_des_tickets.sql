-- SV-020 — Créer un lot de tickets en une seule transaction.
--
-- `create_tickets` (serveur MCP) pousse plusieurs tickets à la fois, chacun avec
-- ses patterns suggérés et, s'il réunit la Definition of Ready, sa publication.
-- Enchaîner ces écritures par PostgREST laisserait un lot à moitié créé au
-- premier refus : des brouillons sans pattern, que personne n'a demandés sous
-- cette forme. Une fonction s'exécute dans une seule transaction — tout le lot
-- ou rien.
--
-- POURQUOI `security invoker`
--
-- Contrairement à `reclamer_ticket` ou `soumettre_solution`, cette fonction
-- n'a besoin d'aucun droit que l'appelant n'a pas déjà : créer des tickets et
-- leur rattacher des patterns est permis au porteur du projet par les
-- politiques de SV-004. Elle s'exécute donc avec les droits de l'appelant, et
-- la RLS s'applique à chaque insertion exactement comme depuis l'application.
-- Un tiers qui l'appelle sur le projet d'autrui échoue sur la politique
-- d'insertion, sans qu'aucune règle d'autorisation ne soit réécrite ici.

create function public.creer_tickets(projet uuid, lot jsonb)
returns setof public.tickets
language plpgsql
security invoker
set search_path = ''
as $$
declare
  element jsonb;
  nouveau public.tickets;
  titre_normalise text;
  vus text[] := '{}';
begin
  if (select auth.uid()) is null then
    raise exception 'authentification_requise'
      using errcode = '42501';
  end if;

  if jsonb_typeof(lot) <> 'array' or jsonb_array_length(lot) = 0 then
    raise exception 'lot_vide'
      using errcode = '22023';
  end if;

  for element in select * from jsonb_array_elements(lot) loop
    titre_normalise := lower(trim(element ->> 'titre'));

    -- Un doublon — dans le lot, ou avec un ticket déjà présent — refuse tout le
    -- lot : confirmer deux fois la même proposition ne doit rien créer de plus.
    if titre_normalise = any (vus) or exists (
      select 1 from public.tickets t
      where t.projet_id = projet and lower(trim(t.titre)) = titre_normalise
    ) then
      raise exception 'doublon'
        using errcode = 'P0001',
              detail = element ->> 'titre',
              hint = 'Un ticket de ce titre existe déjà dans le projet ou dans le lot.';
    end if;
    vus := vus || titre_normalise;

    insert into public.tickets (
      projet_id, titre, contexte, criteres_acceptation, critere_test,
      complexite, priorite, source, score_confiance
    )
    values (
      projet,
      trim(element ->> 'titre'),
      nullif(trim(element ->> 'contexte'), ''),
      nullif(trim(element ->> 'criteres_acceptation'), ''),
      nullif(trim(element ->> 'critere_test'), ''),
      (element ->> 'complexite')::public.ticket_complexite,
      coalesce((element ->> 'priorite')::public.ticket_priorite, 'normale'),
      'scan_mcp',
      (element ->> 'score_confiance')::numeric
    )
    returning * into nouveau;

    insert into public.ticket_patterns (ticket_id, pattern_id, role)
    select nouveau.id, p::uuid, 'suggere'
    from jsonb_array_elements_text(coalesce(element -> 'patterns', '[]'::jsonb)) as p;

    if coalesce((element ->> 'publier')::boolean, false) then
      -- La contrainte `tickets_definition_of_ready` garde les colonnes ; le
      -- pattern suggéré vit dans une autre table et se vérifie ici, pour que la
      -- base refuse d'elle-même ce que l'outil aurait mal évalué.
      if jsonb_array_length(coalesce(element -> 'patterns', '[]'::jsonb)) = 0 then
        raise exception 'publication_sans_pattern'
          using errcode = 'P0001',
                detail = element ->> 'titre';
      end if;

      update public.tickets set statut = 'ouvert'
      where id = nouveau.id
      returning * into nouveau;
    end if;

    return next nouveau;
  end loop;
end;
$$;

comment on function public.creer_tickets(uuid, jsonb) is
  'Crée un lot de tickets (source scan_mcp) avec leurs patterns, et publie ceux qui le demandent — tout ou rien. Security invoker : la RLS du porteur s''applique (SV-020).';

revoke execute on function public.creer_tickets(uuid, jsonb) from public, anon;
grant execute on function public.creer_tickets(uuid, jsonb) to authenticated;
