import { describe, expect, it } from 'vitest'
import type { FilaScreener } from '../datos/consultas'
import { PESOS_DEFECTO } from './nota'
import { pasa, puntuar, tipoActivo } from './screener'

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
    expect(r[0].nota).toBeCloseTo((80 * 10 + 100 * 20) / 30)
    expect(r[2].nota).toBeNull()
  })
})
