-- Bloque Diversificación del screener: correlación media de cada fondo del universo con los fondos de cada cartera
-- (3 años, semanal) y percentil de 1 − correlación en su categoría. La escribe `metricas` cada día; diversificacion_base
-- guarda con qué fondos se calculó cada cartera, para que la web avise si la cartera ha cambiado desde entonces.
create table fondos.diversificacion (
  cartera_id  bigint not null references fondos.cartera(id) on delete cascade,
  isin        text not null references fondos.fondo(isin) on delete cascade,
  correlacion numeric(5,4) not null,
  percentil   numeric(4,1),
  primary key (cartera_id, isin)
);
create table fondos.diversificacion_base (
  cartera_id   bigint primary key references fondos.cartera(id) on delete cascade,
  isins        text[] not null,
  calculada_en timestamptz not null default now()
);
alter table fondos.diversificacion enable row level security;
alter table fondos.diversificacion_base enable row level security;
revoke all on fondos.diversificacion, fondos.diversificacion_base from anon, authenticated;
grant select on fondos.diversificacion, fondos.diversificacion_base to authenticated;
create policy propietario_lee on fondos.diversificacion for select to authenticated using ((select fondos.es_propietario()));
create policy propietario_lee on fondos.diversificacion_base for select to authenticated using ((select fondos.es_propietario()));
