// Screener: filtros y nota de cada fondo del universo con los pesos elegidos (sin red).
import type { FilaScreener } from '../datos/consultas'
import { bloques, nota, tipoActivo, type Bloque, type PesosTipo, type Plazo, type Tipo } from './nota'
export { TIPOS, tipoActivo, type Tipo } from './nota'

/** Segundo nivel dentro del tipo: región o estilo, por el nombre de la categoría (el orden de las reglas importa). */
const GRUPOS: Partial<Record<Tipo, [string, RegExp][]>> = {
  'renta variable': [
    ['sectoriales y temáticos', /^(sector|thematic)/i], ['otros', /long\/short|market neutral|private equity|^other/i],
    ['emergentes', /emerging|frontier|latin america|brazil|africa/i], ['global', /^(global|islamic global)/i],
    ['EE. UU.', /^us /i], ['Japón', /^japan/i],
    ['Asia y Pacífico', /asia|asean|china|hong kong|india|indonesia|korea|taiwan|vietnam|pacific|australia/i],
    ['Europa', /europe|eurozone|^uk |france|germany|italy|spain|switzerland|nordic|norway|sweden/i],
  ],
  'renta fija': [
    ['convertibles', /convertible/i], ['emergentes', /emerging|asia|china|rmb|hkd/i], ['high yield', /high yield/i],
    ['corto plazo y vencimiento fijo', /short.term|fixed term/i], ['gobierno', /government|inflation/i], ['corporativa', /corporate|subordinated/i],
    // bonos en (o cubiertos a) otra divisa: en euros los mueve sobre todo el cambio, no la gestión
    ['otras divisas', /^(usd|chf|gbp|jpy|dkk|nok|sek) |- (usd|chf|gbp) hedged/i],
    ['flexible y diversificada', /flexible|diversified|bond - long term|^eur bond/i],
  ],
  mixto: [
    ['conservador', /cautious|0-20%|20-40%/i], ['moderado', /moderate|40-60%/i], ['agresivo', /aggressive|60-80%|80%\+/i],
    ['flexible', /flexible/i],
  ],
}
/** Orden en que se enseñan los grupos (el de GRUPOS es el de las reglas); «otros» siempre al final. */
const ORDEN_GRUPOS: Partial<Record<Tipo, string[]>> = {
  'renta variable': ['global', 'EE. UU.', 'Europa', 'Japón', 'Asia y Pacífico', 'emergentes', 'sectoriales y temáticos'],
  'renta fija': ['gobierno', 'corporativa', 'corto plazo y vencimiento fijo', 'flexible y diversificada', 'high yield', 'emergentes', 'convertibles', 'otras divisas'],
  mixto: ['conservador', 'moderado', 'agresivo', 'flexible'],
}
export const grupos = (tipo: Tipo) => (GRUPOS[tipo] ? [...(ORDEN_GRUPOS[tipo] ?? []), 'otros'] : [])
/** Qué es el segundo nivel en cada tipo. */
export const NOMBRE_GRUPO: Partial<Record<Tipo, string>> = { 'renta variable': 'Región o estilo', 'renta fija': 'Tipo de bono', mixto: 'Perfil' }
export function grupo(categoria: string | null): string | null {
  const reglas = GRUPOS[tipoActivo(categoria)]
  return reglas ? reglas.find(([, r]) => r.test(categoria ?? ''))?.[0] ?? 'otros' : null
}

export type Filtros = {
  tipo?: Tipo; grupo?: string; categoria?: string; gestion?: 'activa' | 'indexada'; terMax?: number; srriMax?: number; anosMin?: number
  patrimonioMin?: number; divisa?: string; soloMyinvestor?: boolean
}
export type Modo = 'juntos' | 'separados' | 'indexados' | 'activos'
export type Puntuado = FilaScreener & { bloques: Partial<Record<Bloque, number>>; solo3a: boolean; nota: number | null }

