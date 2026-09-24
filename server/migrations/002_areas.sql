-- 002: visibilidade por área. Usada pelas políticas das tabelas com área
-- (base de conhecimento, saídas de assistentes). Área nula = visível para todo o
-- tenant; admin do cliente (app.all_areas) vê todas; os demais, só as áreas em
-- que têm vínculo (app.area_ids).
create function app_can_see_area(p_area uuid) returns boolean language sql stable as
  $$ select p_area is null or app_all_areas() or p_area = any(app_area_ids()) $$;

grant execute on function app_can_see_area(uuid) to greenia_app;
