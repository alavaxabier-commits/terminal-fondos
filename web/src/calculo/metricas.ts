// Port de fondos/nucleo/metricas.py para las carteras modelo, que se calculan en la web (se ven al momento al editarlas).
// Mismas fórmulas: los dos lados pasan el caso común caso_metricas.json (tests/caso_metricas.py lo genera).
// Semanas ISO con clave = su lunes ('AAAA-MM-DD'); rentabilidades semanales anualizadas con 52.
import type { Punto } from './series'

export type Semanal = Map<string, number>
export type Metricas = Record<string, Record<string, number>> // ventana ('1a', '2024', 'ytd'…) → nombre → valor

const SEMANAS_ANO = 52
export const VENTANAS: [string, number][] = [['1a', 1], ['3a', 3], ['5a', 5], ['10a', 10]]

const ms = (iso: string) => Date.parse(iso + 'T00:00:00Z')
const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
export const diasEntre = (a: string, b: string) => Math.round((ms(b) - ms(a)) / 864e5)
const sumarDias = (f: string, n: number) => iso(ms(f) + n * 864e5)
export function lunes(f: string): string {
  const d = new Date(ms(f))
  return sumarDias(f, -((d.getUTCDay() + 6) % 7))
}

const media = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
const pstdev = (xs: number[]) => { const m = media(xs); return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length) }
const stdev = (xs: number[]) => { const m = media(xs); return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1)) }
const prod = (xs: number[]) => xs.reduce((p, x) => p * (1 + x), 1)

/** Último valor de cada semana ISO. */
export function semanal(serie: Punto[]): Semanal {
  const out: Semanal = new Map()
  for (const p of serie) { const k = lunes(p.fecha); out.delete(k); out.set(k, p.valor) }
  return new Map([...out].sort(([a], [b]) => a.localeCompare(b)))
}

/** Rentabilidad de cada semana frente a la anterior con dato (si es la inmediatamente anterior). */
export function rendimientos(s: Semanal): Map<string, number> {
  const ks = [...s.keys()], out = new Map<string, number>()
  for (let i = 1; i < ks.length; i++) if (diasEntre(ks[i - 1], ks[i]) === 7) out.set(ks[i], s.get(ks[i])! / s.get(ks[i - 1])! - 1)
  return out
}

const recorte = (s: Semanal, desde: string): Semanal => new Map([...s].filter(([k]) => k >= desde))

function ventanaCompleta(s: Semanal, ultima: string, anos: number): Semanal | null {
  const inicio = sumarDias(ultima, -7 * SEMANAS_ANO * anos)
  const primera = s.keys().next().value
  if (primera === undefined || primera > sumarDias(inicio, 7)) return null
  return recorte(s, inicio)
}

function anualizada(s: Semanal): number | null {
  const ks = [...s.keys()]
  if (ks.length < 2) return null
  const semanas = diasEntre(ks[0], ks.at(-1)!) / 7
  return semanas > 0 ? (s.get(ks.at(-1)!)! / s.get(ks[0])!) ** (SEMANAS_ANO / semanas) - 1 : null
}

const volatilidad = (r: number[]) => (r.length >= 2 ? pstdev(r) * Math.sqrt(SEMANAS_ANO) : null)
const desviacionBajista = (r: number[]) =>
  r.length >= 2 ? Math.sqrt(r.reduce((s, x) => s + Math.min(x, 0) ** 2, 0) / r.length) * Math.sqrt(SEMANAS_ANO) : null

/** [peor caída desde un máximo previo, semana del máximo, semana del mínimo] dentro de `ks`. */
function peorCaida(s: Semanal, ks: string[]): [number, string, string] {
  let pico = ks[0], peor = 0, peorPico = ks[0], peorK = ks[0]
  for (const k of ks) {
    if (s.get(k)! > s.get(pico)!) pico = k
    const c = s.get(k)! / s.get(pico)! - 1
    if (c < peor) [peor, peorPico, peorK] = [c, pico, k]
  }
  return [peor, peorPico, peorK]
}

