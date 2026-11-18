import { describe, expect, it } from 'vitest'
import { calcularCartera, cambiosCartera, lecturaRiesgo, type CalculoCartera } from './cartera'
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

  it('con un índice elegido, la referencia es ese índice', () => {
    const solo = calcularCartera([{ isin: 'A', peso: 100, serie: a, ref: null, vol3: null }], 'anual', rf, caso.hoy, undefined, ref)!
    expect(solo.referencia!['2023'].rentabilidad).toBeCloseTo(c.referencia!['2023'].rentabilidad!, 9)
    expect(solo.referenciaSerie.length).toBeGreaterThan(0)
  })

  it('sin precios de algún fondo no hay cálculo', () => {
    expect(calcularCartera([{ isin: 'A', peso: 100, serie: [], ref: null, vol3: null }], 'anual', rf, caso.hoy)).toBeNull()
  })
})

describe('cambiosCartera', () => {
  it('salidas, entradas y cambios de peso', () => {
    const c = cambiosCartera(new Map([['A', 50], ['B', 50]]), new Map([['A', 60], ['C', 40]]), ' cambio ', (i) => `F${i}`)
    expect(c).toEqual([
      { sale: 'B', entra: null, motivo: 'cambio' },
      { sale: null, entra: 'C', motivo: 'cambio · peso 40 %' },
      { sale: null, entra: null, motivo: 'cambio · Pesos: FA 50 → 60 %' },
    ])
    expect(cambiosCartera(new Map([['A', 100]]), new Map([['A', 100]]), '', String)).toEqual([])
  })
})

describe('lecturaRiesgo', () => {
  it('diversificación, fondo con más riesgo, pareja más parecida y parecido ponderado', () => {
    const calc = {
      metricas: { '3a': { volatilidad: 0.066 } }, volatilidadMedia: 0.084,
      correlacion: { semanas: 156, matriz: [[1, 0.08, 0.27], [0.08, 1, 0.45], [0.27, 0.45, 1]] },
      fondos: [{ riesgo: 0.84 }, { riesgo: 0.01 }, { riesgo: 0.15 }],
    } as unknown as CalculoCartera
    const l = lecturaRiesgo(calc, [50, 30, 20])
    expect(l.quita).toBeCloseTo(0.018)
    expect(l.mayor).toBe(0)
    expect(l.pareja).toEqual({ a: 1, b: 2, c: 0.45 })
    expect(l.parecido[0]).toBeCloseTo((30 * 0.08 + 20 * 0.27) / 50)
  })
  it('sin correlaciones ni volatilidad media', () => {
    const calc = { metricas: {}, volatilidadMedia: null, correlacion: null, fondos: [{ riesgo: null }] } as unknown as CalculoCartera
    expect(lecturaRiesgo(calc, [100])).toEqual({ vol: null, quita: null, mayor: null, pareja: null, parecido: [null] })
  })
})