/** Clase con la divisa cubierta, por el nombre (Morningstar no lo da aparte): «Hdg», «Hedged», «H», «(H)», «H2»…
 * shortcut: deducido del nombre, puede fallar en alguna clase rara; si Morningstar lo diera en la ficha, guardarlo. */
export const cubierta = (nombre: string) => /\b(hdg|hedged?)\b|(^|[\s(])H\d?($|[\s)])/i.test(nombre)

/** Sin gestión conocida, el fondo cuenta como activo (igual que la nota de Python). */
export const indexada = (f: FilaScreener) => f.gestion === 'indexada'

export function pasa(f: FilaScreener, x: Filtros, hoy: string, excluir: Set<string>): boolean {
  if (excluir.has(f.isin)) return false
  if (x.tipo && tipoActivo(f.categoria) !== x.tipo) return false
  if (x.grupo && grupo(f.categoria) !== x.grupo) return false
  if (x.categoria && f.categoria !== x.categoria) return false
  if (x.gestion && (x.gestion === 'indexada') !== indexada(f)) return false
  if (x.terMax != null && (f.ter == null || f.ter > x.terMax)) return false
  if (x.srriMax != null && (f.srri == null || f.srri > x.srriMax)) return false
  if (x.patrimonioMin != null && (f.patrimonio_meur ?? 0) < x.patrimonioMin) return false
  if (x.divisa && f.divisa !== x.divisa) return false
  if (x.soloMyinvestor && !f.myinvestor) return false
  if (x.anosMin != null) {
    const limite = `${+hoy.slice(0, 4) - x.anosMin}${hoy.slice(4, 10)}`
    if (!f.fecha_lanzamiento || f.fecha_lanzamiento > limite) return false
  }
  return true
}

/** Nota de cada fondo con los pesos de su tipo de activo, de mejor a peor; los que no tienen nota (menos de 3 años), al final.
 * `diversificacion`: percentil de cada fondo frente a la cartera elegida (sin cartera, el bloque no tiene datos). */
/** Con menos fondos en la categoría, su percentil (y la nota) dice poco: «el mejor de 3» saca 100. */
export const MIN_CATEGORIA = 5

/** Cifra guardada en la vista (valor y percentil en su categoría), p. ej. '3a|volatilidad' o '3m|rentabilidad'. */
export const cifraDe = (f: FilaScreener, clave: string): number | null => f.cifras?.[clave]?.[0] ?? null
export const percentilDe = (f: FilaScreener, clave: string): number | null => f.cifras?.[clave]?.[1] ?? null

/** Columnas ordenables: cómo se lee el valor y si menos es mejor (entonces se ordena de menor a mayor). */
export const COLUMNAS = {
  ter: [(f: FilaScreener) => f.ter, true], r3: [(f: FilaScreener) => f.r3, false], r5: [(f: FilaScreener) => f.r5, false],
  v3: [(f: FilaScreener) => cifraDe(f, '3a|volatilidad'), true], s3: [(f: FilaScreener) => cifraDe(f, '3a|sharpe'), false],
  m1: [(f: FilaScreener) => cifraDe(f, '1m|rentabilidad'), false], m2: [(f: FilaScreener) => cifraDe(f, '2m|rentabilidad'), false],
  m3: [(f: FilaScreener) => cifraDe(f, '3m|rentabilidad'), false], m12: [(f: FilaScreener) => cifraDe(f, '1a|rentabilidad'), false],
  dif: [(f: FilaScreener) => cifraDe(f, '3m|diferencial_estr'), false],
  mneg: [(f: FilaScreener) => cifraDe(f, '12m|meses_negativos'), true],
} satisfies Record<string, [(f: FilaScreener) => number | null, boolean]>
export type Orden = 'nota' | keyof typeof COLUMNAS
/** Columnas propias de la vista Monetarios (con el tipo «monetario», el ranking cambia a ellas; por defecto, 3M). */
export const DE_MONETARIOS: Orden[] = ['m1', 'm2', 'm3', 'm12', 'dif', 'mneg']