function recuperacion(s: Semanal, pico: string, fondo: string): number | null {
  for (const [k, v] of s) if (k > fondo && v >= s.get(pico)!) return Math.floor(diasEntre(pico, k) / 7)
  return null
}

function maximaCaida(s: Semanal): [number | null, number | null] {
  if (s.size < 2) return [null, null]
  const [peor, pico, fondo] = peorCaida(s, [...s.keys()])
  return peor === 0 ? [0, 0] : [peor, recuperacion(s, pico, fondo)]
}

function regresion(rf: number[], rb: number[]): [number | null, number | null] {
  if (rf.length < 10) return [null, null]
  const mb = media(rb), mf = media(rf)
  const v = rb.reduce((s, x) => s + (x - mb) ** 2, 0)
  if (v < 1e-12 * rb.length) return [null, null] // índice plano: beta sin sentido
  const beta = rb.reduce((s, x, i) => s + (x - mb) * (rf[i] - mf), 0) / v
  return [(mf - beta * mb) * SEMANAS_ANO, beta]
}

function correlacion(a: number[], b: number[]): number {
  const ma = media(a), mb = media(b)
  let sab = 0, saa = 0, sbb = 0
  a.forEach((x, i) => { sab += (x - ma) * (b[i] - mb); saa += (x - ma) ** 2; sbb += (b[i] - mb) ** 2 })
  return sab / Math.sqrt(saa * sbb)
}

// ------------------------------------------------------------------ años naturales y mensuales (fechas exactas)
const esCierre = (f: string) => {
  const [a, m] = f.split('-').map(Number)
  return diasEntre(f, iso(Date.UTC(a, m, 1))) <= 7 // del día al 1 del mes siguiente
}
function cierresMes(serie: Punto[]): Map<string, Punto> {
  const out = new Map<string, Punto>()
  for (const p of serie) out.set(p.fecha.slice(0, 7), p)
  return out
}
const mesSiguiente = (a: string, b: string) => {
  const [ya, ma] = a.split('-').map(Number), [yb, mb] = b.split('-').map(Number)
  return yb * 12 + mb - (ya * 12 + ma) === 1
}

function calendario(serie: Punto[], hoy: string, poner: (v: string, n: string, x: number | null) => void) {
  const cierres = cierresMes(serie)
  const dic = new Map<number, number>()
  for (const [k, p] of cierres) if (k.endsWith('-12') && esCierre(p.fecha)) dic.set(+k.slice(0, 4), p.valor)
  if (!serie.length) return
  const ultima = serie.at(-1)!, ano = +hoy.slice(0, 4)
  if (+ultima.fecha.slice(0, 4) === ano && dic.has(ano - 1)) poner('ytd', 'rentabilidad', ultima.valor / dic.get(ano - 1)! - 1)
  for (const a of [...dic.keys()].sort()) if (dic.has(a - 1) && a < ano && a >= ano - 10) poner(String(a), 'rentabilidad', dic.get(a)! / dic.get(a - 1)! - 1)
}

function mensualesMorningstar(serie: Punto[], rf: Map<string, number>, hoy: string, poner: (v: string, n: string, x: number | null) => void) {
  const cierres = cierresMes(serie)
  const meses = [...cierres.keys()].sort().filter((k) => esCierre(cierres.get(k)!.fecha) && k < hoy.slice(0, 7))
  const rent: [string, number][] = []
  for (let i = 1; i < meses.length; i++)
    if (mesSiguiente(meses[i - 1], meses[i])) rent.push([meses[i], cierres.get(meses[i])!.valor / cierres.get(meses[i - 1])!.valor - 1])
  const rfAnual = rf.size ? (1 + media([...rf.values()])) ** SEMANAS_ANO - 1 : 0
  for (const [v, n] of [['3a', 3], ['5a', 5], ['10a', 10]] as const) {
    const tramo = rent.slice(-12 * n)
    if (tramo.length < 12 * n) continue
    const [a0, m0] = tramo[0][0].split('-').map(Number), [a1, m1] = tramo.at(-1)![0].split('-').map(Number)
    if (a1 * 12 + m1 - (a0 * 12 + m0) !== 12 * n - 1) continue // algún mes sin dato en medio
    const rs = tramo.map(([, r]) => r)
    const vol = stdev(rs) * Math.sqrt(12)
    poner(v, 'volatilidad_mensual', vol)
    if (vol) poner(v, 'sharpe_mensual', (prod(rs) ** (1 / n) - 1 - rfAnual) / vol)
  }
}

