-- Precios por lotes: una fila por fondo y año con todos sus valores diarios en listas.
-- Ocupa ~10 veces menos que una fila por precio y lee más rápido; permite precio diario para todo el universo.
-- La vista fondos.valor_liquidativo mantiene la forma de siempre (isin, fecha, valor, divisa, fuente) para leer.
-- Para escribir: fondos.guardar_valores(isin, fechas, valores, fuente), que mezcla con lo ya guardado.

-- 1. Número interno por fondo (no cambia nunca)
alter table fondos.fondo add column id integer generated always as identity;
alter table fondos.fondo add constraint fondo_id_unico unique (id);

-- 2. Paquetes anuales
create table fondos.valor_anual (
  fondo_id integer not null references fondos.fondo(id) on delete cascade,
  ano      smallint not null,
  dias     smallint[] not null,        -- día del año (0 = 1 de enero), ordenados
  valores  double precision[] not null,
  fuentes  smallint[] not null,        -- 1 morningstar · 2 yahoo · 3 ft
  primary key (fondo_id, ano),
  check (cardinality(dias) = cardinality(valores) and cardinality(dias) = cardinality(fuentes))
);

create function fondos.codigo_fuente(fuente text) returns smallint language sql immutable set search_path = '' as $$
  select case fuente when 'morningstar' then 1 when 'yahoo' then 2 when 'ft' then 3 end::smallint;
$$;
create function fondos.nombre_fuente(codigo smallint) returns text language sql immutable set search_path = '' as $$
  select case codigo when 1 then 'morningstar' when 2 then 'yahoo' when 3 then 'ft' end;
$$;

-- 3. Copia de lo que hay (antes de cambiar nada)
insert into fondos.valor_anual (fondo_id, ano, dias, valores, fuentes)
select f.id, extract(year from v.fecha)::smallint,
       array_agg((v.fecha - make_date(extract(year from v.fecha)::int, 1, 1))::smallint order by v.fecha),
       array_agg(v.valor::double precision order by v.fecha),
       array_agg(fondos.codigo_fuente(v.fuente) order by v.fecha)
from fondos.valor_liquidativo v join fondos.fondo f using (isin)
group by f.id, extract(year from v.fecha);

-- 4. La tabla antigua se aparta (se borra en una migración posterior, tras comprobar) y su nombre pasa a una vista
alter table fondos.valor_liquidativo rename to valor_liquidativo_antigua;
revoke all on fondos.valor_liquidativo_antigua from anon, authenticated;

create view fondos.valor_liquidativo with (security_invoker = true) as
  select f.isin, (make_date(a.ano, 1, 1) + u.d)::date as fecha, u.v as valor, f.divisa,
         fondos.nombre_fuente(u.fu) as fuente
  from fondos.valor_anual a
  join fondos.fondo f on f.id = a.fondo_id
  cross join lateral unnest(a.dias, a.valores, a.fuentes) as u(d, v, fu);

-- 5. Escritura: mezcla fechas y valores nuevos con el paquete de su año (lo nuevo manda en la misma fecha)
create function fondos.guardar_valores(p_isin text, p_fechas date[], p_valores double precision[], p_fuente text)
returns int language plpgsql set search_path = '' as $$
declare
  fid int;
  cod smallint := fondos.codigo_fuente(p_fuente);
  n int;
begin
  select id into fid from fondos.fondo where isin = p_isin;
  if fid is null then raise exception 'no hay ficha para %', p_isin; end if;
  if cod is null then raise exception 'fuente desconocida: %', p_fuente; end if;
  if cardinality(p_fechas) is distinct from cardinality(p_valores) then
    raise exception 'fechas y valores no casan (% y %)', cardinality(p_fechas), cardinality(p_valores);
  end if;

  with nuevos as (
    select extract(year from u.f)::smallint as ano,
           (u.f - make_date(extract(year from u.f)::int, 1, 1))::smallint as d, u.v, cod as fu
    from unnest(p_fechas, p_valores) as u(f, v)
    where u.v > 0),
  anos as (select distinct ano from nuevos),
  viejos as (
    select a.ano, u.d, u.v, u.fu
    from fondos.valor_anual a join anos using (ano)
    cross join lateral unnest(a.dias, a.valores, a.fuentes) as u(d, v, fu)
    where a.fondo_id = fid),
  juntos as (
    select distinct on (ano, d) ano, d, v, fu
    from (select ano, d, v, fu, 1 as prioridad from nuevos
          union all
          select ano, d, v, fu, 2 from viejos) x
    order by ano, d, prioridad),
  paquetes as (
    select ano, array_agg(d order by d) as dias, array_agg(v order by d) as valores, array_agg(fu order by d) as fuentes
    from juntos group by ano)
  insert into fondos.valor_anual (fondo_id, ano, dias, valores, fuentes)
  select fid, ano, dias, valores, fuentes from paquetes
  on conflict (fondo_id, ano) do update
    set dias = excluded.dias, valores = excluded.valores, fuentes = excluded.fuentes;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function fondos.guardar_valores(text, date[], double precision[], text) from public, anon, authenticated;

-- 6. Limpieza de los que salen del universo, ahora sobre los paquetes
create or replace function fondos.limpiar_valores() returns int
language sql set search_path = '' as $$
  with borrados as (
    delete from fondos.valor_anual a
    using fondos.fondo f
    where f.id = a.fondo_id
      and not f.en_universo
      and not exists (select 1 from fondos.fondo_diario d where d.isin = f.isin)
    returning 1)
  select count(*)::int from borrados;
$$;
revoke execute on function fondos.limpiar_valores() from public;

-- 7. Cada fondo del universo necesita una carga completa con todos los días
alter table fondos.fondo rename column con_cierres_mes to historico_diario;
update fondos.fondo set historico_diario = false;

-- 8. Permisos: la web lee los paquetes a través de la vista
alter table fondos.valor_anual enable row level security;
grant select on fondos.valor_anual to authenticated;
grant select on fondos.valor_liquidativo to authenticated;
create policy propietario_lee on fondos.valor_anual for select to authenticated using ((select fondos.es_propietario()));
