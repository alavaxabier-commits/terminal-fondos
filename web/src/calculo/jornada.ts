// «La jornada»: cada categoría es una liga. Con los puestos de la nota guardada (nota_semanal, pesos por defecto) de las
// últimas semanas: zona del fondo, puestos ganados o perdidos desde la semana anterior y si su último puesto es viejo.

export type Puestos = { puestos: number[]; fechas: string[]; de: number }
export type Zona = 'alta' | 'media' | 'baja'

/** Cuartil alto (los primeros 25 % de su categoría), bajo (los últimos 25 %) o zona media. */
export function zona(puesto: number, de: number): Zona {
  if (de < 4) return 'media' // shortcut: con menos de 4 fondos no hay cuartiles que digan algo
  if (puesto <= Math.ceil(de / 4)) return 'alta'
  if (puesto > de - Math.ceil(de / 4)) return 'baja'
  return 'media'
}

/** Puestos ganados (+) o perdidos (−) entre las dos últimas semanas en que tuvo nota; null si solo tiene una. */
export function movimiento(p: Puestos): number | null {
  const n = p.puestos.length
  return n < 2 ? null : p.puestos[n - 2] - p.puestos[n - 1]
}

/** Fecha del último puesto si no es de la última semana con notas (el dato es viejo: se enseña tachado, no se oculta). */
export function viejo(p: Puestos, ultimaSemana: string): string | null {
  const f = p.fechas.at(-1)
  return f && f < ultimaSemana ? f : null
}

/** La semana más reciente de todas (la de la jornada). */
export const ultimaSemana = (todos: Iterable<Puestos>) => {
  let u = ''
  for (const p of todos) { const f = p.fechas.at(-1) ?? ''; if (f > u) u = f }
  return u
}

/** Tinta fija de cada cartera: por orden de id (la más antigua, la primera), de las cinco series validadas.
 *  Así una cartera tiene el mismo color en todas las pantallas aunque se ordenen por nombre. */
export function tintas(ids: number[]): Map<number, string> {
  return new Map([...ids].sort((a, b) => a - b).map((id, i) => [id, `var(--color-serie${(i % 5) + 1})`]))
}
