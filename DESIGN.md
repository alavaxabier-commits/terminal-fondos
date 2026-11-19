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
  tinte-alta: "#d7e2f4"
  tinte-baja: "#f5dbd5"
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

<!-- impeccable:design-map -->
Name: Terminal de fondos
Colors: primary: azul-liga #1d4f9f; secondary: zona-baja #c0392b; neutral: papel #f3f2ec; secondary: amarillo-once #f0c23a; neutral: tinta #141414
Fonts: Barlow Condensed (display, headline, title, cifra, label); Barlow (body); DM Mono (codigo)
Spacing: pantalla 16px, bloque 20px
Radius: xs 1px, sm 2px, md 2px, lg 3px
North Star: "La jornada"
Don't:
- Don't poner rótulos o antetítulos encima de un título.
- Don't usar sombras, degradados ni tarjetas con sombra. Excepciones funcionales: el anillo del color del panel que recorta los puntos de las tiras, y el desvanecido de los bordes de la cinta y de las pantallas de la cabecera en el móvil (dicen que hay más).
- Don't usar el amarillo, el azul o el rojo de liga como decoración.
- Don't convertir la pantalla en un artefacto de periódico deportivo: navegación, filtros y tablas siguen siendo controles web normales.
Do:
- Do enseñar el percentil con un solo lenguaje en toda la web: tinte y texto azules en el mejor cuarto (≥ 75), rojos en el peor (< 25), neutros en medio (`colorPercentil` y `fondoPercentil` en `calculo/formato.ts`).
- Do poner a la vista, en una leyenda, lo que dice cada marca de una tabla; el `title` solo repite.
- Do sacar puesto y movimiento de la nota guardada (`nota_semanal`), y decirlo en la leyenda.
- Do tachar con su fecha un dato que no es de esta semana.
- Do usar la tinta de la cartera (`tintas()` en `web/src/calculo/jornada.ts`) siempre que aparezca una cartera.
- Do mantener los dos temas: cada color es un token con su valor oscuro.
Map: web/src/calculo/jornada.ts
Full: .impeccable/design-full.md (read a section when you need its detail)
