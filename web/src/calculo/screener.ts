// Screener: filtros y nota de cada fondo del universo con los pesos elegidos (sin red).
import type { FilaScreener } from '../datos/consultas'
import { bloques, nota, type Bloque, type Pesos } from './nota'

export const TIPOS = ['renta variable', 'renta fija', 'mixto', 'monetario', 'otros'] as const
export type Tipo = (typeof TIPOS)[number]

/** Tipo de activo por el nombre de la categoría de Morningstar (Equity, Bond, Allocation, Money Market…). */
export function tipoActivo(categoria: string | null): Tipo {
  const c = categoria ?? ''
  if (/equity/i.test(c)) return 'renta variable'
  if (/bond|fixed|debt|credit/i.test(c)) return 'renta fija'
  if (/allocation/i.test(c)) return 'mixto'
  if (/money market/i.test(c)) return 'monetario'
  return 'otros'
}

export type Filtros = {
  tipo?: Tipo; categoria?: string; gestion?: 'activa' | 'indexada'; terMax?: number; srriMax?: number; anosMin?: number
  patrimonioMin?: number; divisa?: string; soloMyinvestor?: boolean
}
export type Modo = 'juntos' | 'separados' | 'indexados' | 'activos'
export type Puntuado = FilaScreener & { bloques: Partial<Record<Bloque, number>>; solo3a: boolean; nota: number | null }

/** Sin gestión conocida, el fondo cuenta como activo (igual que la nota de Python). */
export const indexada = (f: FilaScreener) => f.gestion === 'indexada'

export function pasa(f: FilaScreener, x: Filtros, hoy: string, excluir: Set<string>): boolean {
  if (excluir.has(f.isin)) return false
  if (x.tipo && tipoActivo(f.categoria) !== x.tipo) return false
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

/** Nota de cada fondo con los pesos dados, de mejor a peor; los que no tienen nota (menos de 3 años), al final. */
export function puntuar(filas: FilaScreener[], pesos: Pesos): Puntuado[] {
  return filas
    .map((f) => {
      const b = bloques(f.pct ?? {}, indexada(f))
      return { ...f, bloques: b?.bloques ?? {}, solo3a: b?.solo3a ?? false, nota: b ? nota(b.bloques, pesos) : null }
    })
    .sort((a, b) => (b.nota ?? -1) - (a.nota ?? -1) || a.nombre.localeCompare(b.nombre))
}
