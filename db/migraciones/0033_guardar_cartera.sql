-- Guardar una cartera desde la web en una sola transacción (antes eran cuatro peticiones sueltas): datos de la cartera,
-- sus fondos (los que no vienen se borran) y las líneas nuevas del historial. Security invoker: sigue mandando RLS.
create function fondos.guardar_cartera(p_id bigint, p_cartera jsonb, p_fondos jsonb, p_cambios jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  update fondos.cartera set
    nombre = p_cartera->>'nombre', objetivo = p_cartera->>'objetivo', rebalanceo = p_cartera->>'rebalanceo',
    banda = (p_cartera->>'banda')::numeric, banda_tipo = p_cartera->>'banda_tipo', revision = p_cartera->>'revision'
  where id = p_id;
  insert into fondos.cartera_fondo (cartera_id, isin, peso)
    select p_id, f->>'isin', (f->>'peso')::numeric from jsonb_array_elements(p_fondos) f
  on conflict (cartera_id, isin) do update set peso = excluded.peso;
  delete from fondos.cartera_fondo
  where cartera_id = p_id and isin not in (select f->>'isin' from jsonb_array_elements(p_fondos) f);
  insert into fondos.cartera_cambio (cartera_id, sale, entra, motivo)
    select p_id, x->>'sale', x->>'entra', x->>'motivo' from jsonb_array_elements(p_cambios) x;
end $$;
revoke execute on function fondos.guardar_cartera(bigint, jsonb, jsonb, jsonb) from public, anon;
grant execute on function fondos.guardar_cartera(bigint, jsonb, jsonb, jsonb) to authenticated;
