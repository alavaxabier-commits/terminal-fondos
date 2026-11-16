-- Seguimiento: una sola lista de fondos vigilados. Sin estados (vigilando, candidato, descartado): un fondo que no
-- merece seguir sale de la lista. Todos los seguidos tienen precios diarios.
create or replace view fondos.fondo_diario with (security_invoker = true) as
select cf.isin from fondos.cartera_fondo cf join fondos.cartera c on c.id = cf.cartera_id where not c.archivada
union select isin from fondos.seguimiento
union select proxy_isin as isin from fondos.indice where proxy_isin is not null;

alter table fondos.seguimiento drop column estado;
