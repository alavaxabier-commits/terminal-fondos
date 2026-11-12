// Estadísticas de una cartera modelo, calculadas en la web con el port del motor (metricas.ts): se ven al momento al editarla.
import {
  anosDeMeses, caidaEn, combinarRend, contribuciones, CRISIS, metricasFondo, rendimientos, rendMeses, riesgo,
  semanal, serieDeRendimientos, simularCartera, VENTANAS, type Metricas, type Semanal,
} from './metricas'
import type { Punto } from './series'

/** Serie de referencia ya hecha (la escribe Python): semanal, con clave el lunes, y de cierre de mes, con clave el día 1. */
export type RefSerie = { semanal: Semanal; meses: Map<string, number> }
export type FondoCartera = { isin: string; peso: number; serie: Punto[]; ref: RefSerie | null; vol3: number | null }

export type CalculoCartera = {
  desde: string
  hasta: string
  ultimoRebalanceo: string | null
  metricas: Metricas
  referencia: Metricas | null // periodos con la serie semanal; años naturales de cierre a cierre de mes
  crisis: Record<string, { cartera: [number, number] | null; referencia: [number, number] | null }>
  volatilidadMedia: number | null // media ponderada de las volatilidades a 3 años de los fondos
  correlacion: { semanas: number; matriz: (number | null)[][] } | null
  fondos: { isin: string; pesoHoy: number; riesgo: number | null; aporta: Record<string, number> }[]
}

function haceAnos(f: string, n: number): string {
  const d = new Date(f + 'T00:00:00Z')
  d.setUTCFullYear(d.getUTCFullYear() - n)
  return d.toISOString().slice(0, 10)
}

/**
 * La cartera simulada con su rebalanceo y sus métricas (las mismas que las de un fondo) frente a la combinación de las
 * referencias de sus fondos; crisis, aportación y peso de hoy de cada fondo y correlaciones. `rf`: €STR semanal.
 */
export function calcularCartera(fondos: FondoCartera[], rebalanceo: 'anual' | 'trimestral' | 'ninguno', rf: Map<string, number>, hoy: string): CalculoCartera | null {
  if (!fondos.length || fondos.some((f) => f.serie.length < 2)) return null
  const sim = simularCartera(fondos, rebalanceo)
  if (sim.valor.length < 2) return null
  const total = fondos.reduce((s, f) => s + f.peso, 0)
  const s = semanal(sim.valor)
  const conRef = fondos.every((f) => f.ref)
  const ref = conRef ? serieDeRendimientos(combinarRend(fondos.map((f) => [rendimientos(f.ref!.semanal), f.peso / total]))) : null
  let referencia: Metricas | null = null
  if (ref) {
    const periodos = metricasFondo(ref, null, rf, hoy)
    const meses = combinarRend(fondos.map((f) => [rendMeses(f.ref!.meses), f.peso / total]))
    referencia = { ...Object.fromEntries(VENTANAS.filter(([v]) => periodos[v]).map(([v]) => [v, periodos[v]])), ...anosDeMeses(meses, hoy) }
  }
  const hasta = sim.valor.at(-1)!.fecha
  const aporta = VENTANAS.map(([v, n]) => [v, contribuciones(sim, haceAnos(hasta, n))] as const)
  const r = riesgo(fondos.map((f) => rendimientos(semanal(f.serie))), fondos.map((f) => f.peso))
  return {
    desde: sim.valor[0].fecha,
    hasta,
    ultimoRebalanceo: sim.ultimoRebalanceo,
    metricas: metricasFondo(s, ref, rf, hoy, sim.valor),
    referencia,
    crisis: Object.fromEntries(CRISIS.map(([k, , d, h]) => [k, { cartera: caidaEn(s, d, h), referencia: ref ? caidaEn(ref, d, h) : null }])),
    volatilidadMedia: fondos.every((f) => f.vol3 != null) ? fondos.reduce((acc, f) => acc + f.peso * f.vol3!, 0) / total : null,
    correlacion: r && { semanas: r.semanas, matriz: r.matriz },
    fondos: fondos.map((f, k) => ({
      isin: f.isin,
      pesoHoy: sim.pesosHoy[k],
      riesgo: r?.partes[k] ?? null,
      aporta: Object.fromEntries(aporta.filter(([, a]) => a).map(([v, a]) => [v, a![k]])),
    })),
  }
}
