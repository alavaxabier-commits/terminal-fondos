-- Fase 3: perfiles del screener, umbrales de las señales de revisión y nota semanal con su percentil.

-- Perfiles con nombre del screener (pesos de los bloques, filtros y modo de ranking); los edita la web.
create table fondos.perfil_screener (
  id       bigint generated always as identity primary key,
  nombre   text not null unique,
  pesos    jsonb not null,                -- {riesgo, consistencia, coste, proteccion, rentabilidad, diversificacion}
  filtros  jsonb not null default '{}',
  modo     text not null default 'juntos' check (modo in ('juntos', 'separados', 'indexados', 'activos')),
  creado   timestamptz not null default now()
);
insert into fondos.perfil_screener (nombre, pesos) values
  ('Por defecto', '{"riesgo": 25, "consistencia": 20, "coste": 20, "proteccion": 15, "rentabilidad": 10, "diversificacion": 10}');

-- Umbrales de las señales de revisión (clave → valor); los edita la web.
create table fondos.ajuste (
  clave       text primary key,
  valor       numeric not null,
  descripcion text not null
);
insert into fondos.ajuste (clave, valor, descripcion) values
  ('nota_baja_percentil',     50,   'Nota baja: nota por debajo de este percentil de su categoría'),
  ('empeora_puntos',          15,   'Empeora: la nota ha bajado al menos estos puntos'),
  ('empeora_meses',           12,   'Empeora: en estos meses'),
  ('mejor_puntos',            15,   'Hay algo claramente mejor: otro fondo de su categoría con estos puntos más de nota y TER igual o menor'),
  ('caro_puntos_ter',         0.5,  'Caro: TER por encima de la mediana de su categoría en estos puntos o más'),
  ('redundante_correlacion',  0.95, 'Redundante: correlación con otro fondo de la misma cartera desde este valor');

-- Nota semanal: percentil dentro de la categoría (para «Nota baja») y marca de historial corto (métricas a 3A).
alter table fondos.nota_semanal
  add column percentil numeric(4,1) check (percentil between 0 and 100),
  add column solo_3a   boolean not null default false;

alter table fondos.perfil_screener enable row level security;
alter table fondos.ajuste enable row level security;
revoke all on fondos.perfil_screener, fondos.ajuste from anon, authenticated;
grant select, insert, update, delete on fondos.perfil_screener, fondos.ajuste to authenticated;
create policy propietario_escribe on fondos.perfil_screener for all to authenticated
  using ((select fondos.es_propietario())) with check ((select fondos.es_propietario()));
create policy propietario_escribe on fondos.ajuste for all to authenticated
  using ((select fondos.es_propietario())) with check ((select fondos.es_propietario()));
