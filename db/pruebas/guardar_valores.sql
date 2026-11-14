-- Prueba de fondos.guardar_valores y de la vista fondos.valor_liquidativo (migración 0014). No deja nada: acaba en rollback.
-- Se pasa a mano contra la base (SQL editor de Supabase o psql); si algo falla, el assert para con su mensaje.
begin;

insert into fondos.fondo (isin, nombre, divisa) values ('ZZ000PRUEBA0', 'Fondo de prueba', 'EUR');

-- Primera carga: dos días de 2025 y dos de 2026
select fondos.guardar_valores('ZZ000PRUEBA0', array['2025-12-30', '2025-12-31', '2026-01-02', '2026-01-05']::date[],
                              array[10, 11, 12, 13]::double precision[], 'morningstar');
-- Segunda: se solapa en 2025-12-31 y 2026-01-02 (en los dos años) y añade 2026-01-06
do $$
begin
  assert fondos.guardar_valores('ZZ000PRUEBA0', array['2025-12-31', '2026-01-02', '2026-01-06']::date[],
                                array[21, 22, 23]::double precision[], 'yahoo') = 2, 'debía tocar los paquetes de 2025 y 2026';
end $$;

do $$
declare
  esperado text := '2025-12-30 10 morningstar|2025-12-31 21 yahoo|2026-01-02 22 yahoo|2026-01-05 13 morningstar|2026-01-06 23 yahoo';
  visto text;
begin
  assert (select count(*) from fondos.valor_anual a join fondos.fondo f on f.id = a.fondo_id
          where f.isin = 'ZZ000PRUEBA0') = 2, 'debía haber un paquete por año';
  select string_agg(fecha || ' ' || valor || ' ' || fuente, '|' order by fecha) into visto
  from fondos.valor_liquidativo where isin = 'ZZ000PRUEBA0';
  assert visto = esperado, format('la vista devuelve %s', visto);   -- en la misma fecha manda lo nuevo; lo demás se conserva
  assert (select bool_and(divisa = 'EUR') from fondos.valor_liquidativo where isin = 'ZZ000PRUEBA0'), 'divisa de la ficha';
  raise notice 'guardar_valores: todo bien';
end $$;

rollback;
