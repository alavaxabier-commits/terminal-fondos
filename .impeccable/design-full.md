---
name: Terminal de fondos
description: Herramienta personal para elegir fondos y revisar carteras modelo; cada categoría se lee como una liga.
colors:
  papel: "#f3f2ec"
  papel-panel: "#fbfaf6"
  filete: "#dcdad1"
  tinta: "#141414"
  tinta-suave: "#5c5a53"
  azul-liga: "#1d4f9f"
  sobre-azul: "#ffffff"
  verde-sube: "#2b6a3f"
  rojo-baja: "#b0352a"
  ambar-aviso: "#85600f"
  gris: "#8a887f"
  cabecera: "#141414"
  sobre-cabecera: "#f3f2ec"
  amarillo-once: "#f0c23a"
  sobre-once: "#141414"
  tinte-tuyo: "#fbefc6"
  tinte-alta: "#e6ecf6"
  tinte-baja: "#f6e3df"
  serie1: "#5e82c5"
  serie2: "#c48225"
  serie3: "#bb5c84"
  serie4: "#6f6b64"
  serie5: "#b0aca3"
typography:
  display:
    fontFamily: "Barlow Condensed, Barlow, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "0em"
  headline:
    fontFamily: "Barlow Condensed, Barlow, ui-sans-serif, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 800
    lineHeight: 1.2
  title:
    fontFamily: "Barlow Condensed, Barlow, ui-sans-serif, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    letterSpacing: "0.02em"
  cifra:
    fontFamily: "Barlow Condensed, Barlow, ui-sans-serif, system-ui, sans-serif"
    fontSize: "21px"
    fontWeight: 800
    fontFeature: "tnum"
  body:
    fontFamily: "Barlow, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tnum"
  label:
    fontFamily: "Barlow Condensed, Barlow, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    letterSpacing: "0.06em"
  codigo:
    fontFamily: "DM Mono, ui-monospace, Menlo, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 400
rounded:
  xs: "1px"
  sm: "2px"
  md: "2px"
  lg: "3px"
spacing:
  pantalla: "16px"
  bloque: "20px"
components:
  button-primary:
    backgroundColor: "{colors.azul-liga}"
    textColor: "{colors.sobre-azul}"
    rounded: "{rounded.sm}"
    height: "36px"
    padding: "0 14px"
  button-secondary:
    backgroundColor: "{colors.papel-panel}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.sm}"
    height: "36px"
    padding: "0 14px"
  tab-liga:
    backgroundColor: "{colors.filete}"
    textColor: "{colors.tinta}"
    typography: "{typography.title}"
    padding: "6px 14px"
  tab-liga-activa:
    backgroundColor: "{colors.tinta}"
    textColor: "{colors.papel}"
  cabecera:
    backgroundColor: "{colors.cabecera}"
    textColor: "{colors.sobre-cabecera}"
    height: "48px"
  once:
    backgroundColor: "{colors.amarillo-once}"
    textColor: "{colors.sobre-once}"
    typography: "{typography.cifra}"
    padding: "0 6px"
  tarjeta:
    backgroundColor: "{colors.papel-panel}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.lg}"
    padding: "16px"
---

# Design System: Terminal de fondos

## Overview

**Creative North Star: "La jornada"**

Cada categoría de fondos es una liga y el Screener es su clasificación del lunes. Se ve el puesto de cada fondo, cuántos puestos ha ganado o perdido en el último mes y por dónde andan los fondos de tus carteras. El mundo viene de las tablas de clasificación de la prensa deportiva, pero solo presta letra, color, densidad y un gesto: la navegación, los filtros y las tablas son los controles normales de una aplicación web.

La pantalla es papel claro con tinta negra, pensada para una revisión semanal tranquila a la luz del día. Una cabecera negra a todo el ancho da el carácter. El color hace trabajos concretos: azul de liga para el acento y, en los mapas de métricas, lo mejor de la categoría; rojo de liga para lo peor; amarillo solo para lo tuyo. Lo que se rechaza: el aspecto de bróker (oscuro con neón, verde y rojo por todas partes) y el panel de tarjetas blancas de cualquier aplicación.

**Key Characteristics:**
- Cabecera negra con la pantalla actual subrayada en amarillo.
- Puestos, notas y cifras en letra estrecha y pesada (Barlow Condensed), con números tabulares.
- Filas limpias: sin franjas ni tintes de cuartil; solo el amarillo de lo tuyo y el contorno azul del fondo elegido.
- Filete fuerte cada cinco filas en las clasificaciones.
- Un color fijo por cartera (por orden de creación) en todas las pantallas.

## Colors

Papel claro y tinta negra, con tres colores de liga que solo aparecen cuando significan algo.

