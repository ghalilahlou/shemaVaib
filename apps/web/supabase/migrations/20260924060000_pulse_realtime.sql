-- SV-007 — Publication Realtime des tickets et des soumissions.
--
-- Le dashboard pulse (section 5.4) s'abonne à ces deux tables pour afficher
-- l'activité sans interroger le serveur en boucle (section 20).
--
-- POURQUOI PAS DE TABLE D'ÉVÉNEMENTS
--
-- Les événements affichés — changement de statut d'un ticket, nouvelle
-- soumission — se déduisent des lignes elles-mêmes : le statut courant d'un
-- ticket et sa date de mise à jour d'un côté, la date de création d'une
-- soumission de l'autre. Un journal d'événements dédié serait une seconde
-- source de vérité à tenir cohérente avec la première, pour un gain nul à ce
-- stade. Il deviendra justifié le jour où le pulse devra montrer l'historique
-- complet des transitions, et non l'état courant — ce qui relève du graphe de
-- vitalité, hors périmètre de ce ticket.
--
-- CE QUI EST ENVOYÉ, ET À QUI
--
-- Realtime applique les politiques RLS de chaque abonné avant de lui pousser
-- une ligne : un visiteur anonyme ne reçoit donc rien d'un ticket en brouillon
-- ou d'un projet non publié, exactement comme au chargement de la page. Le
-- filtrage côté navigateur n'est qu'un confort d'affichage, jamais une barrière
-- de confidentialité.

alter publication supabase_realtime add table public.tickets;
alter publication supabase_realtime add table public.submissions;

-- `replica identity full` fait porter à l'événement l'ancienne version de la
-- ligne en plus de la nouvelle. Sans elle, une mise à jour n'expose que les
-- colonnes de la clé primaire côté `old`, et le pulse ne pourrait pas dire
-- *depuis quel* statut un ticket a changé.
alter table public.tickets replica identity full;
