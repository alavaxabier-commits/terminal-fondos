# Terminal de fondos · nota técnica

App personal de Xabier (un solo usuario) para seguir fondos y escoger candidatos para **carteras modelo**. Estética de terminal. Independiente de la app de Finanzas.
Responde y escribe en **español**. Prioriza la simplicidad. Explica las decisiones y pregunta cuando haga falta.
El código manda: esta nota solo dice dónde está cada cosa y qué no se puede romper. Qué hace cada fase y por qué: la especificación (Claude Doc «Terminal de fondos — Especificación»).

## Fases

0 datos ✔ · 1 ficha y métricas (falta comprobar 5 fondos frente a Morningstar) · 2 carteras modelo · 3 screener, seguimiento y señales de revisión · 4 comparador, simulador y portada.
Fuera de alcance: impuestos y operaciones reales (las carteras son modelo: fondos y pesos, simuladas).

## Piezas

- **Datos** en **Supabase** (`ugobxrjfxzyrcbuxgefz`, esquema `fondos`, expuesto a la Data API). SQL en `db/migraciones/NNNN_*.sql`, numeradas y aplicadas en orden (todas aplicadas hasta la última del directorio). Cambio de base = migración nueva.
- **Python** `fondos/` (ingesta y cálculo), ejecutado por **GitHub Actions** con el secreto `DATABASE_URL` (session pooler, `psycopg` 3 con `prepare_threshold=None`):
  - `diario.yml`: cada día 06:17 UTC, `python -m fondos diario` (macro + precios + métricas + estado). A mano: orden y argumentos (`precios --tanda 5000`, `alta ISIN…`, `estado`, `prueba-red ISIN`…).
  - `universo.yml`: domingos 04:23 UTC, fichas de Morningstar España, marca del universo y `composicion` (X-Ray: los fondos de `fondo_diario` cada semana, el resto del universo una vez al mes, 1.200 por ejecución).
  - `tests.yml` (pytest) y `web.yml` (typecheck, tests y build de la web; deja el resultado en `registro_descarga` con fuente `web`).
- **Web** `web/`: Vite + React 19 + TypeScript + Tailwind v4 + ECharts 5 + supabase-js. Cloudflare Worker con recursos estáticos (`web/wrangler.jsonc`): https://terminal-fondos.alava-xabier.workers.dev, publicada desde `main`. Entrada por enlace mágico (no crea usuarios); rutas con hash (`#/fondo/ISIN`).

## Dónde está cada cosa

- `fondos/proveedores/`: `morningstar.py` (buscador de fichas, series `timeseries_price` y ficha de detalle `security_details` vista `MFsnapshot` para la composición), `yahoo.py` (respaldo, solo con ticker verificado ±0,1 % en ≥5 días), `ft.py` (último mes, referencia y último recurso), `bce.py` (cambios y €STR).
- `fondos/ingesta.py`: qué toca a cada fondo (`accion`, `planificar`) y cómo se descarga (`descargar_fondo`). `fondos/validacion.py`: huecos y saltos (`avisos`), fechas hábiles.
- `fondos/db.py` (`Repo`): toda la lectura y escritura de la base; `reducir()` pasa la serie diaria a semanal + cierres de mes.
- `fondos/nucleo/metricas.py`: **motor de métricas puro** (sin red ni base). `fondos/calculo.py`: referencias (índice, índice combinado, €STR o media de la categoría) y percentiles por categoría.
- `web/src/`: `datos/` (cliente y consultas, paginadas de 1.000 en 1.000), `calculo/` (series, simulación de carteras y formato, con test), `pantallas/` (Entrar, Inicio, Ficha, Cartera), `componentes/` (Buscador, Grafico).

## Datos: lo esencial

- `fondo`: fichas (también las que no están en el universo). `en_universo`: ≥ 50 M€, ≥ 3 años, como mucho 100 por categoría, una clase por fondo (EUR, particulares, acumulación, menor gasto). `historico_diario`: ya tiene la carga completa diaria.
- **Precios en paquetes anuales**: `valor_anual (fondo_id, ano, dias[], valores[], fuentes[])`. Se lee con la vista `valor_liquidativo` (isin, fecha, valor, divisa, fuente) y se escribe **solo** con `fondos.guardar_valores(isin, fechas, valores, fuente)`, que mezcla con lo guardado (lo nuevo manda en la misma fecha). `valor_liquidativo_antigua` es la tabla vieja, pendiente de borrar.
- Ritmo: una carga completa por fondo (10 años diarios); después, los de `fondo_diario` cada día y el resto del universo una vez a la semana.
- `composicion (isin, fecha_cartera, datos jsonb)`: desgloses netos del X-Ray con los códigos de Morningstar (`{código: %}`), estadísticas de renta variable y fija (TIR, cupón…) y todas las posiciones (API de la web de Morningstar con su clave pública; si falla, las 10 mayores, sin `posiciones_todas`); los nombres de los códigos los pone la web. Duración, calidad media y cajas de estilo están en `fondo` (vienen del buscador).
- `metrica`: se recalcula entera en cada ejecución (borrar + COPY en una transacción), con `percentil` dentro de la categoría.
- Carteras: `cartera`, `cartera_fondo (peso)`, `cartera_cambio`, `nota_semanal`; `seguimiento` (con `disponible_myinvestor`, marcado a mano).
- `registro_descarga`: una línea por descarga (ok, aviso, error); es lo que hay que mirar si algo falla.

## Reglas que no se pueden romper

- **Seguridad**: RLS en todas las tablas; la web solo lee, y solo el propietario (`fondos.es_propietario()`, que mira el correo en `fondos.propietario`). Escriben únicamente los scripts. Las funciones que escriben se revocan para `anon` y `authenticated`. Revisa los avisos de seguridad de Supabase tras cada migración.
- **Métricas como Morningstar**: series en EUR; años naturales y YTD con cierres de mes exactos; volatilidad y Sharpe mensuales con desviación muestral × √12; percentiles invertidos donde menos es mejor; beta sin percentil. Todo cálculo nuevo va en `nucleo/metricas.py` con su test.
- Las mismas cifras en todas partes: si la web muestra una métrica, sale de la tabla `metrica`, no se recalcula de otra forma.
- **Límites**: Supabase gratis (500 MB de base, unos 2 correos por hora), 2.000 min/mes de Actions (repositorio privado). Morningstar: una petición por fondo (dos para la composición, una vez al mes) y pausa entre peticiones; nada de descargas diarias de todo el universo.
- La contraseña de la base y las claves secretas nunca van al chat ni al código: solo en los secretos de GitHub. La clave `sb_publishable_…` está en `web/src/datos/supabase.ts` a propósito.

## Tests y cómo trabajar

- `python -m pytest -q` (sin red ni base) y en `web/`: `npm test`, `npm run typecheck`, `npm run build`.
- Desde aquí sí hay acceso a Supabase (herramientas MCP) y a GitHub (`gh api …`, sin GraphQL; las acciones se lanzan con `POST …/actions/workflows/<fichero>/dispatches`). No hay acceso a Morningstar ni a Yahoo: se prueba con una acción (`prueba-red`).
- Los cambios pueden ir directos a `main`. Las migraciones las aplica Claude con Supabase y Xabier aprueba si se le pide.
- Al escribir argumentos en Actions, el Mac cambia `--` por una raya; `diario.yml` lo corrige.
- Al terminar un cambio, actualiza esta nota **solo si cambia algo de lo que dice**; no describas pantallas aquí.
