import { describe, expect, it } from 'vitest'
import { exposicion, mezclar, SECTORES } from './exposicion'

// 60 % en un fondo de acciones (todo EE. UU.) y 40 % en uno mixto (50 % acciones de Japón, 50 % bonos)
const acciones = {
  activos: { neto: { '1': 100 } },
  regiones: { '1': 100, '15': 100, nc: 0 },
  sectores_rv: { '311': 100 },
  posiciones: [{ nombre: 'Apple', isin: 'US0378331005', peso: 10 }],
  posiciones_todas: true,
}
const mixto = {
  activos: { neto: { '1': 50, '3': 50 }, corto: { '1': 20 } },
  regiones: { '10': 100, '15': 100 },
  sectores_rv: { '103': 100 },
  calidad_rf: { '2': 100 },
  estadisticas_rf: { YieldToMaturity: 3 },
  posiciones: [{ nombre: 'Apple Inc', isin: 'US0378331005', peso: 5 }, { nombre: 'Bund 2%', peso: 25 }, { nombre: 'Settle Date Cash', peso: 30, tipo: 'C' }],
}

describe('exposicion', () => {
  const x = exposicion([
    { peso: 60, nombre: 'RV', c: acciones },
    { peso: 40, nombre: 'Mixto', c: mixto, duracion: 4 },
  ])

  it('reparte los activos por el peso de cada fondo', () => {
    expect(x.cobertura).toBe(100)
    expect(x.activos).toEqual([['Acciones', 80], ['Bonos', 20]])
  })

  it('regiones y sectores sobre la parte en acciones (60 de EE. UU. frente a 20 de Japón)', () => {
    expect(x.regiones).toEqual([['Estados Unidos', 75], ['Japón', 25]])
    expect(x.mercados).toEqual([['Desarrollados', 100]])
    expect(x.sectores).toEqual([['Tecnología', 75], ['Servicios financieros', 25]])
  })

  it('renta fija sobre la parte en bonos', () => {
    expect(x.calidad).toEqual([['AAA', 100]])
    expect(x.tir).toBe(3)
    expect(x.duracion).toBe(4)
  })

  it('suma la misma posición de varios fondos por ISIN y avisa de lo incompleto', () => {
    expect(x.posiciones[0]).toEqual({ nombre: 'Bund 2%', peso: 10, fondos: 1 })
    expect(x.posiciones[1]).toMatchObject({ isin: 'US0378331005', fondos: 2 })
    expect(x.posiciones[1].peso).toBeCloseTo(8) // 60 % × 10 + 40 % × 5
    expect(x.posiciones).toHaveLength(2) // la liquidez no cuenta como posición
    expect(x.incompletas).toEqual(['Mixto'])
    expect(x.cortos).toEqual(['Mixto'])
  })

  it('sin composición, el fondo no cuenta y se ve en la cobertura', () => {
    const y = exposicion([{ peso: 75, nombre: 'RV', c: acciones }, { peso: 25, nombre: 'Sin datos', c: null }])
    expect(y.cobertura).toBe(75)
    expect(y.activos).toEqual([['Acciones', 100]])
    expect(y.tir).toBeNull()
  })

  it('mezclar descarta códigos desconocidos y lo que no llega a 0,05 %', () => {
    expect(mezclar([{ w: 1, d: { '311': 99.97, '101': 0.03, nc: 5 } }], SECTORES)).toEqual([['Tecnología', 99.97]])
    expect(mezclar([], SECTORES)).toEqual([])
  })
})