/** Orden de la tabla: por nota (como sale de puntuar) o por una columna; los que no tienen el dato, al final. */
export function ordenar(filas: Puntuado[], orden: Orden): Puntuado[] {
  if (orden === 'nota') return filas
  const [v, menos] = COLUMNAS[orden]
  const signo = menos ? 1 : -1
  return [...filas].sort((a, b) => (v(a) == null ? 1 : 0) - (v(b) == null ? 1 : 0) || signo * ((v(a) ?? 0) - (v(b) ?? 0)))
}

/** Mediana de las cifras que hay (null si ninguna): para la franja del screener. */
export function mediana(xs: (number | null | undefined)[]): number | null {
  const v = xs.filter((x): x is number => x != null).sort((a, b) => a - b)
  if (!v.length) return null
  const m = v.length >> 1
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}

export function puntuar(filas: FilaScreener[], pesos: PesosTipo, diversificacion?: Map<string, number>, plazo?: Plazo): Puntuado[] {
  return filas
    .map((f) => {
      const t = tipoActivo(f.categoria)
      const b = bloques(f.pct ?? {}, indexada(f), plazo, t)
      const d = diversificacion?.get(f.isin)
      const bs = b ? (d == null ? b.bloques : { ...b.bloques, diversificacion: d }) : {}
      return { ...f, bloques: bs, solo3a: b?.solo3a ?? false, nota: b ? nota(bs, pesos[t]) : null }
    })
    .sort((a, b) => (b.nota ?? -1) - (a.nota ?? -1) || a.nombre.localeCompare(b.nombre))
}

/** Plazo de las cifras de la tarjeta: el elegido o, en automático, el de la nota del fondo (5 años si los tiene, si no 3). */
export const plazoDe = (f: FilaScreener, plazo?: Plazo): Plazo => plazo ?? (f.pct && '5a|rentabilidad' in f.pct ? '5a' : '3a')

/** Hasta tres fondos de la misma categoría que el elegido que merecen una mirada, con el porqué: más nota y más
 * barato; nota parecida (±3) y al menos 0,05 puntos de TER menos; o claramente más nota (+5). En los monetarios
 * cuenta lo que rinden a 3 meses en lugar de la nota (parecido = ±0,05 puntos). */
export function alternativas(f: Puntuado, todos: Puntuado[], monetario: boolean): { f: Puntuado; motivo: string }[] {
  const valor = (x: Puntuado) => (monetario ? cifraDe(x, '3m|rentabilidad') : x.nota)
  const v = valor(f)
  if (v == null) return []
  const parecido = monetario ? 0.0005 : 3
  const claro = monetario ? 0.001 : 5
  const out: { f: Puntuado; motivo: string; orden: number }[] = []
  for (const x of todos) {
    const w = valor(x)
    if (x.isin === f.isin || x.categoria !== f.categoria || w == null) continue
    const barato = x.ter != null && f.ter != null && x.ter <= f.ter - 0.05
    const masBarato = x.ter != null && f.ter != null && x.ter < f.ter
    const que = monetario ? 'Rinde más' : 'Más nota'
    if (w > v && masBarato) out.push({ f: x, motivo: `${que} y más barato`, orden: 0 })
    else if (Math.abs(w - v) <= parecido && barato) out.push({ f: x, motivo: `${monetario ? 'Rinde casi igual' : 'Nota parecida'} y ${(f.ter! - x.ter!).toFixed(2).replace('.', ',')} puntos más barato`, orden: 1 })
    else if (w - v >= claro) out.push({ f: x, motivo: que, orden: 2 })
  }
  return out.sort((a, b) => a.orden - b.orden || (valor(b.f) ?? 0) - (valor(a.f) ?? 0)).slice(0, 3).map(({ f, motivo }) => ({ f, motivo }))
}
