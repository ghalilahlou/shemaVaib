-- SV-006 — Ajout du statut « soumis » au cycle de vie d'un ticket.
--
-- Dans son propre fichier de migration, et non avec la fonction qui l'utilise :
-- une valeur d'énumération ajoutée ne peut pas être employée dans la même
-- transaction que son ajout. Les séparer évite d'en dépendre.
--
-- « soumis » se distingue de « en_revue » : un ticket est soumis dès qu'une
-- solution lui est rattachée, et n'entre en revue que lorsqu'une porte de
-- qualité ou un relecteur s'en saisit — ce qui n'existe pas encore (section 5.6).

alter type public.ticket_statut add value if not exists 'soumis' after 'reclame';
