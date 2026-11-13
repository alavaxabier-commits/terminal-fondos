-- Screener: una fila por fondo del universo con los percentiles que usa la nota (los de la tabla metrica),
-- la rentabilidad a 5 y 3 años y si se puede comprar en MyInvestor. La web la lee entera y calcula la nota al momento.
create view fondos.screener with (security_invoker = true) as
select f.isin, f.nombre, f.categoria, f.divisa, f.ter, f.srri, f.gestion, f.patrimonio_meur, f.fecha_lanzamiento,
       mi.isin is not null as myinvestor,
       (select jsonb_object_agg(m.ventana || '|' || m.nombre, m.percentil) from fondos.metrica m
        where m.isin = f.isin and m.percentil is not null
          and (m.ventana, m.nombre) in (('5a', 'sharpe'), ('5a', 'sortino'), ('3a', 'sharpe'), ('3a', 'sortino'),
                                        ('5a', 'max_caida'), ('3a', 'max_caida'), ('5a', 'captura_bajista'),
                                        ('5a', 'rentabilidad'), ('3a', 'rentabilidad'), ('5a', 'tracking_error'),
                                        ('3a', 'tracking_error'), ('3a', 'ratio_informacion'), ('hist', 'consistencia'),
                                        ('hoy', 'ter'))) as pct,
       (select m.valor from fondos.metrica m where m.isin = f.isin and m.ventana = '5a' and m.nombre = 'rentabilidad') as r5,
       (select m.valor from fondos.metrica m where m.isin = f.isin and m.ventana = '3a' and m.nombre = 'rentabilidad') as r3
from fondos.fondo f
left join fondos.myinvestor mi on mi.isin = f.isin and mi.abierto
where f.en_universo;
grant select on fondos.screener to authenticated;
