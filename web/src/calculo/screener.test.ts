import { describe, expect, it } from 'vitest'
import type { FilaScreener } from '../datos/consultas'
import { PESOS_DEFECTO } from './nota'
import { cubierta, grupo, ordenar, pasa, puntuar, tipoActivo } from './screener'

const fila = (x: Partial<FilaScreener>): FilaScreener => ({
  isin: 'X', nombre: 'X', categoria: 'C', divisa: 'EUR', ter: 0.5, srri: 4, gestion: null, patrimonio_meur: 100,
  fecha_lanzamiento: '2018-01-01', myinvestor: false, pct: null, r5: null, r3: null, ...x,
})

describe('screener', () => {
  it('filtra por TER, SRRI, antigüedad, gestión y exclusiones', () => {
    const f = fila({})
    expect(pasa(f, { terMax: 0.5, srriMax: 4, anosMin: 8 }, '2026-11-13', new Set())).toBe(true)
    expect(pasa(f, { anosMin: 9 }, '2026-11-13', new Set())).toBe(false)
    expect(pasa(f, { terMax: 0.4 }, '2026-11-13', new Set())).toBe(false)
    expect(pasa(fila({ srri: null }), { srriMax: 7 }, '2026-11-13', new Set())).toBe(false)
    expect(pasa(f, { gestion: 'activa' }, '2026-11-13', new Set())).toBe(true) // sin gestión cuenta como activa
    expect(pasa(f, { gestion: 'indexada' }, '2026-11-13', new Set())).toBe(false)
    expect(pasa(f, {}, '2026-11-13', new Set(['X']))).toBe(false)
    expect(pasa(fila({ categoria: 'EUR Diversified Bond' }), { tipo: 'renta fija' }, '2026-11-13', new Set())).toBe(true)
    expect(pasa(fila({ categoria: 'EUR Diversified Bond' }), { tipo: 'renta variable' }, '2026-11-13', new Set())).toBe(false)
  })

  it('tipo de activo por la categoría', () => {
    expect(['Global Large-Cap Blend Equity', 'EUR Corporate Bond', 'EUR Moderate Allocation - Global', 'EUR Money Market - Short Term', 'Commodities - Precious Metals']
      .map(tipoActivo)).toEqual(['renta variable', 'renta fija', 'mixto', 'monetario', 'otros'])
  })

  it('ordena por nota y deja al final los que no la tienen', () => {
    const r = puntuar([
      fila({ isin: 'A', nombre: 'A', pct: { '1a|rentabilidad': 90 } }),
      fila({ isin: 'B', nombre: 'B', pct: { '5a|rentabilidad': 20 } }),
      fila({ isin: 'C', nombre: 'C', pct: { '5a|rentabilidad': 80, 'hoy|ter': 100 } }),
    ], PESOS_DEFECTO)
    expect(r.map((x) => x.isin)).toEqual(['C', 'B', 'A'])
    expect(r[0].nota).toBeCloseTo((80 * 10 + 100 * 40) / 50)
    expect(r[2].nota).toBeNull()
  })
})

describe('clase cubierta por el nombre', () => {
  it('reconoce las formas habituales', () => {
    expect(['M&G (Lux) Glb Macro Bd A H EUR Acc', 'JPM Flexible Credit D div EUR Hdg', 'PIMCO GIS Income E EUR Hedged Inc', 'Fidelity Global Inc A-QInc(G)-EUR H', 'X Fund (H) EUR']
      .map(cubierta)).toEqual([true, true, true, true, true])
    expect(['Vanguard Global Stock Index EUR Acc', 'Hermes Global Equity F', 'Janus Henderson UK Alpha I Acc', 'Schroder ISF Inflation Plus A Acc EUR']
      .map(cubierta)).toEqual([false, false, false, false])
  })
})

describe('región o estilo', () => {
  it('clasifica las categorías dentro de su tipo', () => {
    const casos: [string, string | null][] = [
      ['Global Large-Cap Blend Equity', 'global'], ['Global Emerging Markets Equity', 'emergentes'], ['US Small-Cap Equity', 'EE. UU.'],
      ['Eurozone Large-Cap Equity', 'Europa'], ['Spain Equity', 'Europa'], ['Japan Large-Cap Blend Equity', 'Japón'],
      ['Asia ex-Japan Equity', 'Asia y Pacífico'], ['Sector Equity Technology', 'sectoriales y temáticos'], ['Long/Short Equity - Europe', 'otros'],
      ['EUR Corporate Bond - Short Term', 'corto plazo y vencimiento fijo'], ['Global High Yield Bond - EUR Hedged', 'high yield'], ['EUR Government Bond', 'gobierno'],
      ['Global Emerging Markets Bond', 'emergentes'], ['EUR Flexible Bond', 'flexible y diversificada'], ['Other Bond', 'otros'],
      ['JPY Bond', 'otras divisas'], ['USD Flexible Bond', 'otras divisas'], ['Global Diversified Bond - USD Hedged', 'otras divisas'],
      ['Global Flexible Bond - EUR Hedged', 'flexible y diversificada'], ['EUR Bond - Long Term', 'flexible y diversificada'], ['USD Government Bond', 'gobierno'],
      ['EUR Cautious Allocation - Global', 'conservador'], ['GBP Allocation 80%+ Equity', 'agresivo'], ['EUR Money Market', null],
    ]
    for (const [c, g] of casos) expect(grupo(c), c).toBe(g)
  })

  it('ordena por TER o rentabilidad, sin dato al final', () => {
    const fs = puntuar([fila({ isin: 'A', ter: 1, r5: 0.02 }), fila({ isin: 'B', ter: null, r5: null, r3: 0.05 }), fila({ isin: 'C', ter: 0.5, r5: null })], PESOS_DEFECTO)
    expect(ordenar(fs, 'ter').map((f) => f.isin)).toEqual(['C', 'A', 'B'])
    expect(ordenar(fs, 'r5').map((f) => f.isin)).toEqual(['A', 'B', 'C'])
    expect(ordenar(fs, 'r3').map((f) => f.isin)).toEqual(['B', 'A', 'C'])
  })

  it('la diversificación entra en la nota si hay cartera', () => {
    const f = fila({ pct: { '5a|rentabilidad': 50 } })
    expect(puntuar([f], PESOS_DEFECTO)[0].nota).toBe(50)
    expect(puntuar([f], PESOS_DEFECTO, new Map([['X', 100]]))[0].nota).toBeCloseTo((50 * 10 + 100 * 10) / 20)
  })
})
