-- SV-017 — Correctifs des avis de sécurité Supabase sur les fonctions.
--
-- Le linter du projet distant relevait deux familles d'avertissements. Cette
-- migration traite les deux, et consigne pourquoi deux fonctions restent
-- volontairement exécutables.

-- ---------------------------------------------------------------------------
-- 1. search_path fixé
-- ---------------------------------------------------------------------------

-- Une fonction sans search_path résout ses noms selon celui de l'appelant : un
-- rôle capable de créer un objet homonyme dans un schéma placé devant `public`
-- pourrait détourner l'appel. Les deux fonctions qualifient déjà tout ce
-- qu'elles touchent (`public.milestones`, `now()` vit dans `pg_catalog`, toujours
-- consulté), un search_path vide ne change donc rien à leur comportement.
alter function public.touch_maj_le() set search_path = '';
alter function public.verifier_jalon_meme_projet() set search_path = '';

-- ---------------------------------------------------------------------------
-- 2. Fonctions de trigger retirées de l'API
-- ---------------------------------------------------------------------------

-- Postgres accorde EXECUTE à `public` par défaut, et PostgREST publie toute
-- fonction du schéma `public` sous /rest/v1/rpc/. Une fonction de trigger
-- appelée ainsi échoue d'elle-même — elle n'a pas de ligne `new` —, mais rien ne
-- justifie de l'exposer : pour trois d'entre elles, qui sont `security definer`,
-- ce serait une porte vers des droits élevés que seule l'absence de `new` tient
-- fermée.
--
-- Le droit EXECUTE n'est pas vérifié quand Postgres déclenche un trigger : le
-- retirer ne change rien au déclenchement, seulement à l'appel direct.
revoke execute on function public.creer_profil_a_l_inscription() from public, anon, authenticated;
revoke execute on function public.verifier_absence_de_cycle() from public, anon, authenticated;
revoke execute on function public.verifier_dependance_meme_projet() from public, anon, authenticated;
revoke execute on function public.touch_maj_le() from public, anon, authenticated;
revoke execute on function public.verifier_jalon_meme_projet() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Deux fonctions laissées exécutables, en connaissance de cause
-- ---------------------------------------------------------------------------

-- `projet_est_public` et `est_proprietaire_du_projet` sont appelées par les
-- politiques RLS de tickets, jalons et dépendances : une politique s'évalue avec
-- les droits de l'appelant, anon compris, qui doit donc pouvoir les exécuter.
-- Les déplacer hors du schéma exposé obligerait à réécrire reclamer_ticket,
-- relacher_ticket et soumettre_solution, qui les appellent par leur nom.
--
-- L'avertissement du linter est accepté parce que ni l'une ni l'autre ne
-- révèle quoi que ce soit que la RLS ne rende déjà lisible : la première
-- répond « faux » pour un brouillon comme pour un identifiant inexistant, la
-- seconde ne renseigne l'appelant que sur ses propres projets.
comment on function public.projet_est_public(uuid) is
  'Utilisée par les politiques RLS, donc exécutable par anon. Ne distingue pas un brouillon d’un identifiant inexistant (SV-017).';
comment on function public.est_proprietaire_du_projet(uuid) is
  'Utilisée par les politiques RLS, donc exécutable par anon. Ne renseigne l’appelant que sur ses propres projets (SV-017).';
