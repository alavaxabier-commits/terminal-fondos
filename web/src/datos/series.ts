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
