# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Una sola persona: Xabier, propietario y único usuario. La usa sobre todo en el Mac, en una revisión semanal tranquila: mirar el screener, las señales de revisión y ajustar sus carteras modelo. Las carteras son solo para él; nadie más las ve.

## Product Purpose

Seguir fondos de inversión y escoger candidatos para carteras modelo (fondos y pesos, simuladas). Junta en un sitio datos diarios del universo (fichas, precios, métricas, composición), un screener con nota propia, señales de revisión, comparador y simulador. Éxito: decidir cambios de cartera con cifras en las que confía, sin ruido.

## Positioning

Herramienta personal, no un producto: cifras calculadas como Morningstar (mismas convenciones), universo filtrado a lo que se puede comprar en MyInvestor y una nota cuyos pesos salen de un análisis propio de qué predice mejor. Independiente de la app de Finanzas.

## Operating Context

- Revisión semanal en el Mac: Inicio (alarmas y avisos), Screener, Revisión, Seguimiento, Cartera, Comparar, Simular, Ficha de fondo.
- Navegación por teclado (barra de órdenes y atajos de lista) y rutas con hash (`#/fondo/ISIN`).
- Los datos llegan de tareas automáticas (GitHub Actions) a Supabase; la web solo lee, salvo carteras, seguimiento, perfil del screener y ajustes.

## Capabilities and Constraints

- Idioma: español.
- Web: Vite + React + TypeScript + Tailwind v4 + ECharts; publicada como Cloudflare Worker.
- Entrada solo del propietario (correo y contraseña o enlace mágico).
- Una métrica de un fondo en la web sale siempre de la tabla `metrica`; carteras y nota con pesos propios se calculan en la web con el port del motor.
- Fuera de alcance: impuestos y operaciones reales.
- Límites gratuitos de Supabase y de GitHub Actions.

## Brand Commitments

- Estética «La jornada» (cada categoría es una liga), elegida en noviembre de 2026; tema claro y oscuro. El sistema está en DESIGN.md, no aquí.
- Nada de aspecto de bróker ni de frialdad (lo pidió Xabier al elegirla).

## Evidence on Hand

- Datos reales en Supabase (universo, precios, métricas, composición). No hay que inventar fondos, cifras ni rentabilidades en ninguna maqueta.

## Product Principles

1. **Cifras fiables.** Lo que se enseña coincide con Morningstar y con la tabla `metrica`; si un dato falla, falta o está viejo, se ve.
2. **Calma y claridad.** Pocas cosas por pantalla, lo justo para decidir; nada que distraiga en la revisión semanal.
3. **Decidir, no operar.** Todo sirve para elegir fondos y pesos de carteras modelo; nada de órdenes reales.
4. **Simplicidad.** Lo mínimo que haga el trabajo, para una sola persona.
