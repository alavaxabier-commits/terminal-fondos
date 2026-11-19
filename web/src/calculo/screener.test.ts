import { describe, expect, it } from 'vitest'
import type { FilaScreener } from '../datos/consultas'
import { PESOS_TIPO_DEFECTO } from './nota'
import { alternativas, cubierta, deModo, grupo, grupos, mediana, ordenar, pasa, plazoDe, puntuar, tipoActivo } from './screener'

const fila = (x: Partial<FilaScreener>): FilaScreener => ({
  isin: 'X', nombre: 'X', categoria: 'C', divisa: 'EUR', ter: 0.5, srri: 4, gestion: null, patrimonio_meur: 100,
  fecha_lanzamiento: '2018-01-01', myinvestor: false, pct: null, r5: null, r3: null, cifras: null, ...x,
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
    ], PESOS_TIPO_DEFECTO)
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
    const fs = puntuar([fila({ isin: 'A', ter: 1, r5: 0.02 }), fila({ isin: 'B', ter: null, r5: null, r3: 0.05 }), fila({ isin: 'C', ter: 0.5, r5: null })], PESOS_TIPO_DEFECTO)
    expect(ordenar(fs, 'ter').map((f) => f.isin)).toEqual(['C', 'A', 'B'])
    expect(ordenar(fs, 'r5').map((f) => f.isin)).toEqual(['A', 'B', 'C'])
    expect(ordenar(fs, 'r3').map((f) => f.isin)).toEqual(['B', 'A', 'C'])
  })

  it('ordena por las cifras de la vista: volatilidad de menor a mayor, monetarios por 3M y meses negativos', () => {
    const fs = puntuar([
      fila({ isin: 'A', cifras: { '3a|volatilidad': [0.12, 40], '3m|rentabilidad': [0.031, 90], '12m|meses_negativos': [1, 10] } }),
      fila({ isin: 'B', cifras: { '3a|volatilidad': [0.08, 80], '3m|rentabilidad': [0.028, 30], '12m|meses_negativos': [0, 80] } }),
      fila({ isin: 'C' }),
    ], PESOS_TIPO_DEFECTO)
    expect(ordenar(fs, 'v3').map((f) => f.isin)).toEqual(['B', 'A', 'C'])
    expect(ordenar(fs, 'm3').map((f) => f.isin)).toEqual(['A', 'B', 'C'])
    expect(ordenar(fs, 'mneg').map((f) => f.isin)).toEqual(['B', 'A', 'C'])
    expect(mediana([3, null, 1, 2])).toBe(2)
    expect(mediana([4, 1, 2, 3])).toBe(2.5)
    expect(mediana([null])).toBeNull()
  })

  it('la diversificación entra en la nota si hay cartera', () => {
    const f = fila({ pct: { '5a|rentabilidad': 50 } })
    expect(puntuar([f], PESOS_TIPO_DEFECTO)[0].nota).toBe(50)
    expect(puntuar([f], PESOS_TIPO_DEFECTO, new Map([['X', 100]]))[0].nota).toBeCloseTo((50 * 10 + 100 * 10) / 20)
  })

  it('alternativas en su categoría: más nota y más barato primero, luego parecida y más barata, luego mucha más nota', () => {
    const pct = (n: number) => ({ '5a|rentabilidad': n, 'hoy|ter': n })
    const fs = puntuar([
      fila({ isin: 'YO', categoria: 'C', ter: 0.4, pct: pct(60) }),
      fila({ isin: 'MEJOR', categoria: 'C', ter: 0.2, pct: pct(70) }),
      fila({ isin: 'PARECIDO', categoria: 'C', ter: 0.3, pct: pct(58) }),
      fila({ isin: 'CARO', categoria: 'C', ter: 0.9, pct: pct(80) }),
      fila({ isin: 'PEOR', categoria: 'C', ter: 0.1, pct: pct(20) }),
      fila({ isin: 'OTRA', categoria: 'D', ter: 0.1, pct: pct(99) }),
    ], PESOS_TIPO_DEFECTO)
    const yo = fs.find((f) => f.isin === 'YO')!
    expect(alternativas(yo, fs, false).map((a) => [a.f.isin, a.motivo])).toEqual([
      ['MEJOR', 'Más nota y más barato'], ['PARECIDO', 'Nota parecida y 0,10 puntos más barato'], ['CARO', 'Más nota'],
    ])
    expect(plazoDe(yo)).toBe('5a')
    expect(plazoDe(fila({ pct: { '3a|rentabilidad': 50 } }))).toBe('3a')
    expect(plazoDe(yo, '10a')).toBe('10a')
  })

  it('los grupos de cada tipo, en orden de lectura y con todos los de las reglas', () => {
    expect(grupos('renta variable')[0]).toBe('global')
    expect(grupos('renta variable').at(-1)).toBe('otros')
    expect(grupos('monetario')).toEqual([])
    for (const t of ['renta variable', 'renta fija', 'mixto'] as const)
      for (const [c] of [['Global Large-Cap Blend Equity'], ['EUR Government Bond'], ['EUR Moderate Allocation - Global']])
        if (tipoActivo(c) === t) expect(grupos(t)).toContain(grupo(c))
  })
})

describe('deModo', () => {
  it('los modos antiguos indexados y activos pasan al filtro de gestión', () => {
    expect(deModo('indexados', { tipo: 'mixto' })).toEqual({ modo: 'juntos', filtros: { tipo: 'mixto', gestion: 'indexada' } })
    expect(deModo('activos', {})).toEqual({ modo: 'juntos', filtros: { gestion: 'activa' } })
    expect(deModo('separados', { gestion: 'activa' })).toEqual({ modo: 'separados', filtros: { gestion: 'activa' } })
    expect(deModo(undefined, {})).toEqual({ modo: 'juntos', filtros: {} })
  })
})
