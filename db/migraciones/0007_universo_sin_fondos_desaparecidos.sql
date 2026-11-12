-- Los fondos que ya no aparecen en el buscador (liquidados, fusionados, dados de baja en España) salen del universo:
-- su ficha deja de actualizarse cada domingo y a los 14 días ya no cuenta.
create or replace function fondos.marcar_universo(min_patrimonio_meur numeric default 50, min_anos int default 3, tope int default 100)
returns int
language sql set search_path = '' as $$
  with clase as (
    select distinct on (coalesce(fund_id, isin)) isin, categoria, patrimonio_meur
    from fondos.fondo
    where categoria is not null
      and patrimonio_meur >= min_patrimonio_meur
      and fecha_lanzamiento <= current_date - make_interval(years => min_anos)
      and actualizado_en > now() - interval '14 days'   -- sigue en Morningstar (los fondos liquidados dejan de aparecer)
    order by coalesce(fund_id, isin),
             (divisa = 'EUR') desc nulls last,
             (nombre ~* '(acc|acum|accumulation|capitalisation|thes)\M') desc,
             (nombre ~* '(dis|dist|distribution|inc|income)\M') asc,
             ter asc nulls last, isin),
  dentro as (
    select isin from (
      select isin, row_number() over (partition by categoria order by patrimonio_meur desc, isin) as puesto
      from clase) x
    where puesto <= tope)
  update fondos.fondo f set en_universo = (f.isin in (select isin from dentro))
  where f.en_universo is distinct from (f.isin in (select isin from dentro));
  select count(*)::int from fondos.fondo where en_universo;
$$;