### Primary
- **Azul de liga** (#1d4f9f): acento (enlaces, selección, orden activo, botón principal) y, con su tinte, el cuartil alto en los mapas de métricas. En oscuro, #86aef0 para el acento.

### Secondary
- **Rojo de liga** (#c0392b): solo, con su tinte, el cuartil bajo en los mapas de métricas.
- **Amarillo «once»** (#f0c23a): solo lo tuyo: el puesto de los fondos de una cartera, el subrayado de la pantalla actual y la selección de texto. Filas tuyas con el tinte #fbefc6.

### Neutral
- **Papel** (#f3f2ec): fondo de la página. En oscuro, #111214.
- **Papel de panel** (#fbfaf6): tarjetas, pie y campos.
- **Filete** (#dcdad1): bordes y separadores.
- **Tinta** (#141414): texto y cabecera; también el filete cada cinco filas (al 60 %).
- **Tinta suave** (#5c5a53): texto secundario, ≥ 4,5:1 sobre papel.

### Semantic
- **Sube / baja** (#2b6a3f / #b0352a): rentabilidades, siempre con signo o flecha.
- **Aviso** (#85600f): señales y avisos.
- **Series** (serie1…5): los colores validados con dataviz para gráficos y para la tinta de cada cartera.

### Named Rules
**La regla del amarillo.** El amarillo es solo para lo tuyo (tus fondos, tu pantalla actual). Usado para otra cosa deja de decir «esto es mío».
**La regla de la zona.** Los tintes azul y rojo de liga marcan cuartiles (o mejor y peor que la referencia) en los mapas de métricas; la clasificación del Screener no los usa. Los puestos ganados o perdidos van en verde o rojo apagados (sube/baja) con ▲/▼.

## Typography

**Display Font:** Barlow Condensed (con Barlow y la del sistema)
**Body Font:** Barlow
**Label/Mono Font:** Barlow Condensed para rótulos; DM Mono solo para códigos (ISIN)

**Character:** una estrecha pesada de tabla de clasificación para lo que se compara de un vistazo, y una sans tranquila para leer.

### Hierarchy
- **Display** (800, 2–2,25 rem, 1,05, mayúsculas): título de cada pantalla.
- **Headline** (800, 22 px, mayúsculas): secciones de Inicio, con filete de 2 px de tinta debajo.
- **Title** (700, 17 px, mayúsculas, 0,02 em): títulos de tarjeta y pestañas de liga (15 px).
- **Cifra** (700–800, 17–21 px, tabular): puestos, notas y cifras de la franja.
- **Body** (400, 14 px, 1,5, tabular): texto y celdas.
- **Label** (700, 12 px, 0,06 em, mayúsculas): cabeceras de tabla y rótulos (`rotulo`).

### Named Rules
**La regla de la estrecha.** Lo que se compara entre filas (puesto, nota, movimiento) va en la estrecha pesada; las frases, nunca.

## Layout

Contenido centrado a 80 rem (max-w-7xl) con 16 px de margen lateral; la cabecera y el pie ocupan todo el ancho. Bloques separados 20 px. El Screener usa hasta 96 rem (cabecera, contenido y pie): una tabla principal con la tarjeta del fondo elegido a la derecha (23 rem) desde 1024 px; por debajo se apilan y la tabla se desplaza dentro de su caja. Bajo las pestañas de tipo de activo, el grupo de ese tipo (región o estilo, tipo de bono, perfil) en botones, siempre a la vista. El resto de filtros y los pesos van en una barra de desplegables sobre la tabla: un botón por grupo (Perfil, Categoría —la categoría y la gestión: todas, indexadas, activas o separadas en dos tablas—, Cartera, Coste y riesgo, Dónde, Pesos) con lo que tiene puesto, en azul si no es lo de por defecto; cada uno abre su panel bajo el botón, y Pesos se abre encima de la ficha para ver la tabla moverse; no bloquean y se cierran con ✕, Esc o al pulsar fuera. Las pestañas de liga se desplazan en horizontal en el móvil.

## Elevation & Depth

Plano. No hay sombras: la profundidad la dan los filetes, el papel de panel sobre el papel de la página y la banda negra de la cabecera. La única «sombra» es una marca: el subrayado amarillo de la pantalla actual (inset de 3 px).

## Shapes

Esquinas casi rectas (1–3 px). Bloques rectangulares, filetes de 1 px, filete de tinta de 2 px bajo pestañas y secciones.

## Components

### Buttons
- **Shape:** casi recto (2 px), 36 px de alto.
- **Primary:** azul de liga con texto blanco; al pasar, el azul se oscurece hacia la tinta.
- **Secondary:** papel de panel con filete; al pasar, el filete se oscurece.
- Sin desplazamientos al pasar el ratón; foco con contorno azul de 2 px.

### Pestañas de liga
- Estrecha, 700, mayúsculas, 15 px; inactivas sobre filete, la activa en tinta con texto papel; filete de tinta de 2 px debajo de todas.

### Cards / Containers
- **Corner Style:** 3 px. **Background:** papel de panel. **Border:** filete de 1 px. **Padding:** 16 px. Sin sombra. Título en Title.

### Inputs / Fields
- Papel de panel con filete; el foco cambia el filete a azul. El cursor de texto es azul.

### Navigation
- Banda negra de 48 px a todo el ancho: marca en estrecha 800 mayúsculas, pantallas con mayúscula inicial al 75 % de opacidad y la actual en seminegrita con subrayado amarillo de 3 px; buscador blanco; tema, contraseña y salir al final. En el móvil, las pantallas bajan a una segunda fila desplazable.

### Clasificación (signature)
Las filas del Screener: amarillo si el fondo es tuyo, puesto en estrecha 800, cuadro del color de cada cartera delante del nombre, «1 mes» con ▲/▼ y los puestos ganados o perdidos desde el lunes de hace 4 semanas (de la nota guardada; «—» si entonces no tenía), nota grande en estrecha (solo la cifra: el desglose por bloques está en la ficha), TER, rentabilidades, volatilidad y Sharpe, y filete de tinta cada cinco filas. Un puesto que no es de esta semana se tacha con su fecha, no se oculta.

### Cinta de índices
Solo en Inicio, bajo la cabecera y a todo el ancho: papel de panel con filete abajo, el periodo (semana, mes, año) a la izquierda y los índices de referencia corriendo despacio en bucle (nombre en estrecha, línea del último año y variación con signo). Se para al pasar el ratón, con el foco, con su botón de pausa o con «reducir movimiento».

### Tablero de carteras
Inicio: una fila por cartera con su tinta, «en el año» en estrecha 800, rentabilidades, riesgo a 3 años, la línea del último año en su tinta, el tipo de activo en tonos neutros (la tinta ya usa los colores de las series) y los avisos. En el móvil, un bloque por cartera.

### Mapa de métricas (ficha)
Métrica × plazo (1, 3, 5, 10 años): cada celda, la cifra en estrecha y su percentil; fondo azul claro en el mejor 25 % de su categoría, rojo claro en el peor 25 %, neutro en medio, sin color si la métrica no tiene mejor ni peor y rayado si no hay cifra. La cabecera de plazos se pega bajo la cabecera de la web al bajar (`--alto-cabecera`). Al lado, el detalle de la celda: la cifra, «mejor que el N %» y la tira frente a su categoría (caja = mitad central, raya = 8 de cada 10, marca = mediana; a la derecha, mejor).

### Novedades
Lista con el tipo en estrecha ámbar (cambio de gestor, salidas o entradas fuertes, patrimonio bajo), el fondo con la tinta de sus carteras, el texto y cuándo. En la ficha, recuadro ámbar suave arriba del Resumen; en Inicio, sección entre carteras y seguimiento, con filtros.

### Cartera
Resumen: gráfico grande con los fondos y sus pesos al lado (y el riesgo que pone cada uno, en pequeño), al pie lo que quita diversificar, quién pone más riesgo y la pareja más parecida; debajo, el año natural en una fila (dos barras por año, cartera y referencia, la cifra y la diferencia), tipo de activo (peso y riesgo) y crisis. «A revisar» es una sola línea ámbar bajo las cifras (señales y novedades), no una tarjeta. Fondos: la franja «la cartera en conjunto» (al editar, con la diferencia frente a la guardada), «Qué pone cada fondo en la cartera» (su papel: peso, hoy, riesgo, aporta, coste, parecido; ahí se editan los pesos) y «Cada fondo en su categoría» (el fondo por sí solo, con selector de plazo). Al editar, un recuadro con borde azul de 2 px sobre las pestañas. Métricas: el mapa de la ficha, pero el color dice mejor o peor que la referencia y el detalle pone en la tira la cartera, la referencia y cada fondo.

### Once
El puesto de un fondo de cartera: bloque amarillo con el puesto en estrecha 800, «de N» y el movimiento del último mes.

## Do's and Don'ts

### Do:
- **Do** sacar puesto y movimiento de la nota guardada (`nota_semanal`), y decirlo en la leyenda.
- **Do** tachar con su fecha un dato que no es de esta semana.
- **Do** usar la tinta de la cartera (`tintas()` en `web/src/calculo/jornada.ts`) siempre que aparezca una cartera.
- **Do** mantener los dos temas: cada color es un token con su valor oscuro.

### Don't:
- **Don't** poner rótulos o antetítulos encima de un título.
- **Don't** usar sombras, degradados ni tarjetas con sombra.
- **Don't** usar el amarillo, el azul o el rojo de liga como decoración.
- **Don't** convertir la pantalla en un artefacto de periódico deportivo: navegación, filtros y tablas siguen siendo controles web normales.
