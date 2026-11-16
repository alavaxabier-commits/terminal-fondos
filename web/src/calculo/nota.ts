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

/** Tipos de activo (como TIPOS y tipo_activo en fondos/nucleo/metricas.py): cada uno tiene sus pesos. */
export const TIPOS = ['renta variable', 'renta fija', 'mixto', 'monetario', 'otros'] as const
export type Tipo = (typeof TIPOS)[number]
export type PesosTipo = Record<Tipo, Pesos>

/** Tipo de activo por el nombre de la categoría de Morningstar (Equity, Bond, Allocation, Money Market…). */
export function tipoActivo(categoria: string | null): Tipo {
  const c = categoria ?? ''
  if (/allocation/i.test(c)) return 'mixto' // antes que equity: «GBP Allocation 80%+ Equity»
  if (/equity/i.test(c)) return 'renta variable'
  if (/bond|fixed|debt|credit/i.test(c)) return 'renta fija'
  if (/money market/i.test(c)) return 'monetario'
  return 'otros'
}

/** Pesos por defecto de cada tipo: de momento los mismos (PESOS_TIPO en Python). */
export const PESOS_TIPO_DEFECTO: PesosTipo = Object.fromEntries(TIPOS.map((t) => [t, PESOS_DEFECTO])) as PesosTipo

/** Pesos guardados (perfil o pestaña) → pesos por tipo: un juego único (perfiles antiguos) vale para todos los tipos;
 * lo que falte, por defecto. */
export function aPesosTipo(p: unknown): PesosTipo {
  const o = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>
  const plano = BLOQUES.some((b) => typeof o[b] === 'number')
  return Object.fromEntries(TIPOS.map((t) => {
    const x = (plano ? o : o[t]) as Partial<Pesos> | undefined
    return [t, { ...PESOS_TIPO_DEFECTO[t], ...(x && typeof x === 'object' ? x : {}) }]
  })) as PesosTipo
}

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
