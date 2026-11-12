# Terminal de fondos

Seguimiento de fondos de inversión y selección de candidatos para mis carteras. Especificación completa en el documento «Terminal de fondos — Especificación».

```
fondos/              paquete Python
  proveedores/       morningstar (buscador y series), yahoo (respaldo verificado), ft (referencia), bce (cambios y €STR)
  validacion.py      huecos, saltos y paso a semanal (sin red)
  ingesta.py         qué fondos tocan hoy, de dónde y cómo se guardan
  db.py              Postgres (Supabase), esquema «fondos»
db/migraciones/      SQL del esquema
tests/               pytest, sin red ni base de datos
.github/workflows/   ingesta diaria y tests
```

## Puesta en marcha

1. **Base de datos**: aplica `db/migraciones/0001_esquema.sql` en el proyecto de Supabase (SQL Editor › Run).
2. **Secreto en GitHub**: Settings › Secrets and variables › Actions › `DATABASE_URL` = la cadena de conexión de Supabase › Connect › **Session pooler**.
3. **Prueba de fuentes** (sin base de datos): Actions › Ingesta diaria › Run workflow › orden `prueba-red`, argumentos un ISIN.
4. **Universo**: Actions › Universo semanal › Run workflow. Descarga las fichas de Morningstar España y marca como universo los fondos con al menos 50 M€ de patrimonio y 3 años de historia, como mucho 100 por categoría (los de más patrimonio) y una clase por fondo (en EUR si la hay). Se repite cada domingo.
5. **Mis fondos** (opcional): Ingesta diaria, orden `alta`, argumentos los ISIN separados por espacios. Pasan a datos diarios.
6. **Primera carga**: Ingesta diaria, orden `diario` (o espera a la ejecución de cada mañana). Trae 10 años de cada fondo; los del universo van en tandas de 300 por ejecución.
7. **Estado**: orden `estado` muestra cuántos valores tiene cada fondo, desde y hasta cuándo, el mayor hueco y los errores recientes.

## En local

```bash
python -m venv .venv && . .venv/bin/activate
pip install -e '.[dev]'
cp .env.example .env    # y pon tu DATABASE_URL
python -m pytest -q
set -a; . ./.env; set +a; python -m fondos estado
```

## Fase 0: cuándo está cerrada

- Mis fondos tienen 10 años de valores (o desde su lanzamiento) sin huecos de más de 5 días hábiles.
- La ingesta diaria lleva una semana seguida sin fallos.
