-- Terminal de fondos · esquema inicial (fase 0)
-- Todo vive en el esquema «fondos», que la API pública de Supabase no expone.
-- La ingesta (GitHub Actions) y la app entran con conexión directa a Postgres.

create schema if not exists fondos;

-- ------------------------------------------------------------------ mercado
create table fondos.indice (
  id          text primary key,              -- 'msci-world'
  nombre      text not null,
  proxy_isin  text,                          -- fondo indexado que lo replica
  componentes jsonb                          -- índice combinado: [{"id": "msci-world", "peso": 0.6}, …]
);

create table fondos.fondo (
  isin              text primary key check (isin ~ '^[A-Z]{2}[A-Z0-9]{9}[0-9]$'),
  nombre            text not null,
  gestora           text,
  categoria         text,
  tipo_activo       text,
  geografia         text,
  divisa            char(3),
  ter               numeric(6,4),            -- % anual
  srri              smallint check (srri between 1 and 7),
  gestion           text check (gestion in ('activa', 'indexada')),
  distribucion      boolean,
  fecha_lanzamiento date,
  patrimonio_meur   numeric(14,2),
  ms_id             text,                    -- SecId de Morningstar (la clase)
  fund_id           text,                    -- FundId de Morningstar (el fondo: todas sus clases lo comparten)
  yahoo_ticker      text,                    -- solo si se ha verificado contra Morningstar
  indice_id         text references fondos.indice(id),
  en_universo       boolean not null default false,  -- entra en el screener (precios semanales)
  actualizado_en    timestamptz not null default now()
);

create table fondos.valor_liquidativo (
  isin   text not null references fondos.fondo(isin) on delete cascade,
  fecha  date not null,
  valor  numeric(18,6) not null check (valor > 0),
  divisa char(3) not null,
  fuente text not null check (fuente in ('morningstar', 'yahoo')),
  primary key (isin, fecha)
);

create table fondos.composicion (           -- solo la última foto de cada fondo
  isin      text not null references fondos.fondo(isin) on delete cascade,
  dimension text not null check (dimension in ('activo', 'region', 'sector', 'posicion')),
  clave     text not null,
  peso      numeric(7,3) not null,         -- %
  fecha     date not null,
  primary key (isin, dimension, clave)
);

-- ------------------------------------------------------------------ mío
create table fondos.cartera (
  id        bigint generated always as identity primary key,
  nombre    text not null unique,
  objetivo  text,
  creada    date not null default current_date,
  archivada boolean not null default false
);

create table fondos.operacion (
  id              bigint generated always as identity primary key,
  cartera_id      bigint not null references fondos.cartera(id),
  isin            text not null references fondos.fondo(isin),
  fecha           date not null,
  tipo            text not null check (tipo in ('suscripcion', 'reembolso', 'traspaso_entrada', 'traspaso_salida')),
  participaciones numeric(18,6) not null check (participaciones > 0),
  importe_eur     numeric(14,2) not null check (importe_eur >= 0),
  traspaso_id     uuid,                    -- enlaza las dos patas de un traspaso
  creada_en       timestamptz not null default now()
);
create index on fondos.operacion (cartera_id, isin);

create table fondos.asignacion_objetivo (
  cartera_id bigint not null references fondos.cartera(id) on delete cascade,
  isin       text not null references fondos.fondo(isin),
  peso_pct   numeric(5,2) not null check (peso_pct between 0 and 100),
  banda_pp   numeric(4,2) not null default 5 check (banda_pp >= 0),
  primary key (cartera_id, isin)
);

create table fondos.seguimiento (
  isin   text primary key references fondos.fondo(isin),
  alta   date not null default current_date,
  estado text not null default 'vigilando' check (estado in ('vigilando', 'candidato', 'descartado')),
  nota   text
);

-- ------------------------------------------------------------------ soporte
create table fondos.tipo_cambio (            -- BCE: unidades de la divisa por 1 EUR
  fecha  date not null,
  divisa char(3) not null,
  por_eur numeric(14,6) not null,
  primary key (fecha, divisa)
);

create table fondos.tipo_interes (           -- €STR diario (BCE), % anual
  fecha date primary key,
  estr  numeric(8,4) not null
);

create table fondos.metrica (
  isin         text not null references fondos.fondo(isin) on delete cascade,
  ventana      text not null,               -- 'ytd', '1a', '3a', '5a', '10a'
  nombre       text not null,
  valor        numeric,
  calculada_en timestamptz not null default now(),
  primary key (isin, ventana, nombre)
);

create table fondos.registro_descarga (
  id      bigint generated always as identity primary key,
  ts      timestamptz not null default now(),
  fuente  text not null,
  isin    text,
  estado  text not null check (estado in ('ok', 'aviso', 'error')),
  mensaje text
);
create index on fondos.registro_descarga (ts desc);

-- Fondos con datos diarios: los que tengo, los que vigilo y los de mis asignaciones.
create view fondos.fondo_diario as
  select isin from fondos.operacion
  union select isin from fondos.seguimiento where estado <> 'descartado'
  union select isin from fondos.asignacion_objetivo;

-- Universo del screener: los n fondos con más patrimonio de cada categoría de Morningstar,
-- una sola clase por fondo (en EUR si la hay, y la de menor TER). Devuelve cuántos quedan dentro.
create function fondos.marcar_universo(n int default 30) returns int
language sql set search_path = '' as $$
  with clase as (
    select distinct on (coalesce(fund_id, isin)) isin, categoria, patrimonio_meur
    from fondos.fondo
    where categoria is not null
    order by coalesce(fund_id, isin), (divisa = 'EUR') desc nulls last, ter asc nulls last, isin),
  top as (
    select isin from (
      select isin, row_number() over (partition by categoria order by patrimonio_meur desc nulls last, isin) as puesto
      from clase) x
    where puesto <= n)
  update fondos.fondo f set en_universo = (f.isin in (select isin from top))
  where f.en_universo is distinct from (f.isin in (select isin from top));
  select count(*)::int from fondos.fondo where en_universo;
$$;
revoke execute on function fondos.marcar_universo(int) from public;

-- ------------------------------------------------------------------ índices de referencia
insert into fondos.indice (id, nombre, proxy_isin, componentes) values
  ('msci-world',      'MSCI World',                            'IE00BD0NCM55', null),
  ('sp500',           'S&P 500',                               null, null),
  ('msci-europe',     'MSCI Europe',                           null, null),
  ('msci-em',         'MSCI Emerging Markets',                 null, null),
  ('bbg-global-agg',  'Bloomberg Global Aggregate (EUR cubierto)', null, null),
  ('bbg-euro-agg',    'Bloomberg Euro Aggregate',              null, null),
  ('estr',            '€STR',                                  null, null),
  ('mixto-60-40',     'Mixto 60/40',                           null,
     '[{"id": "msci-world", "peso": 0.6}, {"id": "bbg-global-agg", "peso": 0.4}]');

-- ------------------------------------------------------------------ seguridad
-- RLS en todas las tablas y ninguna política: aunque alguien expusiera el esquema en la API, no vería nada.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'fondos' loop
    execute format('alter table fondos.%I enable row level security', t);
  end loop;
end $$;
revoke all on schema fondos from anon, authenticated;
revoke all on all tables in schema fondos from anon, authenticated;
alter view fondos.fondo_diario set (security_invoker = true);
