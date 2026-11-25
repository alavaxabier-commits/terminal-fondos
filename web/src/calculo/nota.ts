// Nota del screener. Los bloques (0–100) los calcula Python (`bloques_fondos` en fondos/calculo.py) y los guarda en la
// tabla metrica (ventana 'nota' y, los que dependen del plazo, 'nota_<plazo>'); aquí solo se leen y se ponderan con los
// pesos elegidos. Los dos lados pasan las notas de caso_metricas.json.

export const BLOQUES = ['coste', 'proteccion', 'consistencia', 'riesgo', 'rentabilidad', 'gestor', 'tamano', 'tir', 'diversificacion'] as const
export type Bloque = (typeof BLOQUES)[number]
export type Pesos = Record<Bloque, number>
const DE_PLAZO: Bloque[] = ['riesgo', 'consistencia', 'proteccion', 'rentabilidad'] // BLOQUES_DE_PLAZO en Python

export const NOMBRE_BLOQUE: Record<Bloque, string> = {
  riesgo: 'Riesgo', consistencia: 'Consistencia', coste: 'Coste', proteccion: 'Protección en caídas',
  rentabilidad: 'Rentabilidad', gestor: 'Estabilidad del gestor', tamano: 'Tamaño y flujos', tir: 'TIR neta',
  diversificacion: 'Diversificación',
}
// Pesos por defecto (PESOS_GRUPO en fondos/nucleo/metricas.py): los activos, la nota nueva; Diversificación solo cuenta
// al buscar para una cartera.
export const PESOS_DEFECTO: Pesos = { coste: 45, proteccion: 20, consistencia: 15, riesgo: 5, rentabilidad: 5, gestor: 5, tamano: 5, tir: 0, diversificacion: 10 }
const PESOS_ANTERIORES: Pesos = { coste: 40, proteccion: 20, consistencia: 10, riesgo: 20, rentabilidad: 10, gestor: 0, tamano: 0, tir: 0, diversificacion: 10 }

/** Tipos de activo (como TIPOS y tipo_activo en fondos/nucleo/metricas.py): cada uno tiene sus pesos. */
export const TIPOS = ['renta variable', 'renta fija', 'mixto', 'monetario', 'otros'] as const
export type Tipo = (typeof TIPOS)[number]
/** Juegos de pesos: uno por tipo de activo y otro para los indexados (de cualquier tipo). */
export const GRUPOS_PESOS = [...TIPOS, 'indexados'] as const
export type GrupoPesos = (typeof GRUPOS_PESOS)[number]
export type PesosTipo = Record<GrupoPesos, Pesos>
export const grupoPesos = (categoria: string | null, indexada: boolean): GrupoPesos => (indexada ? 'indexados' : tipoActivo(categoria))

/** Tipo de activo por el nombre de la categoría de Morningstar (Equity, Bond, Allocation, Money Market…). */
export function tipoActivo(categoria: string | null): Tipo {
  const c = categoria ?? ''
  if (/allocation/i.test(c)) return 'mixto' // antes que equity: «GBP Allocation 80%+ Equity»
  if (/equity/i.test(c)) return 'renta variable'
  if (/bond|fixed|debt|credit/i.test(c)) return 'renta fija'
  if (/money market/i.test(c)) return 'monetario'
  return 'otros'
}

/** Pesos por defecto de cada grupo (PESOS_GRUPO en Python): monetarios e indexados siguen con su nota de siempre (los
 * indexados, casi todo seguimiento del índice y coste). */
export const PESOS_TIPO_DEFECTO: PesosTipo = {
  ...(Object.fromEntries(TIPOS.map((t) => [t, PESOS_DEFECTO])) as Record<Tipo, Pesos>),
  monetario: PESOS_ANTERIORES,
  indexados: { ...PESOS_ANTERIORES, riesgo: 0, consistencia: 60, coste: 30, proteccion: 10, rentabilidad: 0 },
}

/** Pesos guardados (perfil o pestaña) → pesos por tipo: un juego único (perfiles antiguos) vale para todos los tipos;
 * lo que falte, por defecto. */
export function aPesosTipo(p: unknown): PesosTipo {
  const o = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>
  const plano = BLOQUES.some((b) => typeof o[b] === 'number')
  return Object.fromEntries(GRUPOS_PESOS.map((t) => {
    const x = (plano ? o : o[t]) as Partial<Pesos> | undefined
    return [t, { ...PESOS_TIPO_DEFECTO[t], ...(x && typeof x === 'object' ? x : {}) }]
  })) as PesosTipo
}

export const PLAZOS = ['1a', '3a', '5a', '10a'] as const
export type Plazo = (typeof PLAZOS)[number]

/** Bloques de un fondo leídos de sus filas de metrica {'ventana|nombre': puntuación} y si va con 3A por no tener 5;
 * null sin nota. Con `plazo`, los que dependen del plazo son los de ese plazo (null si el fondo no lo tiene). */
export function bloques(pct: Record<string, number>, plazo?: Plazo): { bloques: Partial<Record<Bloque, number>>; solo3a: boolean } | null {
  const de = (ventana: string) => Object.fromEntries(BLOQUES.filter((k) => `${ventana}|${k}` in pct).map((k) => [k, pct[`${ventana}|${k}`]])) as Partial<Record<Bloque, number>>
  const base = de('nota')
  if (!Object.keys(base).length) return null
  if (!plazo) return { bloques: base, solo3a: pct['nota|solo3a'] === 1 }
  const propios = de(`nota_${plazo}`)
  if (!Object.keys(propios).length) return null
  const fijos = Object.fromEntries(Object.entries(base).filter(([k]) => !DE_PLAZO.includes(k as Bloque)))
  return { bloques: { ...fijos, ...propios }, solo3a: false }
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
