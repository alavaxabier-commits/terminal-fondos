-- Carteras modelo: fondos y pesos, sin operaciones ni importes.
-- La aplicación simula cada cartera y marca los fondos que conviene revisar.

drop view if exists fondos.fondo_diario;
drop table if exists fondos.operacion;

alter table fondos.asignacion_objetivo rename to cartera_fondo;
alter table fondos.cartera_fondo drop column banda_pp;
alter table fondos.cartera_fondo rename column peso_pct to peso;

alter table fondos.cartera
  add column rebalanceo text not null default 'anual' check (rebalanceo in ('anual', 'trimestral', 'ninguno'));

-- Historial de cambios de cada cartera (qué fondo salió, cuál entró y por qué)
create table fondos.cartera_cambio (
  id         bigint generated always as identity primary key,
  cartera_id bigint not null references fondos.cartera(id) on delete cascade,
  fecha      date not null default current_date,
  sale       text references fondos.fondo(isin),
  entra      text references fondos.fondo(isin),
  motivo     text
);

-- Nota semanal del screener (pesos por defecto), para la señal «Empeora»
create table fondos.nota_semanal (
  isin  text not null references fondos.fondo(isin) on delete cascade,
  fecha date not null,
  nota  numeric(5,2) not null check (nota between 0 and 100),
  primary key (isin, fecha)
);

-- Fondos con datos diarios: los de mis carteras modelo (no archivadas) y los que vigilo.
create view fondos.fondo_diario with (security_invoker = true) as
  select cf.isin from fondos.cartera_fondo cf join fondos.cartera c on c.id = cf.cartera_id where not c.archivada
  union select isin from fondos.seguimiento where estado <> 'descartado';

alter table fondos.cartera_cambio enable row level security;
alter table fondos.nota_semanal enable row level security;
revoke all on fondos.cartera_cambio, fondos.nota_semanal from anon, authenticated;
