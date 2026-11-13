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

import { senales, type Par, type Umbrales } from './senales'

const U: Umbrales = { nota_baja_percentil: 50, empeora_puntos: 15, empeora_meses: 12, mejor_puntos: 15, caro_puntos_ter: 0.5, redundante_correlacion: 0.95 }
const par = (isin: string, nota: number, ter: number, fund_id: string | null = null): Par => ({ isin, nombre: isin, categoria: 'C', ter, fund_id, nota, percentil: null })

describe('señales de revisión', () => {
  const pares = [par('A', 50, 1.5, 'FA'), par('B', 70, 0.5), par('C', 66, 0.4), par('D', 90, 2), par('A2', 95, 0.1, 'FA')]
  const notas = [{ ...n('2025-11-17', 70), isin: 'A' }, { ...n('2026-11-09', 50), isin: 'A', percentil: 20 }]

  it('marca nota baja, empeora, algo mejor (sin otras clases del mismo fondo), caro y redundante', () => {
    const s = senales({ isin: 'A', ter: 1.5, fund_id: 'FA' }, notas, pares, U, [{ nombre: 'B', c: 0.97 }, { nombre: 'C', c: 0.5 }])
    expect(s.map((x) => x.tipo)).toEqual(['Nota baja', 'Empeora', 'Hay algo claramente mejor', 'Caro', 'Redundante'])
    expect(s[2].motivo).toMatch(/^B tiene 20 puntos más.*en total, 2 fondos/)   // D es más caro; A2 es el mismo fondo
    expect(s[3].motivo).toMatch(/mediana de 0,50 %.*\+1,00 puntos/)           // mediana de 1,5 · 0,5 · 0,4 · 2 · 0,1
  })

  it('sin nada que marcar', () => {
    const sinA2 = pares.filter((p) => p.isin !== 'A2') // A2: 25 puntos más y TER 0,1 → sí sería «algo mejor»
    expect(senales({ isin: 'B', ter: 0.5, fund_id: null }, [{ ...n('2026-11-09', 70), isin: 'B', percentil: 80 }], sinA2, U, [{ nombre: 'C', c: 0.94 }])).toEqual([])
  })
})

describe('candidatos (solo MyInvestor)', () => {
  it('«algo mejor» solo mira los candidatos; la mediana del TER, toda la categoría', () => {
    const pares = [par('A', 50, 1.5), par('B', 80, 0.5), par('C', 60, 0.4)]
    const notas = [{ ...n('2026-11-09', 50), isin: 'A', percentil: 60 }]
    const todos = senales({ isin: 'A', ter: 1.5, fund_id: null }, notas, pares, U, [])
    const soloC = senales({ isin: 'A', ter: 1.5, fund_id: null }, notas, pares, U, [], [pares[2]])
    expect(todos.map((s) => s.tipo)).toEqual(['Hay algo claramente mejor', 'Caro'])
    expect(soloC.map((s) => s.tipo)).toEqual(['Caro']) // C solo tiene 10 puntos más
  })
})
