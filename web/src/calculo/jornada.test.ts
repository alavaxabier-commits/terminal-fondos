import { describe, expect, it } from 'vitest'
import { movimiento, tintas, ultimaSemana, viejo } from './jornada'

describe('jornada', () => {
  it('movimiento en un mes: frente al lunes de hace 4 semanas', () => {
    const fechas = ['2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16']
    expect(movimiento({ puestos: [9, 8, 7, 6, 5, 4], fechas, de: 20 })).toBe(4) // del 8.º (19 oct) al 4.º
    expect(movimiento({ puestos: [1, 2, 3, 5], fechas: fechas.slice(1, 5), de: 20 })).toBeNull() // último puesto el 9 nov: el 12 oct no está
    expect(movimiento({ puestos: [3, 7], fechas: ['2026-10-19', '2026-11-16'], de: 20 })).toBe(-4)
    expect(movimiento({ puestos: [3, 7], fechas: ['2026-10-26', '2026-11-16'], de: 20 })).toBeNull() // sin nota hace 4 semanas
    expect(movimiento({ puestos: [3], fechas: ['2026-11-16'], de: 20 })).toBeNull()
    expect(movimiento({ puestos: [6, 2], fechas: ['2026-11-09', '2026-11-16'], de: 20 }, 1)).toBe(4) // a una semana
  })
  it('puesto viejo cuando falta la última semana', () => {
    const p = { puestos: [3, 4], fechas: ['2026-11-02', '2026-11-09'], de: 9 }
    expect(viejo(p, '2026-11-16')).toBe('2026-11-09')
    expect(viejo(p, '2026-11-09')).toBeNull()
    expect(ultimaSemana([p, { puestos: [1], fechas: ['2026-11-16'], de: 9 }])).toBe('2026-11-16')
  })
  it('tinta fija por id, aunque cambie el orden', () => {
    const t = tintas([7, 2, 5])
    expect(t.get(2)).toBe('var(--color-serie1)')
    expect(t.get(5)).toBe('var(--color-serie2)')
    expect(t.get(7)).toBe('var(--color-serie3)')
  })
})
