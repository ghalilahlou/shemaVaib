-- SV-014 — Jetons d'accès personnels, pour que le serveur MCP ait une identité.
--
-- 1. POURQUOI UNE IDENTITÉ ET NON DES PRIVILÈGES
--
-- Les trois outils d'écriture de la section 8 — create_tickets, claim_ticket,
-- submit_solution — doivent agir au nom de quelqu'un. Toute l'autorisation de
-- la plateforme repose sur la Row Level Security et sur auth.uid() : confier au
-- serveur MCP la clé `service_role` reviendrait à contourner d'un seul geste
-- toutes les politiques écrites depuis SV-003, et à rendre indistinguables les
-- actions de chacun. Le jeton ne porte donc aucun droit propre ; il désigne un
-- compte, et la session qu'il ouvre voit exactement ce que ce compte voit.
--
-- 2. POURQUOI UNE EMPREINTE ET NON LE JETON
--
-- Le secret n'est montré qu'une fois, à sa création, et seule son empreinte
-- SHA-256 est conservée. Une base lue par un tiers ne livre alors aucun jeton
-- utilisable. C'est aussi ce qui rend la colonne consultable par son porteur
-- sans risque : une empreinte ne se rejoue pas.
--
-- 3. POURQUOI AUCUNE POLITIQUE D'ÉCRITURE
--
-- Créer un jeton impose `utilisateur_id`, et le révoquer ne doit toucher que
-- `revoque_le`. Une politique RLS autorise une ligne entière, pas un
-- sous-ensemble de colonnes (convention posée en SV-005) : les deux opérations
-- passent donc par des fonctions dédiées, et l'absence de politique INSERT,
-- UPDATE ou DELETE est ici la protection — elle est testée comme telle.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table public.api_tokens (
  id uuid primary key default gen_random_uuid(),
  utilisateur_id uuid not null references public.users (id) on delete cascade,
  -- Sert à reconnaître le poste ou l'outil auquel le jeton a été confié.
  libelle text not null check (char_length(btrim(libelle)) between 1 and 80),
  -- SHA-256 en hexadécimal minuscule du jeton complet.
  empreinte text not null unique check (empreinte ~ '^[0-9a-f]{64}$'),
  cree_le timestamptz not null default now(),
  -- Renseigné à chaque échange réussi : c'est le seul moyen de repérer un jeton
  -- oublié sur une machine dont on ne se sert plus.
  dernier_usage_le timestamptz,
  revoque_le timestamptz
);

create index api_tokens_utilisateur_id_idx on public.api_tokens (utilisateur_id);

comment on table public.api_tokens is
  'Jetons personnels échangés par le serveur MCP contre une session courte (SV-014).';

alter table public.api_tokens enable row level security;

-- Chacun voit ses jetons, et personne ne voit ceux d'autrui. Aucune politique
-- d'écriture : voir le point 3 de l'en-tête.
create policy "Lecture de ses propres jetons"
  on public.api_tokens
  for select
  to authenticated
  using ((select auth.uid()) = utilisateur_id);

-- ---------------------------------------------------------------------------
-- Création
-- ---------------------------------------------------------------------------

-- Le secret est engendré côté applicatif ; la base n'en reçoit que l'empreinte
-- et ne peut donc jamais le divulguer, pas même dans ses journaux.
create function public.creer_jeton_api(p_libelle text, p_empreinte text)
returns public.api_tokens
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat public.api_tokens;
  utilisateur uuid := (select auth.uid());
  actifs integer;
begin
  if utilisateur is null then
    raise exception 'authentification_requise'
      using errcode = '42501';
  end if;

  -- Un plafond évite qu'un compte accumule sans fin des jetons dont plus
  -- personne ne sait où ils sont ; il force à révoquer avant d'émettre.
  select count(*) into actifs
  from public.api_tokens
  where utilisateur_id = utilisateur
    and revoque_le is null;

  if actifs >= 10 then
    raise exception 'trop_de_jetons'
      using errcode = 'P0001',
            hint = 'Révoquez un jeton existant avant d''en créer un nouveau.';
  end if;

  insert into public.api_tokens (utilisateur_id, libelle, empreinte)
  values (utilisateur, btrim(p_libelle), p_empreinte)
  returning * into resultat;

  return resultat;
end;
$$;

comment on function public.creer_jeton_api(text, text) is
  'Enregistre un jeton personnel pour l''utilisateur courant, à partir de son empreinte (SV-014).';

-- ---------------------------------------------------------------------------
-- Révocation
-- ---------------------------------------------------------------------------

create function public.revoquer_jeton_api(p_jeton uuid)
returns public.api_tokens
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat public.api_tokens;
  utilisateur uuid := (select auth.uid());
begin
  if utilisateur is null then
    raise exception 'authentification_requise'
      using errcode = '42501';
  end if;

  update public.api_tokens
  set revoque_le = now()
  where id = p_jeton
    -- `security definer` contourne la RLS : l'appartenance est revérifiée ici.
    and utilisateur_id = utilisateur
    -- Compare-and-swap : révoquer deux fois ne doit pas repousser la date, qui
    -- sert de preuve du moment où l'accès a été fermé.
    and revoque_le is null
  returning * into resultat;

  if not found then
    raise exception 'jeton_non_revocable'
      using errcode = 'P0001',
            hint = 'Le jeton doit vous appartenir et ne pas être déjà révoqué.';
  end if;

  return resultat;
end;
$$;

comment on function public.revoquer_jeton_api(uuid) is
  'Révoque un jeton personnel appartenant à l''utilisateur courant (SV-014).';

-- ---------------------------------------------------------------------------
-- Droits d'exécution
-- ---------------------------------------------------------------------------

revoke execute on function public.creer_jeton_api(text, text) from public, anon;
revoke execute on function public.revoquer_jeton_api(uuid) from public, anon;

grant execute on function public.creer_jeton_api(text, text) to authenticated;
grant execute on function public.revoquer_jeton_api(uuid) to authenticated;