/**
 * Métricas de una serie, como metricas_fondo de Python (sin capturas ni consistencia, que la cartera no usa).
 * `fechas`: la serie con sus fechas reales, para los años naturales y las métricas mensuales.
 */
export function metricasFondo(s: Semanal, ref: Semanal | null, rf: Map<string, number>, hoy: string, fechas?: Punto[]): Metricas {
  const out: Metricas = {}
  const poner = (v: string, n: string, x: number | null) => { if (x != null && isFinite(x)) (out[v] ??= {})[n] = x }
  if (s.size < 2) return out
  if (fechas) {
    calendario(fechas, hoy, poner)
    mensualesMorningstar(fechas, rf, hoy, poner)
  }
  const ultima = [...s.keys()].at(-1)!
  for (const [v, n] of VENTANAS) {
    const w = ventanaCompleta(s, ultima, n)
    if (!w) continue
    const r = rendimientos(w), rs = [...r.values()]
    const anual = anualizada(w)
    const ks = [...w.keys()]
    poner(v, 'rentabilidad', anual)
    poner(v, 'acumulada', w.get(ks.at(-1)!)! / w.get(ks[0])! - 1)
    const vol = volatilidad(rs)
    poner(v, 'volatilidad', vol)
    const [caida, recup] = maximaCaida(w)
    poner(v, 'max_caida', caida)
    if (n === 10 && caida != null) poner(v, 'recuperacion_semanas', recup ?? -1)
    const rfV = [...r.keys()].filter((k) => rf.has(k)).map((k) => rf.get(k)!)
    const rfAnual = rfV.length ? (1 + media(rfV)) ** SEMANAS_ANO - 1 : 0
    if (anual != null && vol) poner(v, 'sharpe', (anual - rfAnual) / vol)
    const dd = desviacionBajista(rs)
    if (anual != null && dd) poner(v, 'sortino', (anual - rfAnual) / dd)
    if (ref) {
      const rref = rendimientos(recorte(ref, ks[0]))
      const comunes = [...r.keys()].filter((k) => rref.has(k))
      const rfC = comunes.map((k) => r.get(k)!), rbC = comunes.map((k) => rref.get(k)!)
      const [alfa, beta] = regresion(rfC, rbC)
      poner(v, 'alfa', alfa)
      poner(v, 'beta', beta)
      if (beta != null && pstdev(rfC) > 0) poner(v, 'r2', correlacion(rfC, rbC) ** 2 * 100)
      if (comunes.length >= 10) {
        const te = pstdev(rfC.map((x, i) => x - rbC[i])) * Math.sqrt(SEMANAS_ANO)
        poner(v, 'tracking_error', te)
        const exceso = prod(rfC) ** (SEMANAS_ANO / rfC.length) - prod(rbC) ** (SEMANAS_ANO / rbC.length)
        if (te) poner(v, 'ratio_informacion', exceso / te)
      }
    }
  }
  return out
}

// ------------------------------------------------------------------ carteras modelo
/** Índice combinado: suma ponderada de rentabilidades, solo en las claves (semanas o meses) en que existen todas. */
export function combinarRend(componentes: [Map<string, number>, number][]): Map<string, number> {
  if (!componentes.length) return new Map()
  const comunes = [...componentes[0][0].keys()].filter((k) => componentes.every(([r]) => r.has(k))).sort()
  return new Map(comunes.map((k) => [k, componentes.reduce((s, [r, p]) => s + r.get(k)! * p, 0)]))
}

