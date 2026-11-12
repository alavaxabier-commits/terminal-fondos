import { describe, expect, it } from 'vitest'
import { calcularCartera } from './cartera'
import caso from './caso_metricas.json'
import { semanal } from './metricas'

const puntos = (xs: (string | number)[][]) => xs.map(([f, v]) => ({ fecha: String(f), valor: Number(v) }))
// cierres de mes con clave el día 1, como los guarda Python
const meses = (p: { fecha: string; valor: number }[]) => new Map(p.map((x) => [x.fecha.slice(0, 7) + '-01', x.valor]))

describe('calcularCartera', () => {
  const a = puntos(caso.serie), b = puntos(caso.referencia)
  const ref = { semanal: semanal(b), meses: meses(b) }
  const rf = new Map(caso.rf.map(([f, x]) => [String(f), Number(x)]))
  const c = calcularCartera(
    [{ isin: 'A', peso: 60, serie: a, ref, vol3: 0.07 }, { isin: 'B', peso: 40, serie: b, ref, vol3: 0.06 }],
    'anual', rf, caso.hoy,
  )!

  it('métricas de la cartera y de su referencia', () => {
    expect(c.desde).toBe('2018-01-02')
    expect(c.metricas['5a'].beta).toBeGreaterThan(0)
    expect(c.referencia!['5a'].rentabilidad).toBeDefined()
    const cierre = (a: string) => b.filter((p) => p.fecha < a).at(-1)!.valor
    expect(c.referencia!['2023'].rentabilidad).toBeCloseTo(cierre('2024') / cierre('2023') - 1, 9)
    expect(c.crisis.covid.cartera![0]).toBeLessThan(-0.2)
  })

  it('aportaciones que suman la acumulada y riesgo que suma 100 %', () => {
    const suma = c.fondos.reduce((s, f) => s + f.aporta['3a'], 0)
    expect(suma).toBeCloseTo(c.metricas['3a'].acumulada, 1)
    expect(c.fondos.reduce((s, f) => s + f.riesgo!, 0)).toBeCloseTo(1)
    expect(c.volatilidadMedia).toBeCloseTo(0.066)
  })

  it('sin precios de algún fondo no hay cálculo', () => {
    expect(calcularCartera([{ isin: 'A', peso: 100, serie: [], ref: null, vol3: null }], 'anual', rf, caso.hoy)).toBeNull()
  })
})
