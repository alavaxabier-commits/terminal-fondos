-- El Financial Times como tercera fuente (solo actualizaciones: publica el último mes).
alter table fondos.valor_liquidativo drop constraint valor_liquidativo_fuente_check;
alter table fondos.valor_liquidativo add constraint valor_liquidativo_fuente_check check (fuente in ('morningstar', 'yahoo', 'ft'));
