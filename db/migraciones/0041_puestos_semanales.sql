-- Puesto de cada fondo en su categoría (por la nota guardada) en las últimas 8 semanas de nota_semanal: la «jornada» del
-- Screener (cambio de puesto de la semana y línea de puestos). Una sola llamada que devuelve {isin: {puestos, de}};
-- una vista paginada de 1.000 en 1.000 repetiría el cálculo (≈2 s) en cada página. Solo lee: security invoker, con RLS.
create or replace function fondos.puestos_semanales()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with semanas as (
    select distinct fecha from fondos.nota_semanal order by fecha desc limit 8
  ), r as (
    select n.isin, n.fecha,
           rank() over (partition by f.categoria, n.fecha order by n.nota desc)::int as puesto,
           count(*) over (partition by f.categoria, n.fecha)::int as de
    from fondos.nota_semanal n
    join semanas s using (fecha)
    join fondos.fondo f on f.isin = n.isin
    where f.categoria is not null
  ), u as (
    select isin, array_agg(puesto order by fecha) as puestos,
           array_agg(fecha order by fecha) as fechas,
           (array_agg(de order by fecha desc))[1] as de
    from r group by isin
  )
  select coalesce(jsonb_object_agg(isin, jsonb_build_object('puestos', puestos, 'fechas', fechas, 'de', de)), '{}'::jsonb) from u
$$;

revoke execute on function fondos.puestos_semanales() from public, anon;
grant execute on function fondos.puestos_semanales() to authenticated;
