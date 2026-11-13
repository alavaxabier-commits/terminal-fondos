-- Las carteras se calculan en la web (web/src/calculo/cartera.ts): la tabla de 0018 ya no se usa.
-- Aplicada a mano por Xabier en el editor SQL (las migraciones destructivas piden una confirmación que aquí no sale).
drop table if exists fondos.cartera_calculo;
