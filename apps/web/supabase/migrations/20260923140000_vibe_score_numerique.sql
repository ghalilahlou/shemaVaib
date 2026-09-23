-- Correction du type de users.vibe_score : text -> numeric(5,2), échelle 0-100.
--
-- La section 9 du cahier des charges déclarait `string vibe_score`, ce que la
-- migration initiale avait suivi à la lettre. Or la section 16 décrit un score
-- composite (rapidité + qualité + revue par les pairs) : le stocker en texte
-- aurait faussé les tris et les leaderboards de la section 5.5.
--
-- Migration corrective plutôt que modification de la migration déjà appliquée :
-- l'historique reste rejouable à l'identique sur toute instance.
--
-- La colonne n'est encore alimentée par aucun code : la conversion ne peut donc
-- perdre aucune donnée. `nullif(trim(...), '')` couvre malgré tout le cas d'une
-- chaîne vide qui aurait été insérée à la main.

alter table public.users
  alter column vibe_score type numeric(5, 2)
  using nullif(trim(vibe_score), '')::numeric;

-- Le score reste NULL tant qu'aucun calcul n'a eu lieu : un contributeur sans
-- historique n'a pas un score de zéro, il n'a pas encore de score.
alter table public.users
  add constraint users_vibe_score_echelle check (vibe_score between 0 and 100);

comment on column public.users.vibe_score is
  'Score composite rapidité + qualité + revue par les pairs (section 16), sur une échelle de 0 à 100. NULL tant qu''aucun calcul n''a eu lieu.';
