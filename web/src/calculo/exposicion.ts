// X-Ray de una cartera modelo (sin red): la composición de cada fondo ponderada por su peso, como Morningstar.
// Los desgloses de renta variable (regiones, sectores) son % de la parte en acciones de cada fondo y se ponderan por
// peso × % en acciones; los de renta fija, por peso × % en bonos y liquidez. Así cada bloque suma ~100 sobre su parte.

export type Desglose = Record<string, number>
export type Posicion = { nombre: string; isin?: string; peso: number; tipo?: string }
export type Composicion = {
  activos?: { neto?: Desglose; corto?: Desglose }
  regiones?: Desglose
  sectores_rv?: Desglose
  sectores_rf?: Desglose
  calidad_rf?: Desglose
  estadisticas_rf?: Record<string, number | string>
  posiciones?: Posicion[]
  posiciones_todas?: boolean
}
export type Fila = [nombre: string, pct: number]

// Códigos de Morningstar → nombre (comprobados con los países y sectores de fondos reales)
export const ACTIVOS: Record<string, string> = {
  '1': 'Acciones', '3': 'Bonos', '5': 'Preferentes', '6': 'Convertibles', '7': 'Liquidez', '8': 'Otros', '99': 'Sin clasificar',
}
export const REGIONES: Record<string, string> = {
  '1': 'Estados Unidos', '2': 'Canadá', '3': 'Latinoamérica', '4': 'Reino Unido', '5': 'Zona euro', '6': 'Europa fuera del euro',
  '7': 'Europa emergente', '8': 'África', '9': 'Oriente Medio', '10': 'Japón', '11': 'Australasia', '12': 'Asia desarrollada',
  '13': 'Asia emergente',
}
const MERCADOS: Record<string, string> = { '15': 'Desarrollados', '14': 'Emergentes' }
export const SECTORES: Record<string, string> = {
  '101': 'Materiales básicos', '102': 'Consumo cíclico', '103': 'Servicios financieros', '104': 'Inmobiliario',
  '205': 'Consumo defensivo', '206': 'Salud', '207': 'Servicios públicos', '308': 'Comunicaciones', '309': 'Energía',
  '310': 'Industria', '311': 'Tecnología',
}
export const SECTORES_RF: Record<string, string> = {
  '10': 'Gubernamental', '20': 'Municipal', '30': 'Corporativo', '40': 'Titulizado', '50': 'Liquidez', '60': 'Derivados',
}
export const CALIDAD: Record<string, string> = {
  '2': 'AAA', '3': 'AA', '4': 'A', '5': 'BBB', '6': 'BB', '7': 'B', '8': 'Inferior a B', '9': 'Sin calificación',
}

type Parte = { w: number; d?: Desglose }

/** Media ponderada de desgloses, solo con las partes que lo tienen; con nombres y de mayor a menor. */
export function mezclar(partes: Parte[], nombres: Record<string, string>): Fila[] {
  const validas = partes.filter((p) => p.d && p.w > 0)
  const total = validas.reduce((s, p) => s + p.w, 0)
  if (!total) return []
  const suma = new Map<string, number>()
  for (const p of validas)
    for (const [k, v] of Object.entries(p.d!)) if (nombres[k]) suma.set(nombres[k], (suma.get(nombres[k]) ?? 0) + (p.w * v) / total)
  return [...suma].filter(([, v]) => Math.abs(v) >= 0.05).sort((a, b) => b[1] - a[1])
}

export type Fondo = { peso: number; nombre: string; c: Composicion | null; duracion?: number | null }
export type Exposicion = {
  cobertura: number // % del peso de la cartera con composición
  activos: Fila[]
  regiones: Fila[]
  mercados: Fila[]
  sectores: Fila[]
  sectoresRf: Fila[]
  calidad: Fila[]
  tir: number | null // % medio de la parte en bonos
  duracion: number | null // años
  posiciones: { nombre: string; isin?: string; peso: number; fondos: number }[]
  incompletas: string[] // fondos de los que Morningstar no da todas las posiciones
  cortos: string[] // fondos con posiciones cortas (las cifras son netas)
}

export function exposicion(fondos: Fondo[]): Exposicion {
  const con = fondos.filter((f) => f.c?.activos?.neto)
  const total = fondos.reduce((s, f) => s + f.peso, 0) || 1
  const neto = (f: Fondo, k: string) => f.c!.activos!.neto![k] ?? 0
  const rv = (f: Fondo) => f.peso * neto(f, '1')
  const rf = (f: Fondo) => f.peso * (neto(f, '3') + neto(f, '7'))
  const media = (partes: { w: number; v: number | null | undefined }[]) => {
    const ok = partes.filter((p) => p.v != null && isFinite(p.v) && p.w > 0)
    const w = ok.reduce((s, p) => s + p.w, 0)
    return w ? ok.reduce((s, p) => s + p.w * p.v!, 0) / w : null
  }

  const posiciones = new Map<string, { nombre: string; isin?: string; peso: number; fondos: number }>()
  for (const f of con)
    for (const p of f.c!.posiciones ?? []) {
      if (p.tipo === 'C') continue // liquidez: ya está en «Tipo de activo», no es una posición
      const k = p.isin || p.nombre
      const x = posiciones.get(k) ?? { nombre: p.nombre, isin: p.isin, peso: 0, fondos: 0 }
      x.peso += (f.peso / total) * p.peso
      x.fondos += 1
      posiciones.set(k, x)
    }

  return {
    cobertura: (con.reduce((s, f) => s + f.peso, 0) / total) * 100,
    activos: mezclar(con.map((f) => ({ w: f.peso, d: f.c!.activos!.neto })), ACTIVOS),
    regiones: mezclar(con.map((f) => ({ w: rv(f), d: f.c!.regiones })), REGIONES),
    mercados: mezclar(con.map((f) => ({ w: rv(f), d: f.c!.regiones })), MERCADOS),
    sectores: mezclar(con.map((f) => ({ w: rv(f), d: f.c!.sectores_rv })), SECTORES),
    sectoresRf: mezclar(con.map((f) => ({ w: rf(f), d: f.c!.sectores_rf })), SECTORES_RF),
    calidad: mezclar(con.map((f) => ({ w: f.peso * neto(f, '3'), d: f.c!.calidad_rf })), CALIDAD),
    tir: media(con.map((f) => ({ w: f.peso * neto(f, '3'), v: Number(f.c!.estadisticas_rf?.YieldToMaturity ?? NaN) }))),
    duracion: media(con.map((f) => ({ w: f.peso * neto(f, '3'), v: f.duracion == null ? null : Number(f.duracion) }))),
    posiciones: [...posiciones.values()].sort((a, b) => b.peso - a.peso),
    incompletas: con.filter((f) => !f.c!.posiciones_todas).map((f) => f.nombre),
    cortos: con.filter((f) => Object.values(f.c!.activos!.corto ?? {}).some((v) => v > 0.5)).map((f) => f.nombre),
  }
}
