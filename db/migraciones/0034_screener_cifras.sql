-- Screener: cifras que se enseñan (no entran en la nota), con su valor y su percentil en la categoría: volatilidad y
-- Sharpe a 3 años, y el rendimiento reciente de los monetarios (1, 2 y 3 meses, 12 meses, diferencial con el €STR,
-- tendencia y meses negativos). {'ventana|nombre': [valor, percentil]}.
create or replace view fondos.screener with (security_invoker = true) as
select f.isin, f.nombre, f.categoria, f.divisa, f.ter, f.srri, f.gestion, f.patrimonio_meur, f.fecha_lanzamiento,
       mi.isin is not null as myinvestor,
       (select jsonb_object_agg(m.ventana || '|' || m.nombre, m.percentil) from fondos.metrica m
        where m.isin = f.isin and m.percentil is not null
          and ((m.ventana in ('1a', '3a', '5a', '10a')
                and m.nombre in ('sharpe', 'sortino', 'max_caida', 'captura_bajista', 'rentabilidad', 'tracking_error',
                                 'ratio_informacion'))
               or (m.ventana, m.nombre) in (('hist', 'consistencia'), ('hoy', 'ter')))) as pct,
       (select m.valor from fondos.metrica m where m.isin = f.isin and m.ventana = '5a' and m.nombre = 'rentabilidad') as r5,
       (select m.valor from fondos.metrica m where m.isin = f.isin and m.ventana = '3a' and m.nombre = 'rentabilidad') as r3,
       (select jsonb_object_agg(m.ventana || '|' || m.nombre, jsonb_build_array(m.valor, m.percentil)) from fondos.metrica m
        where m.isin = f.isin
          and (m.ventana, m.nombre) in (('3a', 'volatilidad'), ('3a', 'sharpe'), ('1a', 'rentabilidad'),
                                        ('1m', 'rentabilidad'), ('2m', 'rentabilidad'), ('3m', 'rentabilidad'),
                                        ('3m', 'diferencial_estr'), ('hoy', 'tendencia'), ('12m', 'meses_negativos'))) as cifras
from fondos.fondo f
left join fondos.myinvestor mi on mi.isin = f.isin and mi.abierto
where f.en_universo;
