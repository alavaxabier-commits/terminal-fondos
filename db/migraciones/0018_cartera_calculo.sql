-- Cálculo de cada cartera modelo (lo escribe `python -m fondos metricas` junto con `metrica`): la cartera simulada con
-- su rebalanceo, sus métricas frente a la combinación de las referencias de sus fondos, años naturales, crisis,
-- aportación y peso de hoy de cada fondo y correlaciones. Una fila por cartera.
create table fondos.cartera_calculo (
  cartera_id   bigint primary key references fondos.cartera(id) on delete cascade,
  datos        jsonb not null,
  calculada_en timestamptz not null default now()
);

alter table fondos.cartera_calculo enable row level security;
revoke all on fondos.cartera_calculo from anon, authenticated;
grant select on fondos.cartera_calculo to authenticated;
create policy propietario_lee on fondos.cartera_calculo for select to authenticated using ((select fondos.es_propietario()));