/** Rentabilidades → serie encadenada en base 100. */
export function serieDeRendimientos(r: Map<string, number>): Semanal {
  let v = 100
  return new Map([...r.keys()].sort().map((k) => [k, (v *= 1 + r.get(k)!)]))
}

/** Rentabilidad de cada mes de una serie de cierres de mes (clave 'AAAA-MM-01'), solo meses seguidos. */
export function rendMeses(s: Map<string, number>): Map<string, number> {
  const ks = [...s.keys()].sort(), out = new Map<string, number>()
  for (let i = 1; i < ks.length; i++) if (mesSiguiente(ks[i - 1], ks[i])) out.set(ks[i], s.get(ks[i])! / s.get(ks[i - 1])! - 1)
  return out
}

/** Años naturales cerrados (los 12 meses con dato) a partir de rentabilidades mensuales. */
export function anosDeMeses(r: Map<string, number>, hoy: string): Metricas {
  const out: Metricas = {}
  const ano = +hoy.slice(0, 4)
  for (let a = ano - 10; a < ano; a++) {
    const meses = Array.from({ length: 12 }, (_, m) => r.get(`${a}-${String(m + 1).padStart(2, '0')}-01`))
    if (meses.every((x) => x != null)) out[String(a)] = { rentabilidad: prod(meses as number[]) - 1 }
  }
  return out
}

export type Simulacion = { valor: Punto[]; ganancias: number[][]; pesosHoy: number[]; ultimoRebalanceo: string | null; rebalanceos: number }

/**
 * Cartera en base 100 sobre las fechas comunes a todos sus fondos: parte de los pesos y vuelve a ellos el último día
 * con dato de cada mes, trimestre, semestre o año; 'bandas': el día que algún fondo se aleja de su peso más de `banda`
 * puntos; 'ninguno': derivan. Da también lo que gana cada fondo cada día y su peso al final.
 */
export type Rebalanceo = 'mensual' | 'trimestral' | 'semestral' | 'anual' | 'bandas' | 'ninguno'
const MESES: Record<Rebalanceo, number> = { mensual: 1, trimestral: 3, semestral: 6, anual: 12, bandas: 12, ninguno: 12 }

export function simularCartera(fondos: { serie: Punto[]; peso: number }[], rebalanceo: Rebalanceo, banda = 5): Simulacion {
  if (!fondos.length || fondos.some((f) => !f.serie.length)) return { valor: [], ganancias: [], pesosHoy: [], ultimoRebalanceo: null, rebalanceos: 0 }
  const mapas = fondos.map((f) => new Map(f.serie.map((p) => [p.fecha, p.valor])))
  const comunes = [...mapas[0].keys()].filter((d) => mapas.every((m) => m.has(d))).sort()
  if (!comunes.length) return { valor: [], ganancias: [], pesosHoy: [], ultimoRebalanceo: null, rebalanceos: 0 }
  const total = fondos.reduce((s, f) => s + f.peso, 0)
  const periodo = (d: string) => `${d.slice(0, 4)}-${Math.floor((+d.slice(5, 7) - 1) / MESES[rebalanceo])}`
  const ganancias = fondos.map(() => [0])
  let partes: number[] = [], ultimo = comunes[0], rebalanceos = 0
  const fuera = (d: string, v: number) => fondos.some((f, k) => Math.abs((partes[k] * mapas[k].get(d)!) / v - f.peso / total) > banda / 100)
  const valor = comunes.map((d, i) => {
    let v = 100
    if (i > 0) {
      const prev = comunes[i - 1]
      mapas.forEach((m, k) => ganancias[k].push(partes[k] * (m.get(d)! - m.get(prev)!)))
      v = partes.reduce((s, u, k) => s + u * mapas[k].get(d)!, 0)
    }
    const toca = rebalanceo === 'bandas' ? fuera(d, v)
      : rebalanceo !== 'ninguno' && i < comunes.length - 1 && periodo(d) !== periodo(comunes[i + 1])
    if (i === 0 || (i > 0 && toca)) {
      partes = fondos.map((f, k) => (v * f.peso) / total / mapas[k].get(d)!)
      ultimo = d
      if (i > 0) rebalanceos++
    }
    return { fecha: d, valor: v }
  })
  const fin = comunes.at(-1)!, vFin = valor.at(-1)!.valor
  return { valor, ganancias, pesosHoy: partes.map((u, k) => (u * mapas[k].get(fin)!) / vFin), ultimoRebalanceo: ultimo, rebalanceos }
}

