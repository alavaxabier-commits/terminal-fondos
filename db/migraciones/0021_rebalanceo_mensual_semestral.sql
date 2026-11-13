-- Más periodos de rebalanceo para las carteras modelo: también mensual y semestral.
alter table fondos.cartera drop constraint cartera_rebalanceo_check;
alter table fondos.cartera add constraint cartera_rebalanceo_check
  check (rebalanceo in ('mensual', 'trimestral', 'semestral', 'anual', 'ninguno'));
