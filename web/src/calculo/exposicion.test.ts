import { describe, expect, it } from 'vitest'
import { aportaciones, exposicion, mezclar, SECTORES, solapamiento } from './exposicion'

// 60 % en un fondo de acciones (todo EE. UU.) y 40 % en uno mixto (50 % acciones de Japón, 50 % bonos)
const acciones = {
  activos: { neto: { '1': 100 } },
  regiones: { '1': 100, '15': 100, nc: 0 },
  paises_rv: { USA: 100 },
  sectores_rv: { '311': 100 },
  estilo_rv: { '3': 100 },
  capitalizacion: { '1': 50, '2': 50 },
  estadisticas_rv: { ProspectiveEarningsYield: 20, ProspectiveDividendYield: 1 },
  posiciones: [
    { nombre: 'Apple', isin: 'US0378331005', peso: 10, tipo: 'E', sector: 'Technology', pais: 'United States' },
    { nombre: 'BlackRock ICS USD Liquidity', peso: 1, tipo: 'FM', sector: 'cashAndEquivalents' },
  ],
  posiciones_todas: true,
}
const mixto = {
  activos: { neto: { '1': 50, '3': 50 }, corto: { '1': 20, '7': 3 } },
  regiones: { '10': 100, '15': 100 },
  paises_rv: { JPN: 100 },
  sectores_rv: { '103': 100 },
  estilo_rv: { '1': 100 },
  capitalizacion: { '3': 100 },
  estadisticas_rv: { ProspectiveEarningsYield: 10 },
  calidad_rf: { '2': 100 },
  estilo_rf: { '2': 100 },
  estadisticas_rf: { YieldToMaturity: 3, AverageCoupon: 2 },
  posiciones: [
    { nombre: 'Apple Inc', isin: 'US0378331005', peso: 5, tipo: 'E' },
    { nombre: 'Bund 2%', peso: 15, tipo: 'GS' },
    { nombre: 'Bund 2%', peso: 10, tipo: 'GS' }, // misma línea repetida en el mismo fondo
    { nombre: 'Settle Date Cash', peso: 30, tipo: 'C' },
  ],
}
const cifra = (filas: [string, number | null, string][], n: string) => filas.find(([x]) => x === n)?.[1]

