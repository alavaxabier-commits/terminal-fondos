import { describe, expect, it } from 'vitest'
import { cifra, colorPercentil, fecha, millones, pct } from './formato'
import { simularCartera } from './metricas'
import { aEur, base100, caidas, combinar, haceAnos, haceDias, inicioComun, lineasCartera, muestra, sinGastos, variacion } from './series'

describe('series', () => {
  it('sinGastos devuelve el TER del sustituto: +0,5 % en un año con TER 0,5', () => {
    const s = sinGastos([{ fecha: '2025-01-01', valor: 100 }, { fecha: '2026-01-01', valor: 100 }], 0.5)
    expect(s[0].valor).toBe(100)
    expect(s[1].valor).toBeCloseTo(100.5, 1)
    expect(sinGastos(s, null)).toBe(s)
  })

  it('variacion frente al último dato en o antes de la fecha; null si la serie no llega', () => {
    const s = [{ fecha: '2026-01-02', valor: 100 }, { fecha: '2026-01-05', valor: 110 }, { fecha: '2026-01-09', valor: 121 }]
    expect(variacion(s, '2026-01-04')).toBeCloseTo(0.21) // base: el 2 (el 4 no hay dato)
    expect(variacion(s, '2026-01-05')).toBeCloseTo(0.1)
    expect(variacion(s, '2026-01-01')).toBeNull()
    expect(variacion(s, '2026-01-09')).toBeNull() // la base sería el propio último
    expect(haceDias('2026-03-01', 7)).toBe('2026-02-22')
    expect(muestra(s, '2026-01-01', 2)).toEqual([100, 121])
  })

  it('caidas desde el máximo anterior', () => {
    const s = [100, 120, 90, 130, 117].map((valor, i) => ({ fecha: `2026-01-0${i + 1}`, valor }))
    expect(caidas(s).map((p) => Math.round(p.valor))).toEqual([0, 0, -25, 0, -10])
  })

  it('pasa a EUR con el último tipo disponible', () => {
    const r = aEur(
      [{ fecha: '2026-11-02', valor: 110 }, { fecha: '2026-11-03', valor: 110 }],
      [{ fecha: '2026-10-30', valor: 1.1 }, { fecha: '2026-11-03', valor: 1 }],
    )
    expect(r[0].valor).toBeCloseTo(100)
    expect(r[1].valor).toBeCloseTo(110)
  })

  it('base 100 desde una fecha', () => {
    const r = base100([{ fecha: '2026-01-01', valor: 50 }, { fecha: '2026-02-01', valor: 80 }, { fecha: '2026-03-01', valor: 88 }], '2026-02-01')
    expect(r.map((p) => p.fecha)).toEqual(['2026-02-01', '2026-03-01'])
    expect(r[0].valor).toBeCloseTo(100)
    expect(r[1].valor).toBeCloseTo(110)
  })

  it('combina 60/40 solo en fechas comunes', () => {
    const a = [{ fecha: 'd1', valor: 100 }, { fecha: 'd2', valor: 110 }, { fecha: 'd3', valor: 110 }]
    const b = [{ fecha: 'd1', valor: 100 }, { fecha: 'd2', valor: 100 }]
    const r = combinar([{ serie: a, peso: 0.6 }, { serie: b, peso: 0.4 }])
    expect(r.map((p) => p.fecha)).toEqual(['d1', 'd2'])
    expect(r[1].valor).toBeCloseTo(106)
  })

  it('simula una cartera 50/50 y rebalancea al cerrar el año', () => {
    const a = [{ fecha: '2025-06-30', valor: 10 }, { fecha: '2025-12-31', valor: 20 }, { fecha: '2026-06-30', valor: 40 }, { fecha: '2026-07-01', valor: 1 }]
    const b = [{ fecha: '2025-06-30', valor: 10 }, { fecha: '2025-12-31', valor: 10 }, { fecha: '2026-06-30', valor: 10 }]
    const fondos = [{ serie: a, peso: 50 }, { serie: b, peso: 50 }]
    // 100 → 150 (a se duplica); en el cierre vuelve a 75/75; a se duplica otra vez → 225
    expect(simularCartera(fondos, 'anual').valor.map((p) => p.valor)).toEqual([100, 150, 225])
    // sin rebalanceo: 100 → 150 → 250 (a ya pesa 100 de 150)
    expect(simularCartera(fondos, 'ninguno').valor.map((p) => p.valor)).toEqual([100, 150, 250])
    expect(simularCartera([{ serie: a, peso: 100 }, { serie: [], peso: 0 }], 'anual').valor).toEqual([])
  })

  it('fechas', () => {
    expect(haceAnos('2026-11-12', 3)).toBe('2023-11-12')
    expect(inicioComun([[{ fecha: '2020-01-03', valor: 1 }], [{ fecha: '2021-05-07', valor: 1 }]], '2019-01-01')).toBe('2021-05-07')
  })
})

describe('formato', () => {
  it('formatea en español', () => {
    expect(pct(0.1234)).toBe('+12,3 %')
    expect(pct(-0.05)).toBe('-5,0 %')
    expect(pct(null)).toBe('—')
    expect(cifra(1.234)).toBe('1,23')
    expect(millones(1536.31)).toBe('1536 M€'.replace('1536', new Intl.NumberFormat('es-ES').format(1536)))
    expect(fecha('2026-11-06')).toBe('06/11/2026')
    expect(colorPercentil(80)).toBe('text-acento')
    expect(colorPercentil(10)).toBe('text-baja')
  })

  it('la referencia de la cartera arranca al nivel de la cartera', () => {
    const sim = [{ fecha: '2017-01-02', valor: 100 }, { fecha: '2019-10-04', valor: 130 }, { fecha: '2019-10-11', valor: 132 }]
    const ref = [{ fecha: '2019-10-04', valor: 50 }, { fecha: '2019-10-11', valor: 55 }]
    expect(lineasCartera('C', sim, ref)[1].serie.map((p) => p.valor)).toEqual([130, 143])
    expect(lineasCartera('C', sim, [])).toHaveLength(1)
  })
})
