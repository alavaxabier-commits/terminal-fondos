// Screener: filtros y nota de cada fondo del universo con los pesos elegidos (sin red).
import type { FilaScreener } from '../datos/consultas'
import { bloques, nota, type Bloque, type Pesos, type Plazo } from './nota'

export const TIPOS = ['renta variable', 'renta fija', 'mixto', 'monetario', 'otros'] as const
export type Tipo = (typeof TIPOS)[number]

/** Tipo de activo por el nombre de la categoría de Morningstar (Equity, Bond, Allocation, Money Market…). */
export function tipoActivo(categoria: string | null): Tipo {
  const c = categoria ?? ''
  if (/allocation/i.test(c)) return 'mixto' // antes que equity: «GBP Allocation 80%+ Equity»
  if (/equity/i.test(c)) return 'renta variable'
  if (/bond|fixed|debt|credit/i.test(c)) return 'renta fija'
  if (/money market/i.test(c)) return 'monetario'
  return 'otros'
}

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
export const grupos = (tipo: Tipo) => [...new Set([...(GRUPOS[tipo] ?? []).map(([g]) => g), 'otros'])]
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

/** Nota de cada fondo con los pesos dados, de mejor a peor; los que no tienen nota (menos de 3 años), al final.
 * `diversificacion`: percentil de cada fondo frente a la cartera elegida (sin cartera, el bloque no tiene datos). */
/** Con menos fondos en la categoría, su percentil (y la nota) dice poco: «el mejor de 3» saca 100. */
export const MIN_CATEGORIA = 5

export type Orden = 'nota' | 'ter' | 'r3' | 'r5'
/** Orden de la tabla: por nota (como sale de puntuar), por TER (menor primero) o por rentabilidad anual a 3 o 5 años (mayor primero). */
export function ordenar(filas: Puntuado[], orden: Orden): Puntuado[] {
  if (orden === 'nota') return filas
  const v = (f: Puntuado) => (orden === 'ter' ? f.ter : orden === 'r3' ? f.r3 : f.r5)
  const signo = orden === 'ter' ? 1 : -1
  return [...filas].sort((a, b) => (v(a) == null ? 1 : 0) - (v(b) == null ? 1 : 0) || signo * ((v(a) ?? 0) - (v(b) ?? 0)))
}

export function puntuar(filas: FilaScreener[], pesos: Pesos, diversificacion?: Map<string, number>, plazo?: Plazo): Puntuado[] {
  return filas
    .map((f) => {
      const b = bloques(f.pct ?? {}, indexada(f), plazo)
      const d = diversificacion?.get(f.isin)
      const bs = b ? (d == null ? b.bloques : { ...b.bloques, diversificacion: d }) : {}
      return { ...f, bloques: bs, solo3a: b?.solo3a ?? false, nota: b ? nota(bs, pesos) : null }
    })
    .sort((a, b) => (b.nota ?? -1) - (a.nota ?? -1) || a.nombre.localeCompare(b.nombre))
}
