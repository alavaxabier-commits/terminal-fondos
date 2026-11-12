-- Percentil de cada métrica dentro de la categoría del fondo (0 = peor, 100 = mejor; null si no aplica).
alter table fondos.metrica add column percentil numeric(5,1);
alter table fondos.metrica alter column valor type double precision using valor::double precision;
