-- Catálogo de MyInvestor (su buscador público de fondos, sin planes de pensiones), reemplazado entero en cada descarga.
-- El universo prefiere las clases que vende MyInvestor aunque haya otras más baratas, y si vende varias del mismo
-- fondo entran todas.

create table fondos.myinvestor (
  isin text primary key,
  nombre text not null,
  gestora text,
  ter numeric,              -- % anual, el que publica MyInvestor
  minimo text,              -- primera suscripción, tal cual ('1 EUR')
  sin_retrocesion boolean,
  abierto boolean not null, -- status OPEN (no cerrado ni cerrado a nuevos partícipes)
  actualizado_en timestamptz not null default now()
);
alter table fondos.myinvestor enable row level security;
revoke all on fondos.myinvestor from anon, authenticated;
grant select on fondos.myinvestor to authenticated;
create policy propietario_lee on fondos.myinvestor for select to authenticated using ((select fondos.es_propietario()));

create or replace function fondos.marcar_universo(min_patrimonio_meur numeric default 50, min_anos int default 3, tope int default 100,
                                                  max_minima numeric default 10000)
returns int
language sql set search_path = '' as $$
  update fondos.fondo f set ultimo_valor = u.ultima
  from (select distinct on (fondo_id) fondo_id, make_date(ano, 1, 1) + (select max(d) from unnest(dias) d) as ultima
        from fondos.valor_anual order by fondo_id, ano desc) u
  where u.fondo_id = f.id and f.ultimo_valor is distinct from u.ultima;

  with apta as (            -- clases que pasan los mínimos
    select f.isin, coalesce(f.fund_id, f.isin) as fondo, f.categoria, f.patrimonio_meur, f.divisa, f.nombre,
           f.inversion_minima, f.ter, m.isin is not null as en_myinvestor
    from fondos.fondo f
    left join fondos.myinvestor m on m.isin = f.isin and m.abierto
    where f.categoria is not null
      and f.patrimonio_meur >= min_patrimonio_meur
      and f.fecha_lanzamiento <= current_date - make_interval(years => min_anos)
      and f.actualizado_en > now() - interval '14 days'
      and (f.ultimo_valor is null or f.ultimo_valor >= current_date - 120)),
  clase as (                -- una clase por fondo para el puesto en su categoría: primero las de MyInvestor
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
      select c.*, row_number() over (partition by categoria order by patrimonio_meur desc, isin) as puesto
      from clase c) x
    where puesto <= tope),
  dentro as (               -- la clase elegida y, si es de MyInvestor, las demás de MyInvestor del mismo fondo
    select a.isin from apta a join elegido e using (fondo)
    where a.isin = e.isin or (e.en_myinvestor and a.en_myinvestor))
  update fondos.fondo f set en_universo = (f.isin in (select isin from dentro))
  where f.en_universo is distinct from (f.isin in (select isin from dentro));

  select count(*)::int from fondos.fondo where en_universo;
$$;
revoke execute on function fondos.marcar_universo(numeric, int, int, numeric) from public, anon, authenticated;
