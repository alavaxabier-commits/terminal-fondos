-- Historial para la nota futura (flujos de patrimonio, TIR) y gestora y equipo gestor.
-- - historial_patrimonio: patrimonio del fondo (FundTNAV, en millones de su divisa) cada domingo con `universo`, solo
--   cuando cambia; de ahí salen los flujos (variación de patrimonio menos la que explica la rentabilidad).
-- - historial_rf: estadísticas de renta fija de cada cartera publicada (con `composicion`): composicion se sobrescribe.
-- - fondo.gestores y cambio_gestor: equipo gestor de la ficha de detalle (con `composicion`); un cambio se apunta
--   cuando el equipo difiere del guardado (el primero que se guarda no cuenta como cambio).
alter table fondos.fondo add column gestores jsonb;  -- [{nombre, desde}] equipo actual

create table fondos.historial_patrimonio (
  fondo_id        integer not null references fondos.fondo(id) on delete cascade,
  fecha           date not null,
  patrimonio_meur numeric not null,
  primary key (fondo_id, fecha)
);

create table fondos.historial_rf (
  fondo_id      integer not null references fondos.fondo(id) on delete cascade,
  fecha_cartera date not null,
  tir           numeric,  -- YieldToMaturity, %
  rendimiento   numeric,  -- CurrentYield, %
  duracion      numeric,  -- ModifiedDuration, años
  vencimiento   numeric,  -- EffectiveMaturity, años
  calidad       text,     -- AverageCreditQualityCode
  primary key (fondo_id, fecha_cartera)
);

create table fondos.cambio_gestor (
  fondo_id integer not null references fondos.fondo(id) on delete cascade,
  fecha    date not null,
  entran   text[] not null default '{}',
  salen    text[] not null default '{}',
  primary key (fondo_id, fecha)
);

-- punto de partida: lo que ya hay
insert into fondos.historial_patrimonio (fondo_id, fecha, patrimonio_meur)
select id, current_date, patrimonio_meur from fondos.fondo
where patrimonio_meur is not null and (en_universo or isin in (select isin from fondos.fondo_diario));

insert into fondos.historial_rf (fondo_id, fecha_cartera, tir, rendimiento, duracion, vencimiento, calidad)
select f.id, c.fecha_cartera, (s->>'YieldToMaturity')::numeric, (s->>'CurrentYield')::numeric,
       (s->>'ModifiedDuration')::numeric, (s->>'EffectiveMaturity')::numeric, s->>'AverageCreditQualityCode'
from fondos.composicion c join fondos.fondo f using (isin), lateral (select c.datos->'estadisticas_rf' as s) x
where c.fecha_cartera is not null and jsonb_typeof(s) = 'object';

alter table fondos.historial_patrimonio enable row level security;
alter table fondos.historial_rf enable row level security;
alter table fondos.cambio_gestor enable row level security;
revoke all on fondos.historial_patrimonio, fondos.historial_rf, fondos.cambio_gestor from anon, authenticated;
grant select on fondos.historial_patrimonio, fondos.historial_rf, fondos.cambio_gestor to authenticated;
create policy propietario_lee on fondos.historial_patrimonio for select to authenticated using ((select fondos.es_propietario()));
create policy propietario_lee on fondos.historial_rf for select to authenticated using ((select fondos.es_propietario()));
create policy propietario_lee on fondos.cambio_gestor for select to authenticated using ((select fondos.es_propietario()));
