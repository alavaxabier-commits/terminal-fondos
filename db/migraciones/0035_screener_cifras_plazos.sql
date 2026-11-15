-- Screener: la tarjeta del fondo enseña volatilidad, Sharpe, caída máxima y rentabilidad al plazo de su nota (1, 3, 5 o
-- 10 años), y en los monetarios lo que rinde a 1, 2 y 3 meses frente al €STR: `cifras` las trae todas. Sin la
-- tendencia, que ya no se calcula.
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
          and ((m.ventana in ('1a', '3a', '5a', '10a') and m.nombre in ('rentabilidad', 'volatilidad', 'sharpe', 'max_caida'))
               or (m.ventana, m.nombre) in (('1m', 'rentabilidad'), ('2m', 'rentabilidad'), ('3m', 'rentabilidad'),
                                            ('1m', 'diferencial_estr'), ('2m', 'diferencial_estr'), ('3m', 'diferencial_estr'),
                                            ('12m', 'meses_negativos')))) as cifras
from fondos.fondo f
left join fondos.myinvestor mi on mi.isin = f.isin and mi.abierto
where f.en_universo;
