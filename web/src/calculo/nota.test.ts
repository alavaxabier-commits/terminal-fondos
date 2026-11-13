import { describe, expect, it } from 'vitest'
import caso from './caso_metricas.json'
import { bloques, nota, PESOS_DEFECTO, pesosEfectivos } from './nota'

describe('nota del screener (port de Python)', () => {
  it('da lo mismo que Python en el caso común (pesos por defecto, sin Diversificación)', () => {
    for (const c of caso.notas) {
      const b = bloques(c.pct as unknown as Record<string, number>, c.indexada)
      if (c.nota === null) { expect(b).toBeNull(); continue }
      expect(b!.solo3a).toBe(c.solo_3a)
      expect(nota(b!.bloques, PESOS_DEFECTO)).toBeCloseTo(c.nota, 9)
    }
  })

  it('reparte el peso de un bloque a 0 entre los demás', () => {
    const b = { riesgo: 100, coste: 0 }
    expect(pesosEfectivos(b, { ...PESOS_DEFECTO, coste: 0 })).toEqual({ riesgo: 1 })
    expect(nota(b, PESOS_DEFECTO)).toBeCloseTo(100 * 20 / 60)
  })
})