describe('exposicion', () => {
  const x = exposicion([
    { peso: 60, nombre: 'RV', c: acciones },
    { peso: 40, nombre: 'Mixto', c: mixto, duracion: 4 },
  ])

  it('reparte los activos por el peso de cada fondo', () => {
    expect(x.cobertura).toBe(100)
    expect(x.activos).toEqual([['Acciones', 80], ['Bonos', 20]])
    expect([x.rv, x.rf]).toEqual([80, 20])
  })

  it('regiones, países y sectores sobre la parte en acciones (60 de EE. UU. frente a 20 de Japón), agrupados', () => {
    expect(x.regiones.map((g) => [g.nombre, g.pct])).toEqual([['América', 75], ['Europa, África y Oriente Medio', 0], ['Asia y Oceanía', 25]])
    expect(x.regiones[0].filas).toEqual([['Estados Unidos', 75]])
    expect(x.mercados).toEqual([['Desarrollados', 100]])
    expect(x.paises).toEqual([['Estados Unidos', 75], ['Japón', 25]])
    expect(x.sectores.map((g) => [g.nombre, g.pct])).toEqual([['Cíclico', 25], ['Sensible', 75], ['Defensivo', 0]])
  })

  it('estilo, capitalización y estadísticas de la renta variable', () => {
    expect(x.estiloRv).toEqual({ '3': 75, '1': 25 })
    expect(x.capitalizacion).toEqual([['Gigante', 37.5], ['Grande', 37.5], ['Mediana', 25]])
    expect(cifra(x.estadisticasRv, 'PER')).toBeCloseTo(16) // armónica: 1 / (75 % / 20 + 25 % / 10)
    expect(cifra(x.estadisticasRv, 'Rentabilidad por dividendo')).toBe(1) // solo el fondo que lo da
    expect(cifra(x.estadisticasRv, 'ROE')).toBeNull()
  })

  it('renta fija sobre la parte en bonos', () => {
    expect(x.calidad).toEqual([['AAA', 100]])
    expect(x.estiloRf).toEqual({ '2': 100 })
    expect(x.estadisticasRf.slice(0, 3)).toEqual([['Duración efectiva', 4, 'años'], ['TIR', 3, '%'], ['Cupón medio', 2, '%']])
  })

  it('posiciones sumadas por ISIN entre fondos, acciones aparte y sin la liquidez', () => {
    expect(x.acciones).toHaveLength(1)
    expect(x.acciones[0]).toMatchObject({ isin: 'US0378331005', fondos: 2, sector: 'Tecnología', pais: 'Estados Unidos' })
    expect(x.acciones[0].peso).toBeCloseTo(8) // 60 % × 10 + 40 % × 5
    expect(x.otras.map((p) => [p.nombre, p.peso])).toEqual([['Bund 2%', 10]])
    expect(x.incompletas).toEqual(['Mixto'])
    expect(x.cortos).toEqual(['Mixto'])
    const z = exposicion([{ peso: 100, nombre: 'Cubre liquidez', c: { activos: { neto: { '1': 100 }, corto: { '7': 2 } } } }])
    expect(z.cortos).toEqual([]) // una cobertura de liquidez no es «tener cortos»
  })

  it('sin composición, el fondo no cuenta y se ve en la cobertura', () => {
    const y = exposicion([{ peso: 75, nombre: 'RV', c: acciones }, { peso: 25, nombre: 'Sin datos', c: null }])
    expect(y.cobertura).toBe(75)
    expect(y.activos).toEqual([['Acciones', 100]])
    expect(y.estadisticasRf.every(([, v]) => v === null)).toBe(true)
  })

  it('mezclar descarta códigos desconocidos y lo que no llega a 0,05 %', () => {
    expect(mezclar([{ w: 1, d: { '311': 99.97, '101': 0.03, nc: 5 } }], SECTORES)).toEqual([['Tecnología', 99.97]])
    expect(mezclar([], SECTORES)).toEqual([])
  })
})

describe('solapamiento', () => {
  it('suma el menor peso de cada posición común, sin la liquidez', () => {
    const [s] = solapamiento([{ nombre: 'RV', c: acciones }, { nombre: 'Mixto', c: mixto }, { nombre: 'Sin datos', c: null }])
    expect(s).toEqual({ a: 'RV', b: 'Mixto', pct: 5, comunes: ['Apple'], completo: false }) // Apple: 10 y 5 → 5
  })
})

describe('aportaciones', () => {
  const fondos = [
    { peso: 60, nombre: 'RV', c: acciones },
    { peso: 40, nombre: 'Mixto', c: mixto },
    { peso: 10, nombre: 'Sin datos', c: null },
  ]

  it('reparte cada región entre los fondos y la suma es la de la cartera', () => {
    const a = aportaciones(fondos, 'regiones')
    expect(a.cols).toEqual(['América', 'Asia y Oceanía']) // sin la columna vacía
    expect(a.filas[0].valores).toEqual([75, 0]) // 60 de acciones de 80 → 75 puntos de EE. UU.
    expect(a.filas[1].valores).toEqual([0, 25])
    expect(a.filas[2]).toMatchObject({ valores: null, sin: 'Sin renta variable' })
    expect(a.total).toEqual(exposicion(fondos).regiones.filter((g) => g.pct).map((g) => g.pct))
  })

  it('sectores en el orden de sus grupos; calidad solo con los fondos que tienen bonos', () => {
    expect(aportaciones(fondos, 'sectores').cols).toEqual(['Servicios financieros', 'Tecnología'])
    const c = aportaciones(fondos, 'calidad')
    expect(c.cols).toEqual(['AAA'])
    expect(c.filas.map((r) => r.valores)).toEqual([null, [100], null])
    expect(c.filas[0].sin).toBe('Sin bonos')
  })
})
