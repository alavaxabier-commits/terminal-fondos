// Estadísticas de una cartera modelo, calculadas en la web con el port del motor (metricas.ts): se ven al momento al editarla.
import {
  anosDeMeses, caidaEn, combinarRend, contribuciones, CRISIS, metricasFondo, rendimientos, rendMeses, riesgo,
  semanal, serieDeRendimientos, simularCartera, VENTANAS, type Bandas, type Metricas, type Rebalanceo, type Semanal,
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
  referenciaSerie: Punto[] // la referencia combinada, semanal (fechada el viernes), para la gráfica
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
 * referencias de sus fondos (o frente a `refFija`, el índice elegido para la cartera); crisis, aportación y peso de hoy de cada fondo y correlaciones. `rf`: €STR semanal.
 */
export function calcularCartera(fondos: FondoCartera[], rebalanceo: Rebalanceo, rf: Map<string, number>, hoy: string, bandas?: Bandas,
  refFija?: RefSerie | null): CalculoCartera | null {
  if (!fondos.length || fondos.some((f) => f.serie.length < 2)) return null
  const sim = simularCartera(fondos, rebalanceo, bandas)
  if (sim.valor.length < 2) return null
  const total = fondos.reduce((s, f) => s + f.peso, 0)
  const s = semanal(sim.valor)
  // un índice elegido para la cartera o, si no, la referencia de cada fondo combinada con sus pesos
  const refs: [RefSerie, number][] | null = refFija ? [[refFija, 1]] : fondos.every((f) => f.ref) ? fondos.map((f) => [f.ref!, f.peso / total]) : null
  const ref = refs ? serieDeRendimientos(combinarRend(refs.map(([r, p]) => [rendimientos(r.semanal), p]))) : null
  let referencia: Metricas | null = null
  if (refs && ref) {
    const periodos = metricasFondo(ref, null, rf, hoy)
    const meses = combinarRend(refs.map(([r, p]) => [rendMeses(r.meses), p]))
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
    referenciaSerie: ref ? [...ref].map(([k, v]) => ({ fecha: new Date(Date.parse(k) + 4 * 864e5).toISOString().slice(0, 10), valor: v })) : [],
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

/** Líneas del historial al pasar de unos pesos a otros (ISIN → %): salidas, entradas y cambios de peso, con el motivo. */
export function cambiosCartera(antes: Map<string, number>, ahora: Map<string, number>, motivo: string, nombreDe: (isin: string) => string) {
  const m = motivo.trim() || null
  const con = (...x: (string | null)[]) => x.filter(Boolean).join(' · ') || null
  const pesos = [...ahora].filter(([i, p]) => antes.has(i) && antes.get(i) !== p).map(([i, p]) => `${nombreDe(i)} ${antes.get(i)} → ${p} %`)
  return [
    ...[...antes.keys()].filter((i) => !ahora.has(i)).map((i) => ({ sale: i, entra: null, motivo: m })),
    ...[...ahora.keys()].filter((i) => !antes.has(i)).map((i) => ({ sale: null, entra: i, motivo: con(m, `peso ${ahora.get(i)} %`) })),
    ...(pesos.length ? [{ sale: null, entra: null, motivo: con(m, `Pesos: ${pesos.join(', ')}`) }] : []),
  ]
}

/** Lectura del riesgo de una cartera calculada (pesos en el orden de calc.fondos): lo que quita diversificar (volatilidad media
 *  de los fondos menos la de la cartera, a 3 años), el fondo que más riesgo pone, la pareja más parecida y, de cada fondo, su
 *  correlación media con los demás ponderada por sus pesos (cerca de 0, diversifica). */
export function lecturaRiesgo(calc: CalculoCartera, pesos: number[]) {
  const vol = calc.metricas['3a']?.volatilidad ?? null
  const quita = calc.volatilidadMedia != null && vol != null ? calc.volatilidadMedia - vol : null
  let mayor: number | null = null
  calc.fondos.forEach((f, i) => { if (f.riesgo != null && (mayor == null || f.riesgo > calc.fondos[mayor].riesgo!)) mayor = i })
  const m = calc.correlacion?.matriz
  let pareja: { a: number; b: number; c: number } | null = null
  const parecido = calc.fondos.map((_, i) => {
    if (!m) return null
    let s = 0, t = 0
    m[i].forEach((c, j) => {
      if (j === i || c == null) return
      s += pesos[j] * c; t += pesos[j]
      if (j > i && (!pareja || c > pareja.c)) pareja = { a: i, b: j, c }
    })
    return t ? s / t : null
  })
  return { vol, quita, mayor, pareja: pareja as { a: number; b: number; c: number } | null, parecido }
}
