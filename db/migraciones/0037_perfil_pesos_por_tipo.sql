-- Pesos del screener por tipo de activo: `perfil_screener.pesos` pasa a ser {tipo: {bloque: peso}} (la web lee también
-- el formato antiguo, un juego único para todos los tipos). El perfil «Por defecto» conservaba los pesos de la
-- migración 0025 (25/20/20/15/10): se pone al día con los de ahora, iguales para todos los tipos.
update fondos.perfil_screener
set pesos = (select jsonb_object_agg(t, '{"riesgo": 20, "consistencia": 10, "coste": 40, "proteccion": 20, "rentabilidad": 10, "diversificacion": 10}'::jsonb)
             from unnest(array['renta variable', 'renta fija', 'mixto', 'monetario', 'otros']) t)
where nombre = 'Por defecto';
