-- Tamaño de la base (el plan gratuito de Supabase da 500 MB) y las tablas que más ocupan, para enseñarlo en Inicio.
-- Solo lee; devuelve el dato al propietario y null a cualquier otro.
create function fondos.tamano_base() returns jsonb
language sql stable set search_path = '' as $$
  select case when fondos.es_propietario() then jsonb_build_object(
    'total', pg_catalog.pg_database_size(pg_catalog.current_database()),
    'tablas', (select jsonb_agg(jsonb_build_object('tabla', t.relname, 'bytes', t.bytes) order by t.bytes desc)
               from (select c.relname, pg_catalog.pg_total_relation_size(c.oid) as bytes
                     from pg_catalog.pg_class c
                     where c.relkind = 'r' and c.relnamespace = 'fondos'::regnamespace
                     order by bytes desc limit 5) t)
  ) end;
$$;
revoke execute on function fondos.tamano_base() from public, anon;
grant execute on function fondos.tamano_base() to authenticated;
