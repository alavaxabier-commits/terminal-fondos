-- Fuera del universo los fondos que llevan más de 120 días sin publicar valor (liquidados o fusionados que Morningstar
-- sigue listando). 120 y no 30: hay fondos vivos que publican una vez al trimestre (capital riesgo, inmobiliario…).
-- La fecha del último valor se guarda en la ficha porque, al salir, limpiar_valores borra sus precios: sin ella el
-- fondo volvería a entrar la semana siguiente con otra carga completa. Uno que nunca ha tenido precio sigue entrando.
alter table fondos.fondo add column ultimo_valor date;

create or replace function fondos.marcar_universo(min_patrimonio_meur numeric default 50, min_anos int default 3, tope int default 100,
                                                  max_minima numeric default 10000)
returns int
language sql set search_path = '' as $$
  update fondos.fondo f set ultimo_valor = u.ultima
  from (select distinct on (fondo_id) fondo_id, make_date(ano, 1, 1) + (select max(d) from unnest(dias) d) as ultima
        from fondos.valor_anual order by fondo_id, ano desc) u
  where u.fondo_id = f.id and f.ultimo_valor is distinct from u.ultima;

  with clase as (
    select distinct on (coalesce(fund_id, isin)) isin, categoria, patrimonio_meur
    from fondos.fondo
    where categoria is not null
      and patrimonio_meur >= min_patrimonio_meur
      and fecha_lanzamiento <= current_date - make_interval(years => min_anos)
      and actualizado_en > now() - interval '14 days'
      and (ultimo_valor is null or ultimo_valor >= current_date - 120)
    order by coalesce(fund_id, isin),
             (divisa = 'EUR') desc nulls last,
             fondos.es_particular(nombre, inversion_minima, max_minima) desc,
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
