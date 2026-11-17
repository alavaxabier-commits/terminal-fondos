import { describe, expect, it } from 'vitest'
import { movimiento, tintas, ultimaSemana, viejo, zona } from './jornada'

describe('jornada', () => {
  it('zona por cuartiles de la categoría', () => {
    expect(zona(1, 98)).toBe('alta')
    expect(zona(25, 98)).toBe('alta')
    expect(zona(26, 98)).toBe('media')
    expect(zona(73, 98)).toBe('media')
    expect(zona(74, 98)).toBe('baja')
    expect(zona(1, 3)).toBe('media')
  })
  it('movimiento entre las dos últimas semanas', () => {
    expect(movimiento({ puestos: [5, 4, 3], fechas: [], de: 9 })).toBe(1)
    expect(movimiento({ puestos: [2, 5], fechas: [], de: 9 })).toBe(-3)
    expect(movimiento({ puestos: [2], fechas: [], de: 9 })).toBeNull()
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
