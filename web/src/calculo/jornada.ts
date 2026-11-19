// «La jornada»: cada categoría es una liga. Con los puestos de la nota guardada (nota_semanal, pesos por defecto) de las
// últimas semanas: puestos ganados o perdidos en un mes y si su último puesto es viejo.

export type Puestos = { puestos: number[]; fechas: string[]; de: number }

/**
 * Puestos ganados (+) o perdidos (−) desde el lunes de hace `semanas` semanas (por defecto, un mes) hasta su último puesto;
 * null si ese lunes no tuvo nota (un fondo nuevo, o un hueco): no se compara con otra semana para no mezclar plazos.
 */
export function movimiento(p: Puestos, semanas = 4): number | null {
  const ultima = p.fechas.at(-1)
  if (!ultima) return null
  const d = new Date(`${ultima}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 7 * semanas)
  const i = p.fechas.indexOf(d.toISOString().slice(0, 10))
  return i < 0 ? null : p.puestos[i] - p.puestos.at(-1)!
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
