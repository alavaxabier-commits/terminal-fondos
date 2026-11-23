-- Todos los fondos abiertos en MyInvestor entran en el universo con ≥ 1 año de historia, sin mínimo de patrimonio ni
-- tope por categoría. El resto sigue con los mínimos de siempre (son la comparación de mercado para los percentiles).
create or replace function fondos.marcar_universo(min_patrimonio_meur numeric default 50, min_anos integer default 3,
                                                  tope integer default 100, max_minima numeric default 10000)
returns integer
language sql
set search_path to ''
as $function$
  update fondos.fondo f set ultimo_valor = u.ultima
  from (select distinct on (fondo_id) fondo_id, make_date(ano, 1, 1) + (select max(d) from unnest(dias) d) as ultima
        from fondos.valor_anual order by fondo_id, ano desc) u
  where u.fondo_id = f.id and f.ultimo_valor is distinct from u.ultima;

  with apta as (
    select f.isin, coalesce(f.fund_id, f.isin) as fondo, f.categoria, f.patrimonio_meur, f.divisa, f.nombre,
           f.inversion_minima, f.ter, m.isin is not null as en_myinvestor
    from fondos.fondo f
    left join fondos.myinvestor m on m.isin = f.isin and m.abierto
    where f.categoria is not null
      and (m.isin is not null or f.patrimonio_meur >= min_patrimonio_meur)
      and f.fecha_lanzamiento <= current_date - make_interval(years => case when m.isin is not null then 1 else min_anos end)
      and f.actualizado_en > now() - interval '14 days'
      and (f.ultimo_valor is null or f.ultimo_valor >= current_date - 120)),
  clase as (
    select distinct on (fondo) isin, fondo, categoria, patrimonio_meur, en_myinvestor
    from apta
    order by fondo,
             en_myinvestor desc,
             (divisa = 'EUR') desc nulls last,
             fondos.es_particular(nombre, inversion_minima, max_minima) desc,
             (nombre ~* '(acc|acum|accumulation|capitalisation|thes)\M') desc,
             (nombre ~* '(dis|dist|distribution|inc|income)\M') asc,
             ter asc nulls last, isin),
  elegido as (
    select * from (
      select c.*, row_number() over (partition by categoria order by patrimonio_meur desc nulls last, isin) as puesto
      from clase c) x
    where puesto <= tope or en_myinvestor),
  dentro as (
    select a.isin from apta a join elegido e using (fondo)
    where a.isin = e.isin or (e.en_myinvestor and a.en_myinvestor))
  update fondos.fondo f set en_universo = (f.isin in (select isin from dentro))
  where f.en_universo is distinct from (f.isin in (select isin from dentro));

  select count(*)::int from fondos.fondo where en_universo;
$function$;
