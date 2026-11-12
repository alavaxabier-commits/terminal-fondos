-- La clase elegida de cada fondo debe poder contratarla un particular (las institucionales son más baratas y
-- sus métricas saldrían mejores que las de la clase que de verdad se compra).
-- Orden: en EUR → para particulares → acumulación → menor TER.
-- «Para particulares» = inversión mínima ≤ max_minima (por defecto 10.000); si Morningstar no da el dato,
-- que el nombre no tenga marca de clase institucional (I, I-A, IS, Inst, Instl, Ins Pl, X, Z, J…).

alter table fondos.fondo add column inversion_minima numeric;   -- en la divisa de la clase

create or replace function fondos.es_particular(nombre text, inversion_minima numeric, max_minima numeric)
returns boolean language sql immutable set search_path = '' as $$
  select case
    when inversion_minima is not null then inversion_minima <= max_minima
    else not (nombre ~* '\m(I|I-A|I-B|IA|IB|IS|Inst|Instl|Institutional|Ins|X|X1|X2|Z|ZA|J|JS)\M')
  end;
$$;

drop function if exists fondos.marcar_universo(numeric, int, int);
create function fondos.marcar_universo(min_patrimonio_meur numeric default 50, min_anos int default 3, tope int default 100,
                                       max_minima numeric default 10000)
returns int
language sql set search_path = '' as $$
  with clase as (
    select distinct on (coalesce(fund_id, isin)) isin, categoria, patrimonio_meur
    from fondos.fondo
    where categoria is not null
      and patrimonio_meur >= min_patrimonio_meur
      and fecha_lanzamiento <= current_date - make_interval(years => min_anos)
      and actualizado_en > now() - interval '14 days'
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
revoke execute on function fondos.marcar_universo(numeric, int, int, numeric) from public;

-- Los valores de los fondos que salen del universo (y no se siguen a diario) se borran para no llenar la base.
create function fondos.limpiar_valores() returns int
language sql set search_path = '' as $$
  with borrados as (
    delete from fondos.valor_liquidativo v
    where not exists (select 1 from fondos.fondo f where f.isin = v.isin and f.en_universo)
      and not exists (select 1 from fondos.fondo_diario d where d.isin = v.isin)
    returning 1)
  select count(*)::int from borrados;
$$;
revoke execute on function fondos.limpiar_valores() from public;
