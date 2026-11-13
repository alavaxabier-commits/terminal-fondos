-- Rebalanceo por bandas: la cartera vuelve a sus pesos el día que algún fondo se aleja de su peso objetivo más de
-- `banda` puntos (la simulación es de la web: web/src/calculo/metricas.ts, simularCartera).
alter table fondos.cartera drop constraint cartera_rebalanceo_check;
alter table fondos.cartera add constraint cartera_rebalanceo_check
  check (rebalanceo in ('mensual', 'trimestral', 'semestral', 'anual', 'bandas', 'ninguno'));
alter table fondos.cartera add column banda numeric not null default 5 check (banda > 0 and banda <= 50);
