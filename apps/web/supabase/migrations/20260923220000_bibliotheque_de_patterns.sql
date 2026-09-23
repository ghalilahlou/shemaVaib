-- SV-008 — Bibliothèque de patterns de vibe coding (section 5.2).
--
-- Pourquoi une migration et non `seed.sql` : le fichier de seed n'est joué que
-- par `supabase db reset` en local, il n'atteint jamais un projet distant. Or la
-- Definition of Ready (section 5.1) exige au moins un pattern suggéré : une base
-- sans patterns n'autorise la publication d'aucun ticket. Ce référentiel doit
-- donc exister partout où le schéma existe, et suivre le même cycle de vie.
--
-- L'insertion est idempotente : rejouer la migration sur une base déjà peuplée
-- met à jour les libellés sans dupliquer les lignes ni casser les tickets qui
-- référencent déjà un pattern.
--
-- Huit patterns, et non sept comme l'annonce la ligne SV-008 de la section 22 :
-- `Regression Radius` a été ajouté à la section 5.2 par la veille de la
-- section 25 (journal, v0.6), après la rédaction du backlog.

insert into public.patterns (nom, categorie, principe, cas_usage)
values
  (
    'Spec-First',
    'planification',
    'Rédiger un mini cahier des charges avant de prompter',
    'Tickets complexes ou multi-fichiers'
  ),
  (
    'Modular Prompting',
    'planification',
    'Découper feature par feature',
    'Toute construction incrémentale'
  ),
  (
    'Test-Gated Iteration',
    'qualite',
    'Écrire les tests avant, laisser l''IA itérer dessus',
    'Logique métier critique'
  ),
  (
    'Context Anchoring',
    'execution',
    'Attacher les fichiers et le contexte pertinents avant de prompter',
    'Codebase existante'
  ),
  (
    'Review-Refine Loop',
    'revue',
    'Diff, puis revue humaine, puis reprompt ciblé',
    'Toujours'
  ),
  (
    'Guardrail Prompting',
    'securite',
    'Contraintes de sécurité embarquées dans le prompt',
    'Authentification, paiement, données sensibles'
  ),
  (
    'Multi-Agent Orchestration',
    'orchestration',
    'Un agent spécification, un agent codeur, un agent relecteur',
    'Projets volumineux'
  ),
  (
    'Regression Radius',
    'qualite',
    'Identifier et retester les zones adjacentes à la modification, pas seulement le périmètre du ticket',
    'Toute codebase au-delà de quelques centaines de lignes'
  )
on conflict (nom) do update
set
  categorie = excluded.categorie,
  principe = excluded.principe,
  cas_usage = excluded.cas_usage;
