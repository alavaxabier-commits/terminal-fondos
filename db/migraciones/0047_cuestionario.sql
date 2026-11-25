-- Cuestionario (nota 1–100): Python guarda en metrica, ventana 'cuestionario', los puntos de cada pregunta (p1…p9),
-- puntos, posibles, plazo y nota (`cuestionario` en fondos/nucleo/metricas.py). La vista del screener lo pasa en
-- `cuestionario` ({nombre: valor}); la web solo lo lee (web/src/calculo/cuestionario.ts).
create or replace view fondos.screener with (security_invoker = true) as
select f.isin, f.nombre, f.categoria, f.divisa, f.ter, f.srri, f.gestion, f.patrimonio_meur, f.fecha_lanzamiento,
       mi.isin is not null as myinvestor,
       (select jsonb_object_agg(m.ventana || '|' || m.nombre, m.percentil)
        from fondos.metrica m
        where m.isin = f.isin and m.percentil is not null
          and ((m.ventana = any (array['1a', '3a', '5a', '10a'])
                and m.nombre = any (array['sharpe', 'sortino', 'max_caida', 'captura_bajista', 'rentabilidad', 'tracking_error',
                                          'ratio_informacion', 'diferencia_seguimiento']))
               or (m.ventana = 'hist' and m.nombre = 'consistencia')
               or (m.ventana = 'hoy' and m.nombre = 'ter')
               or (m.ventana = '13s' and m.nombre = 'rentabilidad')
               or (m.ventana = 'hoy' and m.nombre = 'tir_neta')
               or m.ventana = any (array['nota', 'nota_1a', 'nota_3a', 'nota_5a', 'nota_10a']))) as pct,
       (select m.valor from fondos.metrica m where m.isin = f.isin and m.ventana = '5a' and m.nombre = 'rentabilidad') as r5,
       (select m.valor from fondos.metrica m where m.isin = f.isin and m.ventana = '3a' and m.nombre = 'rentabilidad') as r3,
       (select jsonb_object_agg(m.ventana || '|' || m.nombre, jsonb_build_array(m.valor, m.percentil))
        from fondos.metrica m
        where m.isin = f.isin
          and ((m.ventana = any (array['1a', '3a', '5a', '10a']) and m.nombre = any (array['rentabilidad', 'volatilidad', 'sharpe', 'max_caida']))
               or (m.ventana = any (array['1m', '2m', '3m']) and m.nombre = any (array['rentabilidad', 'diferencial_estr']))
               or (m.ventana = '12m' and m.nombre = 'meses_negativos'))) as cifras,
       (select jsonb_object_agg(m.nombre, m.valor) from fondos.metrica m
        where m.isin = f.isin and m.ventana = 'cuestionario') as cuestionario
from fondos.fondo f
left join fondos.myinvestor mi on mi.isin = f.isin and mi.abierto
where f.en_universo;
