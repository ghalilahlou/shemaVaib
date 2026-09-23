-- SV-010 — Messagerie : politiques de visibilité et diffusion temps réel.
--
-- La table `messages` et sa contrainte « un projet ou un ticket, jamais les deux
-- ni aucun des deux » existent depuis SV-002. Ce ticket ouvre l'accès.
--
-- QUI LIT QUOI
--
-- Un message suit exactement la visibilité de ce qui le porte (section 9) : un
-- message de canal projet est visible si le projet l'est, un message de fil de
-- ticket si le ticket l'est. Les sous-requêtes ci-dessous étant soumises aux
-- politiques de `projects` et `tickets`, cette règle se déduit de celles déjà
-- écrites plutôt que d'être réinventée — et elle suivra automatiquement leurs
-- évolutions.
--
-- QUI ÉCRIT
--
-- Tout utilisateur authentifié qui voit le projet ou le ticket peut y écrire.
-- Il n'existe pas encore de notion de membre ou de collaborateur : l'introduire
-- ici, à la va-vite, figerait un modèle d'appartenance que rien n'a encore
-- éprouvé.
--
-- Aucune politique de modification ni de suppression : un message envoyé reste
-- tel quel, ce qui est hors du périmètre de ce ticket. Sans politique, la RLS
-- refuse par défaut — l'absence est ici la protection.

-- ---------------------------------------------------------------------------
-- Lecture
-- ---------------------------------------------------------------------------

create policy messages_lecture
  on public.messages
  for select
  to anon, authenticated
  using (
    (projet_id is not null and exists (select 1 from public.projects where id = projet_id))
    or (ticket_id is not null and exists (select 1 from public.tickets where id = ticket_id))
  );

-- ---------------------------------------------------------------------------
-- Écriture
-- ---------------------------------------------------------------------------

create policy messages_ecriture
  on public.messages
  for insert
  to authenticated
  with check (
    -- On n'écrit que sous son propre nom : `auteur_id` n'est pas une donnée
    -- libre, c'est une signature.
    auteur_id = (select auth.uid())
    and (
      (projet_id is not null and exists (select 1 from public.projects where id = projet_id))
      or (ticket_id is not null and exists (select 1 from public.tickets where id = ticket_id))
    )
  );

-- ---------------------------------------------------------------------------
-- Diffusion temps réel
-- ---------------------------------------------------------------------------

-- Un fil de discussion qui n'avance qu'au rechargement n'est pas un fil. Comme
-- pour le pulse (SV-007), Realtime applique les politiques ci-dessus à chaque
-- abonné avant de lui pousser une ligne : un visiteur ne reçoit rien d'un
-- projet ou d'un ticket qu'il ne peut pas voir.
alter publication supabase_realtime add table public.messages;
