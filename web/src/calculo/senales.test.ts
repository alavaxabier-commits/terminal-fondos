import { describe, expect, it } from 'vitest'
import { evolucion } from './senales'

const n = (fecha: string, nota: number) => ({ isin: 'X', fecha, nota, percentil: 50 })

describe('evolución de la nota', () => {
  it('cambio en la semana y frente a la nota más antigua de los 12 meses', () => {
    const e = evolucion([n('2026-11-09', 60), n('2025-11-10', 80), n('2025-11-03', 90), n('2026-11-02', 58)])
    expect(e).toMatchObject({ fecha: '2026-11-09', nota: 60, semana: 2, periodo: -20 })
  })
  it('sin semana anterior ni historial', () => {
    expect(evolucion([n('2026-11-09', 60)])).toMatchObject({ semana: null, periodo: null })
    expect(evolucion([])).toBeNull()
  })
})
