-- Ficha (pestaña Métricas): cómo se reparte cada métrica en la categoría del fondo, para situarlo frente a ella.
-- Misma regla que los percentiles (fondos/calculo.py, percentiles_categoria): fondos del universo de la categoría, una
-- clase por fondo (la de menor TER). Cuantiles 10, 25, 50, 75 y 90. Solo lee: security invoker, con la RLS de metrica.
create or replace function fondos.distribucion_categoria(p_categoria text)
returns table (ventana text, nombre text, n integer, cuantiles numeric[])
language sql stable security invoker set search_path = '' as $$
  with clases as (
    select distinct on (coalesce(f.fund_id, f.isin)) f.isin
    from fondos.fondo f
    where f.en_universo and f.categoria = p_categoria
    order by coalesce(f.fund_id, f.isin), f.ter is null, f.ter, f.isin
  )
  select m.ventana, m.nombre, count(*)::integer,
         (select array_agg(round(x::numeric, 6)) from unnest(
           percentile_cont(array[0.1, 0.25, 0.5, 0.75, 0.9]) within group (order by m.valor)) x)
  from fondos.metrica m join clases c using (isin)
  group by m.ventana, m.nombre
$$;
revoke all on function fondos.distribucion_categoria(text) from public, anon;
grant execute on function fondos.distribucion_categoria(text) to authenticated;

-- Novedades de los fondos (Inicio y ficha): umbrales, editables en Revisión como los de las señales.
insert into fondos.ajuste (clave, valor, descripcion) values
  ('novedad_salidas_pct',     10, 'Novedad «salidas fuertes»: salidas netas de al menos este % del patrimonio en 3 meses'),
  ('novedad_entradas_pct',    25, 'Novedad «entradas fuertes»: entradas netas de al menos este % del patrimonio en 3 meses'),
  ('novedad_patrimonio_meur', 50, 'Novedad «patrimonio bajo»: patrimonio del fondo por debajo de estos millones'),
  ('novedad_dias',            30, 'Novedades en Inicio: cambios de gestor de los últimos estos días')
on conflict (clave) do nothing;
