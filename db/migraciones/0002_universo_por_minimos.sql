-- Universo del screener por mínimos en lugar de «top N»: el screener decide qué es bueno,
-- el universo solo quita ruido (fondos diminutos o sin historia suficiente).
-- Una clase por fondo (en EUR si la hay, y la de menor TER); como mucho `tope` por categoría, los de más patrimonio.
drop function if exists fondos.marcar_universo(int);

create function fondos.marcar_universo(min_patrimonio_meur numeric default 50, min_anos int default 3, tope int default 100)
returns int
language sql set search_path = '' as $$
  with clase as (
    select distinct on (coalesce(fund_id, isin)) isin, categoria, patrimonio_meur
    from fondos.fondo
    where categoria is not null
      and patrimonio_meur >= min_patrimonio_meur
      and fecha_lanzamiento <= current_date - make_interval(years => min_anos)
    order by coalesce(fund_id, isin), (divisa = 'EUR') desc nulls last, ter asc nulls last, isin),
  dentro as (
    select isin from (
      select isin, row_number() over (partition by categoria order by patrimonio_meur desc, isin) as puesto
      from clase) x
    where puesto <= tope)
  update fondos.fondo f set en_universo = (f.isin in (select isin from dentro))
  where f.en_universo is distinct from (f.isin in (select isin from dentro));
  select count(*)::int from fondos.fondo where en_universo;
$$;
revoke execute on function fondos.marcar_universo(numeric, int, int) from public;
