-- Índice de referencia elegido para una cartera (null: la referencia de cada fondo combinada con sus pesos).
-- Lo cambia la web con un update directo (la tabla ya tiene RLS del propietario); guardar_cartera no lo toca.
alter table fondos.cartera add column referencia text references fondos.indice(id) on delete set null;
