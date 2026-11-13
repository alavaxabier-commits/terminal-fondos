-- Bandas relativas (% del peso de cada fondo) además de en puntos, y revisión de la banda cada día o solo al final de
-- cada mes, trimestre, semestre o año (la simulación es de la web: web/src/calculo/metricas.ts, simularCartera).
alter table fondos.cartera drop constraint cartera_banda_check;
alter table fondos.cartera add constraint cartera_banda_check check (banda > 0 and banda <= 100);
alter table fondos.cartera
  add column banda_tipo text not null default 'puntos' check (banda_tipo in ('puntos', 'relativa')),
  add column revision text not null default 'diaria' check (revision in ('diaria', 'mensual', 'trimestral', 'semestral', 'anual'));
