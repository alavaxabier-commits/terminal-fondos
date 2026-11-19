import type { RefSerie } from '../calculo/cartera'
import type { Composicion } from '../calculo/exposicion'
import { aEur, type Punto } from '../calculo/series'
import * as q from './consultas'

// Inicio, Revisión, Cartera, Comparador y Simulador piden las mismas series: se leen una vez por visita (recargar la página las renueva).
const series = new Map<string, Promise<Punto[]>>()

/** Serie en EUR de un fondo (con tipos de cambio si cotiza en otra divisa). */
export function serieEur(isin: string, divisa: string | null): Promise<Punto[]> {
  if (!series.has(isin)) series.set(isin, leerSerieEur(isin, divisa).catch((e) => { series.delete(isin); throw e }))
  return series.get(isin)!
}

async function leerSerieEur(isin: string, divisa: string | null): Promise<Punto[]> {
  const v = await q.valores(isin)
  if (!divisa || divisa === 'EUR') return v
  if (divisa === 'GBX') return aEur(v.map((p) => ({ ...p, valor: p.valor / 100 })), await q.tiposCambio('GBP')) // peniques
  return aEur(v, await q.tiposCambio(divisa))
}

/** Lo que hace falta de cada fondo: precios en EUR, composición, métricas y serie de referencia. */
export type DatosFondo = { serie: Punto[]; comp: Composicion | null; fechaCartera: string | null; metricas: Map<string, number>; percentiles: Map<string, number>; ref: RefSerie | null }
export async function cargarFondo(f: q.Fondo, cats: Awaited<ReturnType<typeof q.categoriasReferencia>>): Promise<DatosFondo> {
  const clave = q.claveReferencia(f, cats)
  const [serie, ms, comps, refs] = await Promise.all([
    serieEur(f.isin, f.divisa),
    q.metricasDe([f.isin]),
    q.composiciones([f.isin]),
    q.referenciaSeries(clave ? [clave] : []),
  ])
  return {
    serie,
    comp: comps[0]?.datos ?? null,
    fechaCartera: comps[0]?.fecha_cartera ?? null,
    metricas: new Map(ms.map((m) => [`${m.ventana}|${m.nombre}`, Number(m.valor)])),
    percentiles: new Map(ms.filter((m) => m.percentil != null).map((m) => [`${m.ventana}|${m.nombre}`, Number(m.percentil)])),
    ref: (clave && refs.get(clave)) || null,
  }
}
