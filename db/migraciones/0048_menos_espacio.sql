-- Espacio (plan gratis, 500 MB): las composiciones guardan como mucho 1.000 posiciones, las de más peso en valor
-- absoluto (MAX_POSICIONES en fondos/proveedores/morningstar.py), y fuera el índice trigram del nombre: el buscador
-- hace ilike sobre ~50.000 fichas, que sin índice sigue tardando milisegundos.
update fondos.composicion c
set datos = jsonb_set(c.datos, '{posiciones}',
    (select jsonb_agg(p order by (p->>'peso')::float8 desc)
     from (select p from jsonb_array_elements(c.datos->'posiciones') p
           order by abs((p->>'peso')::float8) desc limit 1000) x))
where jsonb_typeof(c.datos->'posiciones') = 'array' and jsonb_array_length(c.datos->'posiciones') > 1000;

drop index fondos.fondo_nombre_trgm;
