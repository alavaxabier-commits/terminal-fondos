// Nota del screener: port de `nota()` en fondos/nucleo/metricas.py (los dos pasan las notas de caso_metricas.json).
// Cada bloque promedia los percentiles de sus métricas (de la tabla metrica, dentro de la categoría); la nota es la
// media ponderada de los bloques con datos: el peso de un bloque sin datos se reparte entre los demás.

export const BLOQUES = ['riesgo', 'consistencia', 'coste', 'proteccion', 'rentabilidad', 'diversificacion'] as const
export type Bloque = (typeof BLOQUES)[number]
export type Pesos = Record<Bloque, number>

export const NOMBRE_BLOQUE: Record<Bloque, string> = {
  riesgo: 'Rentab. ajustada al riesgo', consistencia: 'Consistencia', coste: 'Coste',
  proteccion: 'Protección en caídas', rentabilidad: 'Rentabilidad', diversificacion: 'Diversificación',
}
export const PESOS_DEFECTO: Pesos = { riesgo: 20, consistencia: 10, coste: 40, proteccion: 20, rentabilidad: 10, diversificacion: 10 }

export const PLAZOS = ['1a', '3a', '5a', '10a'] as const
export type Plazo = (typeof PLAZOS)[number]

/** Percentiles de un fondo {'ventana|nombre': percentil} → percentil de cada bloque y si va con 3A por no tener 5; null
 * sin 3 años. Con `plazo`, solo ese plazo (null si el fondo no lo tiene). */
export function bloques(pct: Record<string, number>, indexada: boolean, plazo?: Plazo): { bloques: Partial<Record<Bloque, number>>; solo3a: boolean } | null {
  const v = plazo ?? ('5a|rentabilidad' in pct ? '5a' : '3a|rentabilidad' in pct ? '3a' : null)
  if (!v || !(`${v}|rentabilidad` in pct)) return null
  const largo = v === '5a' || v === '10a'
  const media = (...claves: string[]) => {
    const xs = claves.filter((k) => k in pct).map((k) => pct[k])
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined
  }
  const b: Partial<Record<Bloque, number | undefined>> = {
    riesgo: media(`${v}|sharpe`, `${v}|sortino`),
    consistencia: indexada ? media(`${v}|tracking_error`)
      : media(...(largo ? ['hist|consistencia'] : []), `${largo ? '3a' : v}|ratio_informacion`),
    coste: media('hoy|ter'),
    proteccion: media(`${v}|max_caida`, `${v}|captura_bajista`),
    rentabilidad: media(`${v}|rentabilidad`),
  }
  return { bloques: Object.fromEntries(Object.entries(b).filter(([, x]) => x !== undefined)) as Partial<Record<Bloque, number>>, solo3a: !plazo && v === '3a' }
}

/** Peso efectivo de cada bloque con datos (suma 1); los bloques sin datos o con peso 0 no aparecen. */
export function pesosEfectivos(b: Partial<Record<Bloque, number>>, pesos: Pesos): Partial<Record<Bloque, number>> {
  const con = BLOQUES.filter((k) => b[k] !== undefined && pesos[k] > 0)
  const total = con.reduce((s, k) => s + pesos[k], 0)
  return total ? Object.fromEntries(con.map((k) => [k, pesos[k] / total])) : {}
}

export function nota(b: Partial<Record<Bloque, number>>, pesos: Pesos): number | null {
  const w = Object.entries(pesosEfectivos(b, pesos)) as [Bloque, number][]
  return w.length ? w.reduce((s, [k, x]) => s + x * b[k]!, 0) : null
}
