---
version: 1
slug: "web-src-pantallas-ficha-tsx"
primary_target: "web/src/pantallas/Ficha.tsx"
related_targets: []
---

# Ficha de fondo

Modo: Operate. Primera pantalla del rediseño de toda la terminal: lo que se decida aquí (tokens, tipografía, componentes comunes) pasa al resto.

Quién y para qué: Xabier, en el ordenador y con calma, decide si un fondo entra, sigue o sale de una cartera modelo. Necesita ver de un vistazo la nota, cómo queda frente a su categoría y su historia, con cifras que coinciden con Morningstar.

Restricciones: todas las cifras salen de `metrica`; nada de cifras inventadas; español; tema claro y oscuro.

## Direction contract

THESIS: la convención del sector, hecha al nivel de Linear y del panel de Stripe. Se niega el panel genérico gris con tarjetas redondeadas y degradados, y también la estética anterior de terminal nocturna.

OWN-WORLD: neutros cálidos (no grises fríos), blanco de panel, un solo acento añil para selección y acción, verde y rojo solo para subir y bajar, ámbar para avisos. Inter con cifras tabulares; mono solo para ISIN y códigos. Radios de 6 px, bordes de un píxel, sombras mínimas solo en lo que flota.

STORY: entra desde el buscador o una lista, lee la nota y las cinco cifras clave con su percentil, comprueba el gráfico y la comparación con su categoría y decide: seguir, comparar o ir a su cartera.

FIRST VIEWPORT: cabecera con categoría, nombre, ISIN y estado (seguimiento, MyInvestor, carteras) y las dos acciones a la derecha; franja de cinco cifras con percentil; pestañas; gráfico de valor (dos tercios) y «Frente a su categoría» (un tercio).

FORM: la salida estándar (canon), elegida tras dos tiradas; seed:31e1b6fbaae08996.

SIGNATURE: el percentil al lado de cada cifra como barra fina con el mismo código en toda la app; las acciones con su atajo de teclado visible.
