// X-Ray de una cartera modelo (sin red): la composición de cada fondo ponderada por su peso, como Morningstar.
// Los desgloses de renta variable (regiones, sectores, estilo…) son % de la parte en acciones de cada fondo y se ponderan
// por peso × % en acciones; los de renta fija, por peso × % en bonos (o bonos y liquidez). Cada bloque suma ~100 sobre su parte.

export type Desglose = Record<string, number>
export type Posicion = { nombre: string; isin?: string; peso: number; tipo?: string; sector?: string; pais?: string }
export type Composicion = {
  activos?: { neto?: Desglose; corto?: Desglose }
  regiones?: Desglose
  paises_rv?: Desglose
  sectores_rv?: Desglose
  estilo_rv?: Desglose
  capitalizacion?: Desglose
  estadisticas_rv?: Record<string, number | string>
  sectores_rf?: Desglose
  calidad_rf?: Desglose
  estilo_rf?: Desglose
  estadisticas_rf?: Record<string, number | string>
  posiciones?: Posicion[]
  posiciones_todas?: boolean
}
export type Fila = [nombre: string, pct: number]
type Nombres = Record<string, string> | ((codigo: string) => string | undefined)

// Códigos de Morningstar → nombre (comprobados con los países, sectores y duraciones de fondos reales)
export const ACTIVOS: Record<string, string> = {
  '1': 'Acciones', '3': 'Bonos', '5': 'Preferentes', '6': 'Convertibles', '7': 'Liquidez', '8': 'Otros', '99': 'Sin clasificar',
}
export const REGIONES: Record<string, string> = {
  '1': 'Estados Unidos', '2': 'Canadá', '3': 'Latinoamérica', '4': 'Reino Unido', '5': 'Zona euro', '6': 'Europa fuera del euro',
  '7': 'Europa emergente', '8': 'África', '9': 'Oriente Medio', '10': 'Japón', '11': 'Australasia', '12': 'Asia desarrollada',
  '13': 'Asia emergente',
}
const BLOQUES_REGION: [string, string[]][] = [
  ['América', ['1', '2', '3']],
  ['Europa, África y Oriente Medio', ['4', '5', '6', '7', '8', '9']],
  ['Asia y Oceanía', ['10', '11', '12', '13']],
]
const MERCADOS: Record<string, string> = { '15': 'Desarrollados', '14': 'Emergentes' }
export const SECTORES: Record<string, string> = {
  '101': 'Materiales básicos', '102': 'Consumo cíclico', '103': 'Servicios financieros', '104': 'Inmobiliario',
  '205': 'Consumo defensivo', '206': 'Salud', '207': 'Servicios públicos', '308': 'Comunicaciones', '309': 'Energía',
  '310': 'Industria', '311': 'Tecnología',
}
const GRUPOS_SECTOR: [string, string][] = [['Cíclico', '1'], ['Sensible', '3'], ['Defensivo', '2']] // primera cifra del código
const CAPITALIZACION: Record<string, string> = { '1': 'Gigante', '2': 'Grande', '3': 'Mediana', '4': 'Pequeña', '5': 'Micro' }
export const SECTORES_RF: Record<string, string> = {
  '10': 'Gubernamental', '20': 'Municipal', '30': 'Corporativo', '40': 'Titulizado', '50': 'Liquidez', '60': 'Derivados',
}
export const CALIDAD: Record<string, string> = {
  '2': 'AAA', '3': 'AA', '4': 'A', '5': 'BBB', '6': 'BB', '7': 'B', '8': 'Inferior a B', '9': 'Sin calificación',
}
// Cajas de estilo 3×3: casillas 1–9 por filas desde arriba a la izquierda
const CASILLAS: Record<string, string> = Object.fromEntries(['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((c) => [c, c]))
export const CAJA_RV = { filas: ['Grande', 'Mediana', 'Pequeña'], cols: ['Valor', 'Mixto', 'Crecim.'] }
export const CAJA_RF = { filas: ['Alta', 'Media', 'Baja'], cols: ['Baja', 'Media', 'Alta'], fila: 'Calidad crediticia', col: 'Sensibilidad a los tipos' }

// shortcut: media ponderada simple; Morningstar usa la armónica para los múltiplos (PER…), que da algo menos. Basta para comparar.
const ESTAD_RV: [string, string, string][] = [
  ['PER', 'ProspectiveEarningsYield', ''], // pese al nombre, Morningstar da aquí el múltiplo (iShares Dev. World: 18)
  ['Precio / valor contable', 'ProspectiveBookValueYield', ''],
  ['Precio / flujo de caja', 'ProspectiveCashFlowYield', ''],
  ['Rentabilidad por dividendo', 'ProspectiveDividendYield', '%'],
  ['ROE', 'ROE', '%'],
  ['Crecimiento esperado del beneficio', 'ForecastedEarningsGrowth', '%'],
]
const ESTAD_RF: [string, string, string][] = [
  ['TIR', 'YieldToMaturity', '%'],
  ['Cupón medio', 'AverageCoupon', '%'],
  ['Rentabilidad corriente', 'CurrentYield', '%'],
  ['Precio medio', 'AveragePrice', ''],
  ['Duración modificada', 'ModifiedDuration', 'años'],
  ['Vencimiento efectivo', 'EffectiveMaturity', 'años'],
]
// Países (ISO de tres letras) → nombre; los que no estén se enseñan con su código
const PAISES: Record<string, string> = {
  USA: 'Estados Unidos', CAN: 'Canadá', MEX: 'México', BRA: 'Brasil', CHL: 'Chile', COL: 'Colombia', PER: 'Perú', ARG: 'Argentina',
  GBR: 'Reino Unido', IRL: 'Irlanda', FRA: 'Francia', DEU: 'Alemania', ESP: 'España', ITA: 'Italia', PRT: 'Portugal',
  NLD: 'Países Bajos', BEL: 'Bélgica', LUX: 'Luxemburgo', AUT: 'Austria', FIN: 'Finlandia', GRC: 'Grecia', CHE: 'Suiza',
  SWE: 'Suecia', NOR: 'Noruega', DNK: 'Dinamarca', POL: 'Polonia', CZE: 'Chequia', HUN: 'Hungría', ROU: 'Rumanía', TUR: 'Turquía',
  RUS: 'Rusia', ISR: 'Israel', SAU: 'Arabia Saudí', ARE: 'Emiratos Árabes', QAT: 'Catar', KWT: 'Kuwait', ZAF: 'Sudáfrica',
  EGY: 'Egipto', JPN: 'Japón', CHN: 'China', HKG: 'Hong Kong', TWN: 'Taiwán', KOR: 'Corea del Sur', IND: 'India',
  IDN: 'Indonesia', MYS: 'Malasia', THA: 'Tailandia', PHL: 'Filipinas', SGP: 'Singapur', VNM: 'Vietnam', AUS: 'Australia',
  NZL: 'Nueva Zelanda', CYM: 'Islas Caimán', BMU: 'Bermudas', JEY: 'Jersey', GGY: 'Guernsey', CUW: 'Curazao', PAN: 'Panamá',
}

// Las posiciones traen sector y país con nombre en inglés (los desgloses, con código)
const SECTOR_POSICION: Record<string, string> = {
  'Basic Materials': 'Materiales básicos', 'Consumer Cyclical': 'Consumo cíclico', 'Financial Services': 'Servicios financieros',
  'Real Estate': 'Inmobiliario', 'Consumer Defensive': 'Consumo defensivo', Healthcare: 'Salud', Utilities: 'Servicios públicos',
  'Communication Services': 'Comunicaciones', Energy: 'Energía', Industrials: 'Industria', Technology: 'Tecnología',
  government: 'Gubernamental', governmentRelated: 'Agencias y supranacionales', municipal: 'Municipal', corporate: 'Corporativo',
  'Corporate Bond': 'Corporativo', securitized: 'Titulizado', 'Asset Backed': 'Titulizado', derivative: 'Derivados', Swap: 'Derivados',
}
const PAIS_POSICION: Record<string, string> = {
  'United States': 'Estados Unidos', 'United Kingdom': 'Reino Unido', Germany: 'Alemania', France: 'Francia', Japan: 'Japón',
  Netherlands: 'Países Bajos', Switzerland: 'Suiza', Canada: 'Canadá', Spain: 'España', Italy: 'Italia', Ireland: 'Irlanda',
  Sweden: 'Suecia', Denmark: 'Dinamarca', Finland: 'Finlandia', Norway: 'Noruega', Belgium: 'Bélgica', Austria: 'Austria',
  Luxembourg: 'Luxemburgo', Portugal: 'Portugal', Australia: 'Australia', 'New Zealand': 'Nueva Zelanda', China: 'China',
  'Hong Kong': 'Hong Kong', Taiwan: 'Taiwán', 'South Korea': 'Corea del Sur', India: 'India', Singapore: 'Singapur',
  Brazil: 'Brasil', Mexico: 'México', Colombia: 'Colombia', Chile: 'Chile', 'South Africa': 'Sudáfrica', Israel: 'Israel',
  Supranational: 'Supranacional', Poland: 'Polonia', Hungary: 'Hungría', 'Saudi Arabia': 'Arabia Saudí',
}

type Parte = { w: number; d?: Desglose }

/** Media ponderada de desgloses, solo con las partes que lo tienen; con nombres y de mayor a menor. */
export function mezclar(partes: Parte[], nombres: Nombres): Fila[] {
  const nombre = typeof nombres === 'function' ? nombres : (k: string) => nombres[k]
  const validas = partes.filter((p) => p.d && p.w > 0)
  const total = validas.reduce((s, p) => s + p.w, 0)
  if (!total) return []
  const suma = new Map<string, number>()
  for (const p of validas)
    for (const [k, v] of Object.entries(p.d!)) {
      const n = nombre(k)
      if (n) suma.set(n, (suma.get(n) ?? 0) + (p.w * v) / total)
    }
  return [...suma].filter(([, v]) => Math.abs(v) >= 0.05).sort((a, b) => b[1] - a[1])
}

/** Media ponderada de un número, con las partes que lo tienen. */
function media(partes: { w: number; v: unknown }[]): number | null {
  const ok = partes.filter((p) => p.v != null && p.v !== '' && isFinite(Number(p.v)) && p.w > 0)
  const w = ok.reduce((s, p) => s + p.w, 0)
  return w ? ok.reduce((s, p) => s + p.w * Number(p.v), 0) / w : null
}

const caja = (filas: Fila[]) => Object.fromEntries(filas) as Record<string, number>
const de = (filas: Fila[], nombre: string) => filas.find(([n]) => n === nombre)?.[1] ?? 0

export type Fondo = { peso: number; nombre: string; c: Composicion | null; duracion?: number | null }
export type Grupo = { nombre: string; pct: number; filas: Fila[] }
export type Cifra = [nombre: string, valor: number | null, unidad: string]
export type PosicionCartera = { nombre: string; isin?: string; peso: number; fondos: number; sector?: string; pais?: string; tipo?: string; de?: Set<string> }
export type Exposicion = {
  cobertura: number // % del peso de la cartera con composición
  activos: Fila[]
  rv: number // % en acciones
  rf: number // % en bonos, liquidez y el resto
  regiones: Grupo[] // América / Europa… / Asia, con sus regiones
  mercados: Fila[]
  paises: Fila[]
  sectores: Grupo[] // cíclico / sensible / defensivo, con sus sectores
  estiloRv: Record<string, number> // casilla 1–9 → %
  capitalizacion: Fila[]
  estadisticasRv: Cifra[]
  sectoresRf: Fila[]
  calidad: Fila[]
  estiloRf: Record<string, number>
  estadisticasRf: Cifra[]
  acciones: PosicionCartera[] // posiciones en acciones, % de la cartera
  otras: PosicionCartera[] // bonos y el resto (sin la liquidez)
  incompletas: string[] // fondos de los que Morningstar no da todas las posiciones
  cortos: string[] // fondos con posiciones cortas (las cifras son netas)
}

export function exposicion(fondos: Fondo[]): Exposicion {
  const con = fondos.filter((f) => f.c?.activos?.neto)
  const total = fondos.reduce((s, f) => s + f.peso, 0) || 1
  const neto = (f: Fondo, k: string) => f.c!.activos!.neto![k] ?? 0
  const rv = (f: Fondo) => f.peso * neto(f, '1')
  const bonos = (f: Fondo) => f.peso * neto(f, '3')
  const parte = (w: (f: Fondo) => number, d: (c: Composicion) => Desglose | undefined) => con.map((f) => ({ w: w(f), d: d(f.c!) }))

  const activos = mezclar(parte((f) => f.peso, (c) => c.activos!.neto), ACTIVOS)
  const regiones = mezclar(parte(rv, (c) => c.regiones), REGIONES)
  const sectores = mezclar(parte(rv, (c) => c.sectores_rv), SECTORES)

  const posiciones = new Map<string, PosicionCartera>()
  for (const f of con)
    for (const p of f.c!.posiciones ?? []) {
      if (p.tipo === 'C' || p.sector === 'cashAndEquivalents') continue // liquidez: ya está en «Tipo de activo»
      const k = p.isin || p.nombre
      const x = posiciones.get(k) ?? {
        nombre: p.nombre, isin: p.isin, peso: 0, fondos: 0, tipo: p.tipo,
        sector: p.sector && (SECTOR_POSICION[p.sector] ?? p.sector), pais: p.pais && (PAIS_POSICION[p.pais] ?? p.pais),
      }
      x.peso += (f.peso / total) * p.peso
      x.de = (x.de ?? new Set()).add(f.nombre) // una línea repetida en el mismo fondo no cuenta como otro fondo
      x.fondos = x.de.size
      posiciones.set(k, x)
    }
  const todas = [...posiciones.values()].map(({ de: _, ...p }) => p).sort((a, b) => b.peso - a.peso)
  const cifras = (lista: [string, string, string][], w: (f: Fondo) => number, est: (c: Composicion) => Record<string, number | string> | undefined): Cifra[] =>
    lista.map(([n, k, u]) => [n, media(con.map((f) => ({ w: w(f), v: est(f.c!)?.[k] }))), u])

  return {
    cobertura: (con.reduce((s, f) => s + f.peso, 0) / total) * 100,
    activos,
    rv: de(activos, 'Acciones'),
    rf: activos.filter(([n]) => n !== 'Acciones').reduce((s, [, v]) => s + v, 0),
    regiones: BLOQUES_REGION.map(([nombre, cods]) => {
      const filas = regiones.filter(([n]) => cods.some((c) => REGIONES[c] === n))
      return { nombre, pct: filas.reduce((s, [, v]) => s + v, 0), filas }
    }),
    mercados: mezclar(parte(rv, (c) => c.regiones), MERCADOS),
    paises: mezclar(parte(rv, (c) => c.paises_rv), (k) => PAISES[k] ?? (/^[A-Z]{3}$/.test(k) ? k : undefined)).slice(0, 10),
    sectores: GRUPOS_SECTOR.map(([nombre, ini]) => {
      const filas = sectores.filter(([n]) => Object.entries(SECTORES).some(([c, s]) => s === n && c.startsWith(ini)))
      return { nombre, pct: filas.reduce((s, [, v]) => s + v, 0), filas }
    }),
    estiloRv: caja(mezclar(parte(rv, (c) => c.estilo_rv), CASILLAS)),
    capitalizacion: mezclar(parte(rv, (c) => c.capitalizacion), CAPITALIZACION).sort(
      (a, b) => Object.values(CAPITALIZACION).indexOf(a[0]) - Object.values(CAPITALIZACION).indexOf(b[0]),
    ),
    estadisticasRv: cifras(ESTAD_RV, rv, (c) => c.estadisticas_rv),
    sectoresRf: mezclar(parte((f) => f.peso * (neto(f, '3') + neto(f, '7')), (c) => c.sectores_rf), SECTORES_RF),
    calidad: mezclar(parte(bonos, (c) => c.calidad_rf), CALIDAD),
    estiloRf: caja(mezclar(parte(bonos, (c) => c.estilo_rf), CASILLAS)),
    estadisticasRf: [
      ['Duración efectiva', media(con.map((f) => ({ w: bonos(f), v: f.duracion }))), 'años'],
      ...cifras(ESTAD_RF, bonos, (c) => c.estadisticas_rf),
    ],
    acciones: todas.filter((p) => p.tipo === 'E'),
    otras: todas.filter((p) => p.tipo !== 'E'),
    incompletas: con.filter((f) => !f.c!.posiciones_todas).map((f) => f.nombre),
    // cortos de verdad (acciones o bonos), no las coberturas de liquidez que tienen casi todos
    cortos: con.filter((f) => ['1', '3'].some((k) => (f.c!.activos!.corto?.[k] ?? 0) >= 10)).map((f) => f.nombre),
  }
}

export type Solape = { a: string; b: string; pct: number; comunes: string[]; completo: boolean }

/**
 * Cuánto comparten dos fondos, como Morningstar: la suma, en las posiciones comunes (por ISIN o nombre, sin liquidez),
 * del menor de sus dos pesos. 100 = la misma cartera. `completo`: los dos dan todas sus posiciones.
 */
export function solapamiento(fondos: { nombre: string; c: Composicion | null }[]): Solape[] {
  const pesos = fondos
    .filter((f) => f.c?.posiciones?.length)
    .map((f) => {
      const m = new Map<string, { nombre: string; peso: number }>()
      for (const p of f.c!.posiciones!) {
        if (p.tipo === 'C' || p.sector === 'cashAndEquivalents') continue
        const k = p.isin || p.nombre
        m.set(k, { nombre: p.nombre, peso: (m.get(k)?.peso ?? 0) + p.peso })
      }
      return { nombre: f.nombre, todas: !!f.c!.posiciones_todas, m }
    })
  const out: Solape[] = []
  pesos.forEach((x, i) =>
    pesos.slice(i + 1).forEach((y) => {
      const comunes = [...x.m].filter(([k]) => y.m.has(k)).map(([k, p]) => ({ nombre: p.nombre, peso: Math.min(p.peso, y.m.get(k)!.peso) }))
      comunes.sort((a, b) => b.peso - a.peso)
      out.push({ a: x.nombre, b: y.nombre, pct: comunes.reduce((s, p) => s + p.peso, 0), comunes: comunes.slice(0, 3).map((p) => p.nombre), completo: x.todas && y.todas })
    }),
  )
  return out.sort((a, b) => b.pct - a.pct)
}
