-- X-Ray: composición de la cartera de cada fondo (Morningstar, ficha de detalle «ITsnapshot»), una fila por fondo.
-- `datos` guarda los desgloses netos tal como los codifica Morningstar ({código: %}); los nombres los pone la web.
-- Sustituye a la tabla en formato largo de 0001, que nunca se llegó a usar (vacía).
drop table fondos.composicion;
create table fondos.composicion (
  isin          text primary key references fondos.fondo(isin) on delete cascade,
  fecha_cartera date,                       -- fecha de la cartera publicada (null: Morningstar no da desglose)
  datos         jsonb not null,
  descargada_en timestamptz not null default now()
);

-- Del buscador (sale con las fichas cada semana): lo que la ficha de detalle no trae
alter table fondos.fondo
  add column estilo_rv            smallint,  -- caja de estilo de renta variable, 1–9
  add column estilo_rf            smallint,  -- caja de estilo de renta fija, 1–9
  add column capitalizacion_media numeric,   -- millones, en la divisa de la cartera
  add column duracion_efectiva    numeric,   -- años
  add column vencimiento_efectivo numeric,   -- años
  add column calidad_media        text;      -- AAA … B, BB…

alter table fondos.composicion enable row level security;
revoke all on fondos.composicion from anon, authenticated;
grant select on fondos.composicion to authenticated;
create policy propietario_lee on fondos.composicion for select to authenticated using ((select fondos.es_propietario()));
