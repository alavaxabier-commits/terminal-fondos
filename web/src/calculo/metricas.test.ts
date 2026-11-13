import { describe, expect, it } from 'vitest'
import caso from './caso_metricas.json'
import { anosDeMeses, caidaEn, contribuciones, metricasFondo, rendMeses, riesgo, semanal, simularCartera } from './metricas'

const puntos = (xs: number[][] | (string | number)[][]) => xs.map(([f, v]) => ({ fecha: String(f), valor: Number(v) }))

describe('motor de métricas (port de Python)', () => {
  it('da lo mismo que Python en el caso común', () => {
    const rf = new Map(caso.rf.map(([f, x]) => [String(f), Number(x)]))
    const serie = puntos(caso.serie)
    const m = metricasFondo(semanal(serie), semanal(puntos(caso.referencia)), rf, caso.hoy, serie)
    const plano = Object.fromEntries(Object.entries(m).flatMap(([v, ns]) => Object.entries(ns).map(([n, x]) => [`${v}|${n}`, x])))
    const sinPort = (k: string) => /captura|consistencia/.test(k) // no se usan en las carteras
    const esperado = Object.entries(caso.esperado as Record<string, number>).filter(([k]) => !sinPort(k))
    expect(Object.keys(plano).sort()).toEqual(esperado.map(([k]) => k).sort())
    for (const [k, x] of esperado) expect(plano[k], k).toBeCloseTo(x, 9)
  })
})

describe('carteras', () => {
  const a = puntos([['2025-12-30', 100], ['2025-12-31', 200], ['2026-01-02', 400]]) // se duplica dos veces
  const b = puntos([['2025-12-30', 100], ['2025-12-31', 100], ['2026-01-02', 100]]) // plano

  it('rebalancea al cerrar el año; lo que aporta cada fondo suma la rentabilidad de la cartera', () => {
    const sim = simularCartera([{ serie: a, peso: 50 }, { serie: b, peso: 50 }], 'anual')
    // 31/12: 50·2 + 50 = 150 y vuelve al 50/50; 2/1: 75·2 + 75 = 225
    expect(sim.valor.map((p) => p.valor)).toEqual([100, 150, 225])
    expect(sim.ultimoRebalanceo).toBe('2025-12-31')
    expect(sim.pesosHoy[0]).toBeCloseTo(150 / 225)
    expect(simularCartera([{ serie: a, peso: 50 }, { serie: b, peso: 50 }], 'ninguno').valor.at(-1)!.valor).toBe(250)
    // mensual: el 31/12 también cierra mes y rebalancea; en un semestre sin cambio de periodo, no
    expect(simularCartera([{ serie: a, peso: 50 }, { serie: b, peso: 50 }], 'mensual').valor.at(-1)!.valor).toBe(225)
    const c = puntos([['2026-02-27', 100], ['2026-03-31', 200], ['2026-04-30', 400]])
    const d = puntos([['2026-02-27', 100], ['2026-03-31', 100], ['2026-04-30', 100]])
    expect(simularCartera([{ serie: c, peso: 50 }, { serie: d, peso: 50 }], 'semestral').valor.at(-1)!.valor).toBe(250)
    expect(simularCartera([{ serie: c, peso: 50 }, { serie: d, peso: 50 }], 'trimestral').valor.at(-1)!.valor).toBe(225)
    // bandas: el 31/12 y el 2/1 «a» pesa 66,7 % (+16,7 puntos): con ±5 rebalancea los dos días, con ±20 ninguno
    const ab = [{ serie: a, peso: 50 }, { serie: b, peso: 50 }]
    expect(simularCartera(ab, 'bandas', 5)).toMatchObject({ rebalanceos: 2, ultimoRebalanceo: '2026-01-02' })
    expect(simularCartera(ab, 'bandas', 5).valor.at(-1)!.valor).toBe(225)
    expect(simularCartera(ab, 'bandas', 20).valor.at(-1)!.valor).toBe(250)
    expect(simularCartera(ab, 'bandas', 20).rebalanceos).toBe(0)
    expect(simularCartera(ab, 'anual').rebalanceos).toBe(1)
    expect(contribuciones(sim, '2025-12-30')).toEqual([1.25, 0])
    expect(contribuciones(sim, '2025-01-01')).toBeNull() // sin historia desde esa fecha
  })

  it('caída en un tramo y su recuperación, aunque sea fuera del tramo', () => {
    const s = new Map([['2020-02-03', 100], ['2020-02-10', 110], ['2020-02-17', 88], ['2020-02-24', 99], ['2020-03-02', 111]])
    expect(caidaEn(s, '2020-02-01', '2020-02-29')).toEqual([expect.closeTo(-0.2), 3])
    expect(caidaEn(new Map([...s].slice(0, 3)), '2020-02-01', '2020-02-29')![1]).toBe(-1)
    expect(caidaEn(s, '2019-01-01', '2019-03-01')).toBeNull()
  })

  it('correlaciones y reparto del riesgo', () => {
    const lunes = Array.from({ length: 52 }, (_, i) => new Date(Date.UTC(2020, 0, 6 + 7 * i)).toISOString().slice(0, 10))
    const x = new Map(lunes.map((k, i) => [k, 0.01 * (-1) ** i]))
    const y = new Map([...x].map(([k, v]) => [k, 2 * v]))
    const z = new Map([...x].map(([k, v]) => [k, -v]))
    const r = riesgo([x, y, z], [50, 25, 25])!
    expect(r.matriz[0][1]).toBeCloseTo(1)
    expect(r.matriz[0][2]).toBeCloseTo(-1)
    expect(r.partes.reduce((s, p) => s! + p!, 0)).toBeCloseTo(1)
    expect(riesgo([new Map([...x].slice(0, 20))], [100])).toBeNull()
  })

  it('años naturales de la referencia con cierres de mes', () => {
    const s = new Map(Array.from({ length: 14 }, (_, i) => [new Date(Date.UTC(2024, 11 + i, 1)).toISOString().slice(0, 10), 100 * 1.01 ** i]))
    expect(anosDeMeses(rendMeses(s), '2026-05-01')['2025'].rentabilidad).toBeCloseTo(1.01 ** 12 - 1)
    expect(anosDeMeses(rendMeses(s), '2026-05-01')['2024']).toBeUndefined()
  })
})
