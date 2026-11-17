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
  zona-alta: "#1d4f9f"
  zona-baja: "#c0392b"
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

Cada categoría de fondos es una liga y el Screener es su clasificación del lunes. Se ve el puesto de cada fondo, la zona en la que está (cuartil alto o bajo), cuántos puestos ha ganado o perdido en la semana y por dónde andan los fondos de tus carteras. El mundo viene de las tablas de clasificación de la prensa deportiva, pero solo presta letra, color, densidad y un gesto: la navegación, los filtros y las tablas son los controles normales de una aplicación web.

La pantalla es papel claro con tinta negra, pensada para una revisión semanal tranquila a la luz del día. Una cabecera negra a todo el ancho da el carácter. El color hace trabajos concretos: azul de liga para la zona alta y el acento, rojo de liga para la zona baja, amarillo solo para lo tuyo. Lo que se rechaza: el aspecto de bróker (oscuro con neón, verde y rojo por todas partes) y el panel de tarjetas blancas de cualquier aplicación.

**Key Characteristics:**
- Cabecera negra con la pantalla actual subrayada en amarillo.
- Puestos, notas y cifras en letra estrecha y pesada (Barlow Condensed), con números tabulares.
- Franja de zona al borde de las filas y tinte suave en las del cuartil alto y bajo.
- Filete fuerte cada cinco filas en las clasificaciones.
- Un color fijo por cartera (por orden de creación) en todas las pantallas.

## Colors

Papel claro y tinta negra, con tres colores de liga que solo aparecen cuando significan algo.

### Primary
- **Azul de liga** (#1d4f9f): acento (enlaces, selección, orden activo, botón principal) y zona alta de la clasificación. En oscuro, #86aef0 para el acento y #5f8fdc para la zona.

### Secondary
- **Rojo de liga** (#c0392b): solo la zona baja (franja y flecha de puestos perdidos).
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
**La regla de la zona.** Azul y rojo de liga marcan cuartiles de la clasificación; no se usan como decoración ni para subir o bajar de valor.

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

Contenido centrado a 80 rem (max-w-7xl) con 16 px de margen lateral; la cabecera y el pie ocupan todo el ancho. Bloques separados 20 px. El Screener es una tabla principal con la tarjeta del fondo elegido a la derecha (23 rem) desde 1024 px; por debajo se apilan y la tabla se desplaza dentro de su caja. Las pestañas de liga se desplazan en horizontal en el móvil.

## Elevation & Depth

Plano. No hay sombras: la profundidad la dan los filetes, el papel de panel sobre el papel de la página y la banda negra de la cabecera. Las únicas «sombras» son marcas: la franja de zona (inset de 5 px) y el subrayado amarillo de la pantalla actual (inset de 3 px).

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
- Banda negra de 48 px a todo el ancho: marca en estrecha 800 mayúsculas, pantallas en minúsculas al 75 % de opacidad y la actual en seminegrita con subrayado amarillo de 3 px; buscador blanco; tema, contraseña y salir al final. En el móvil, las pantallas bajan a una segunda fila desplazable.

### Clasificación (signature)
Las filas del Screener: franja de zona al borde (azul cuartil alto, rojo cuartil bajo, de la nota guardada del lunes), tinte de zona o amarillo si el fondo es tuyo, puesto en estrecha 800, cuadro del color de cada cartera delante del nombre, «Sem.» con ▲/▼ y los puestos ganados o perdidos, línea de puestos de 8 semanas (arriba, mejor), nota grande con su barra por bloques y filete de tinta cada cinco filas. Un puesto que no es de esta semana se tacha con su fecha, no se oculta.

### Once
El puesto de un fondo de cartera: bloque amarillo con el puesto en estrecha 800, «de N» y el movimiento de la semana.

## Do's and Don'ts

### Do:
- **Do** sacar puesto, zona y movimiento de la nota guardada (`nota_semanal`), y decirlo en la leyenda.
- **Do** tachar con su fecha un dato que no es de esta semana.
- **Do** usar la tinta de la cartera (`tintas()` en `calculo/jornada.ts`) siempre que aparezca una cartera.
- **Do** mantener los dos temas: cada color es un token con su valor oscuro.

### Don't:
- **Don't** poner rótulos o antetítulos encima de un título.
- **Don't** usar sombras, degradados ni tarjetas con sombra.
- **Don't** usar el amarillo, el azul o el rojo de liga como decoración.
- **Don't** convertir la pantalla en un artefacto de periódico deportivo: navegación, filtros y tablas siguen siendo controles web normales.
