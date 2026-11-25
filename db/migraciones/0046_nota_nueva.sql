-- Nota nueva: los bloques (0–100) los calcula Python y los guarda en metrica (ventana 'nota' y 'nota_<plazo>'); la vista
-- del screener los pasa en `pct` para que la web solo pondere. El perfil «Por defecto» pasa a los pesos nuevos.
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
               or (m.ventana = '12m' and m.nombre = 'meses_negativos'))) as cifras
from fondos.fondo f
left join fondos.myinvestor mi on mi.isin = f.isin and mi.abierto
where f.en_universo;

update fondos.perfil_screener set pesos = jsonb_build_object(
  'renta variable', '{"coste": 45, "proteccion": 20, "consistencia": 15, "riesgo": 5, "rentabilidad": 5, "gestor": 5, "tamano": 5, "tir": 0, "diversificacion": 10}'::jsonb,
  'renta fija',     '{"coste": 45, "proteccion": 20, "consistencia": 15, "riesgo": 5, "rentabilidad": 5, "gestor": 5, "tamano": 5, "tir": 0, "diversificacion": 10}'::jsonb,
  'mixto',          '{"coste": 45, "proteccion": 20, "consistencia": 15, "riesgo": 5, "rentabilidad": 5, "gestor": 5, "tamano": 5, "tir": 0, "diversificacion": 10}'::jsonb,
  'otros',          '{"coste": 45, "proteccion": 20, "consistencia": 15, "riesgo": 5, "rentabilidad": 5, "gestor": 5, "tamano": 5, "tir": 0, "diversificacion": 10}'::jsonb,
  'monetario',      '{"coste": 40, "proteccion": 20, "consistencia": 10, "riesgo": 20, "rentabilidad": 10, "gestor": 0, "tamano": 0, "tir": 0, "diversificacion": 10}'::jsonb)
where nombre = 'Por defecto';
