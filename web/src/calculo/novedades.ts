// Novedades de un fondo: cambios de gestor y movimientos fuertes de su patrimonio, con los umbrales de la tabla ajuste
// (editables en Revisión). Los flujos salen de la tabla metrica (fondos/nucleo/metricas.py, metricas_flujos).
import { cifra, fecha, pct } from './formato'

export type FondoNovedades = {
  isin: string; nombre: string; divisa: string | null
  patrimonio: number | null // millones de su divisa
  flujo3m: number | null; flujoPct3m: number | null // flujo neto a 3 meses: millones y tanto por uno del patrimonio
  cambios: { fecha: string; entran: string[]; salen: string[] }[]
}
export type Novedad = { isin: string; nombre: string; tipo: 'gestor' | 'salidas' | 'entradas' | 'patrimonio'; titulo: string; texto: string; fecha: string | null }

export const UMBRALES_NOVEDADES = { novedad_salidas_pct: 10, novedad_entradas_pct: 25, novedad_patrimonio_meur: 50, novedad_dias: 30 }
export type UmbralesNovedades = typeof UMBRALES_NOVEDADES
/** Los umbrales guardados, con los de por defecto si falta alguno. */
export const umbralesNovedades = (filas: { clave: string; valor: number }[]): UmbralesNovedades =>
  ({ ...UMBRALES_NOVEDADES, ...Object.fromEntries(filas.filter((f) => f.clave in UMBRALES_NOVEDADES).map((f) => [f.clave, f.valor])) })

const nombres = (xs: string[]) => xs.join(', ')

/** Novedades de unos fondos: primero los cambios de gestor (más recientes antes), después lo que pasa con su patrimonio. */
export function novedades(fondos: FondoNovedades[], u: UmbralesNovedades): Novedad[] {
  const gestor: Novedad[] = [], patrimonio: Novedad[] = []
  for (const f of fondos) {
    const base = { isin: f.isin, nombre: f.nombre }
    const m = (v: number) => `${cifra(Math.abs(v), 0)} M${f.divisa ? ` ${f.divisa}` : ''}`
    for (const c of f.cambios) {
      const partes = [c.salen.length && `Sale ${nombres(c.salen)}`, c.entran.length && `entra ${nombres(c.entran)}`].filter(Boolean) as string[]
      if (!partes.length) continue
      const texto = partes.join('; ')
      gestor.push({ ...base, tipo: 'gestor', titulo: 'Cambio de gestor', fecha: c.fecha, texto: `${texto[0].toUpperCase()}${texto.slice(1)}.` })
    }
    if (f.flujoPct3m != null && f.flujo3m != null) {
      if (f.flujoPct3m <= -u.novedad_salidas_pct / 100)
        patrimonio.push({ ...base, tipo: 'salidas', titulo: 'Salidas fuertes', fecha: null, texto: `Salidas netas de ${m(f.flujo3m)} en 3 meses: ${pct(f.flujoPct3m, 0)} del patrimonio, descontada la rentabilidad.` })
      else if (f.flujoPct3m >= u.novedad_entradas_pct / 100)
        patrimonio.push({ ...base, tipo: 'entradas', titulo: 'Entradas fuertes', fecha: null, texto: `Entradas netas de ${m(f.flujo3m)} en 3 meses: ${pct(f.flujoPct3m, 0)} del patrimonio.` })
    }
    if (f.patrimonio != null && f.patrimonio < u.novedad_patrimonio_meur)
      patrimonio.push({ ...base, tipo: 'patrimonio', titulo: 'Patrimonio bajo', fecha: null, texto: `${m(f.patrimonio)}, por debajo de ${cifra(u.novedad_patrimonio_meur, 0)} M: puede salir del universo o cerrarse.` })
  }
  return [...gestor.sort((a, b) => b.fecha!.localeCompare(a.fecha!)), ...patrimonio]
}

/** Cuándo, en una línea: la fecha del cambio o el plazo del dato. */
export const cuandoNovedad = (n: Novedad) => (n.fecha ? fecha(n.fecha) : n.tipo === 'patrimonio' ? 'hoy' : '3 meses')