/** Puntos de rentabilidad acumulada que aporta cada fondo desde `desde` (suman la de la cartera). null sin historia. */
export function contribuciones(sim: Simulacion, desde: string): number[] | null {
  const i0 = sim.valor.findIndex((p) => p.fecha >= desde)
  if (i0 < 0 || i0 === sim.valor.length - 1 || diasEntre(desde, sim.valor[i0].fecha) > 14) return null
  return sim.ganancias.map((g) => g.slice(i0 + 1).reduce((s, x) => s + x, 0) / sim.valor[i0].valor)
}

// Tramos de crisis: caída desde el máximo dentro del tramo
export const CRISIS: [string, string, string, string][] = [
  ['2018', 'Final de 2018', '2018-10-01', '2018-12-31'], // subidas de tipos de la Fed y guerra comercial
  ['covid', 'Covid (feb–abr 2020)', '2020-02-01', '2020-04-30'],
  ['2022', 'Subida de tipos (2022)', '2022-01-01', '2022-12-31'], // bajan a la vez acciones y bonos
]

/** [peor caída desde un máximo dentro del tramo, semanas hasta recuperar ese máximo (-1: sin recuperar)]. */
export function caidaEn(s: Semanal, desde: string, hasta: string): [number, number] | null {
  const ks = [...s.keys()].filter((k) => k >= desde && k <= hasta)
  if (ks.length < 2 || diasEntre(desde, ks[0]) > 14) return null
  const [peor, pico, fondo] = peorCaida(s, ks)
  if (peor === 0) return [0, 0]
  return [peor, recuperacion(s, pico, fondo) ?? -1]
}

/** Correlación de cada par y parte del riesgo de la cartera que pone cada fondo (con los pesos dados), con las
 *  rentabilidades semanales comunes de los últimos `anos` años. null con menos de un año común. */
export function riesgo(rends: Map<string, number>[], pesos: number[], anos = 3): { semanas: number; matriz: (number | null)[][]; partes: (number | null)[] } | null {
  if (!rends.length) return null
  const comunes = [...rends[0].keys()].filter((k) => rends.every((r) => r.has(k))).sort().slice(-anos * SEMANAS_ANO)
  if (comunes.length < SEMANAS_ANO) return null
  const x = rends.map((r) => comunes.map((k) => r.get(k)!))
  const medias = x.map(media), n = comunes.length
  const cov = x.map((xi, i) => x.map((xj, j) => xi.reduce((s, a, t) => s + (a - medias[i]) * (xj[t] - medias[j]), 0) / n))
  const total = pesos.reduce((s, p) => s + p, 0)
  const w = pesos.map((p) => p / total)
  const marginal = cov.map((fila) => fila.reduce((s, c, j) => s + w[j] * c, 0))
  const varP = w.reduce((s, wi, i) => s + wi * marginal[i], 0)
  return {
    semanas: n,
    matriz: cov.map((fila, i) => fila.map((c, j) => (cov[i][i] && cov[j][j] ? c / Math.sqrt(cov[i][i] * cov[j][j]) : null))),
    partes: w.map((wi, i) => (varP ? (wi * marginal[i]) / varP : null)),
  }
}
