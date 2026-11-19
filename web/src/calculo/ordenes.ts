// Barra de órdenes: qué pantallas y carteras casan con lo escrito (los fondos los da la búsqueda en la base).
export const PANTALLAS = [['#/', 'inicio'], ['#/screener', 'screener'], ['#/seguimiento', 'seguimiento'], ['#/revision', 'revisión'], ['#/comparar', 'comparar']] as const

// Menú: tres grupos; Fondos y Carteras tienen una segunda fila con sus secciones.
export type Grupo = 'inicio' | 'fondos' | 'carteras'
export const SUB_FONDOS = PANTALLAS.filter(([r]) => ['#/screener', '#/seguimiento', '#/comparar'].includes(r))

/** A qué grupo del menú pertenece una ruta (la ficha va con Fondos; el simulador, con Carteras). */
export function grupo(ruta: string): Grupo {
  if (/^#\/(cartera|simular|revision)\b/.test(ruta)) return 'carteras'
  if (/^#\/(fondo|screener|seguimiento|comparar)\b/.test(ruta)) return 'fondos'
  return 'inicio'
}

export type Orden = { tipo: 'pantalla' | 'cartera'; nombre: string; ruta: string }

const llano = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim() // «revision» encuentra «revisión»

/** Primero las pantallas y luego las carteras cuyo nombre contiene lo escrito. */
export function ordenes(texto: string, carteras: { id: number; nombre: string }[]): Orden[] {
  const t = llano(texto)
  if (!t) return []
  return [
    ...PANTALLAS.map(([ruta, nombre]): Orden => ({ tipo: 'pantalla', nombre, ruta })),
    ...carteras.map((c): Orden => ({ tipo: 'cartera', nombre: c.nombre, ruta: `#/cartera/${c.id}` })),
  ].filter((o) => llano(o.nombre).includes(t))
}
