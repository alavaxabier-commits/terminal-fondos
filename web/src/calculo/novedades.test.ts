import { describe, expect, it } from 'vitest'
import { novedades, umbralesNovedades, UMBRALES_NOVEDADES, type FondoNovedades } from './novedades'

const fondo = (x: Partial<FondoNovedades>): FondoNovedades =>
  ({ isin: 'X', nombre: 'Fondo', divisa: 'EUR', patrimonio: 500, flujo3m: null, flujoPct3m: null, cambios: [], ...x })

describe('novedades', () => {
  it('cambios de gestor primero, del más reciente al más antiguo', () => {
    const n = novedades([fondo({ cambios: [{ fecha: '2026-03-01', entran: ['Ana'], salen: [] }, { fecha: '2026-06-01', entran: [], salen: ['Luis'] }] })], UMBRALES_NOVEDADES)
    expect(n.map((x) => x.fecha)).toEqual(['2026-06-01', '2026-03-01'])
    expect(n[0].texto).toBe('Sale Luis.')
    expect(n[1].texto).toBe('Entra Ana.')
  })
  it('flujos y patrimonio con los umbrales', () => {
    const u = umbralesNovedades([{ clave: 'novedad_salidas_pct', valor: 5 }, { clave: 'otra', valor: 1 }])
    expect(u.novedad_salidas_pct).toBe(5)
    expect(novedades([fondo({ flujo3m: -30, flujoPct3m: -0.06 })], u).map((x) => x.tipo)).toEqual(['salidas'])
    expect(novedades([fondo({ flujo3m: -30, flujoPct3m: -0.06 })], UMBRALES_NOVEDADES)).toEqual([])
    expect(novedades([fondo({ flujo3m: 150, flujoPct3m: 0.3 })], u).map((x) => x.tipo)).toEqual(['entradas'])
    expect(novedades([fondo({ patrimonio: 40 })], u).map((x) => x.tipo)).toEqual(['patrimonio'])
    expect(novedades([fondo({ cambios: [{ fecha: '2026-01-01', entran: [], salen: [] }] })], u)).toEqual([])
  })
})
