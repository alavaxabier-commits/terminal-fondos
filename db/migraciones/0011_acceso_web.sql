-- Acceso desde la web (API de Supabase con sesión): solo el propietario lee y escribe.
-- El correo del propietario se guarda en fondos.propietario (se inserta a mano, no va en el repositorio).

create table fondos.propietario (email text primary key);
alter table fondos.propietario enable row level security;
revoke all on fondos.propietario from anon, authenticated;

create function fondos.es_propietario() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from fondos.propietario p where p.email = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;
revoke execute on function fondos.es_propietario() from public, anon;
grant execute on function fondos.es_propietario() to authenticated;

grant usage on schema fondos to authenticated;
grant select on all tables in schema fondos to authenticated;
revoke select on fondos.propietario from authenticated;
grant insert, update, delete on fondos.cartera, fondos.cartera_fondo, fondos.cartera_cambio, fondos.seguimiento
  to authenticated;
grant usage on all sequences in schema fondos to authenticated;

-- Lectura de todo (salvo propietario) para el propietario
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'fondos' and tablename <> 'propietario' loop
    execute format('create policy propietario_lee on fondos.%I for select to authenticated using ((select fondos.es_propietario()))', t);
  end loop;
end $$;

-- Escritura solo en lo mío
create policy propietario_escribe on fondos.cartera for all to authenticated
  using ((select fondos.es_propietario())) with check ((select fondos.es_propietario()));
create policy propietario_escribe on fondos.cartera_fondo for all to authenticated
  using ((select fondos.es_propietario())) with check ((select fondos.es_propietario()));
create policy propietario_escribe on fondos.cartera_cambio for all to authenticated
  using ((select fondos.es_propietario())) with check ((select fondos.es_propietario()));
create policy propietario_escribe on fondos.seguimiento for all to authenticated
  using ((select fondos.es_propietario())) with check ((select fondos.es_propietario()));

-- Búsqueda por nombre o ISIN sin recorrer las 50.000 fichas
create extension if not exists pg_trgm with schema extensions;
create index fondo_nombre_trgm on fondos.fondo using gin (nombre extensions.gin_trgm_ops);
