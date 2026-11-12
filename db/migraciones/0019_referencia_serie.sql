-- Las carteras modelo se calculan en la web (se editan y se ven al momento). Para la referencia de cada fondo la web lee
-- estas series ya hechas, que escribe `python -m fondos metricas` con las de los fondos: semanal (para los periodos, como
-- las métricas de los fondos) y de cierre de mes (para los años naturales). Una fila por índice o media de categoría.
create table fondos.referencia_serie (
  clave          text primary key,      -- 'indice:<id>' o 'media:<categoría>' (como en fondos/calculo.py)
  semanas        date[] not null,       -- lunes de cada semana ISO
  valores_semana float8[] not null,
  meses          date[] not null,       -- día 1 de cada mes
  valores_mes    float8[] not null,
  calculada_en   timestamptz not null default now()
);

alter table fondos.referencia_serie enable row level security;
revoke all on fondos.referencia_serie from anon, authenticated;
grant select on fondos.referencia_serie to authenticated;
create policy propietario_lee on fondos.referencia_serie for select to authenticated using ((select fondos.es_propietario()));
