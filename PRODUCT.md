# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Un único usuario: Xabier, el propietario. Inversor particular que sigue fondos de inversión y mantiene unas cuantas **carteras modelo** (fondos y pesos, simuladas). Usa la terminal sobre todo en el ordenador, con calma y en pantalla grande: screener, ficha, comparador y edición de carteras en sesiones largas. El móvil no es el escenario principal.

## Product Purpose

Seguir el universo de fondos (≥ 50 M€, ≥ 3 años, lo que vende MyInvestor) y escoger candidatos para las carteras modelo. Éxito: **decidir con criterio**, es decir, elegir o cambiar un fondo de una cartera con cifras que coinciden con Morningstar y una razón clara detrás (nota, percentiles, señales de revisión, comparación).

## Positioning

Una herramienta personal hecha a medida: métricas calculadas como Morningstar (series en EUR, años naturales, volatilidad y Sharpe mensuales) sobre datos propios descargados a diario, una nota del screener cuyos pesos salen de un análisis histórico (`fondos/analisis.py`) y carteras modelo calculadas al momento. No es un comparador público ni un bróker.

## Operating Context

- Pantallas: Entrar, Inicio, Ficha, Cartera, Screener, Seguimiento, Revisión, Comparar y Simular; rutas con hash (`#/fondo/ISIN`).
- Barra de órdenes (Buscador) y atajos de lista (`teclas.ts`); franja «Comparando» para el comparador.
- Datos en Supabase escritos por tareas de GitHub Actions (diaria y semanal); la web solo lee, salvo carteras, seguimiento, perfiles del screener y umbrales.
- Inicio enseña las alarmas de la vigilancia (tareas con fallos).

## Capabilities and Constraints

- Las mismas cifras en todas partes: lo que la web muestra de un fondo sale de la tabla `metrica`; carteras y nota con pesos propios se calculan en la web con ports probados frente al mismo caso.
- Fuera de alcance: impuestos y operaciones reales.
- Supabase gratuito, un solo usuario, acceso solo del propietario (RLS).
- Idioma: español en toda la interfaz.
- Pendiente: comprobar 5 fondos frente a Morningstar; revisar comparador, simulador y portada con datos reales.

## Brand Commitments

- Nombre: «Terminal de fondos». Voz: español, directa y sobria.
- Rediseño en marcha (noviembre de 2026): la estética anterior («noche y azul cielo», Urbanist y DM Mono, esquinas rectas, `web/src/estilos.css`) ya no es vinculante. Nada visual se conserva por obligación: ni los temas, ni las tipografías, ni la convención de color de subidas y bajadas. Lo que no puede salir es un resultado frío, una hoja de cálculo sin carácter que no apetezca abrir. Los colores de las series se validan de nuevo con dataviz.
- Decisión del rediseño: **la convención del sector, sin un mundo propio**, hecha al nivel de acabado de **Linear** y del **panel de Stripe**: herramienta de trabajo precisa, densa y pulida. Se descartaron dos tiradas de direcciones con mundo propio (fichero de biblioteca, clasificación deportiva, avisos de la AEMET y carta de añadas).
- Independiente de la app de Finanzas.

## Evidence on Hand

- Datos reales del universo en Supabase (fichas, precios, métricas, composición X-Ray, notas semanales).
- Especificación completa: Claude Doc «Terminal de fondos — Especificación».
- No hay testimonios, clientes ni cifras públicas: es una app privada y no debe inventarlos.

## Product Principles

1. La cifra correcta antes que la bonita: nada se enseña si no coincide con el método de Morningstar.
2. Cada decisión con su porqué a la vista: nota, percentiles y señales explican, no solo ordenan.
3. Densidad para trabajar con calma en pantalla grande: escaneo rápido, comparación directa, teclado.
4. Simplicidad: lo mínimo que sirve para decidir; nada de funciones para usuarios que no existen.

## Accessibility & Inclusion

Sin necesidades especiales: buen contraste y legibilidad en los dos temas.
