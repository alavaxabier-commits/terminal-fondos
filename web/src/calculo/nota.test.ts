import { describe, expect, it } from 'vitest'
import caso from './caso_metricas.json'
import { aPesosTipo, bloques, nota, PESOS_DEFECTO, PESOS_TIPO_DEFECTO, pesosEfectivos, tipoActivo, type Plazo, type Tipo } from './nota'

describe('nota del screener (port de Python)', () => {
  it('da lo mismo que Python en el caso común (pesos por defecto, sin Diversificación)', () => {
    for (const c of caso.notas) {
      const b = bloques(c.pct as unknown as Record<string, number>, c.indexada, (c.ventana ?? undefined) as Plazo | undefined,
        (c.tipo ?? undefined) as Tipo | undefined)
      if (c.nota === null) { expect(b).toBeNull(); continue }
      expect(b!.solo3a).toBe(c.solo_3a)
      expect(nota(b!.bloques, { ...PESOS_DEFECTO, ...(c.pesos ?? {}) })).toBeCloseTo(c.nota, 9)
    }
  })

  it('reparte el peso de un bloque a 0 entre los demás', () => {
    const b = { riesgo: 100, coste: 0 }
    expect(pesosEfectivos(b, { ...PESOS_DEFECTO, coste: 0 })).toEqual({ riesgo: 1 })
    expect(nota(b, PESOS_DEFECTO)).toBeCloseTo(100 * 20 / 60)
  })
})

describe('pesos por tipo de activo', () => {
  it('un juego único (perfil antiguo) vale para todos los tipos; lo que falta, por defecto', () => {
    const p = aPesosTipo({ ...PESOS_DEFECTO, coste: 0 })
    expect(p['renta fija'].coste).toBe(0)
    expect(p.mixto.riesgo).toBe(PESOS_DEFECTO.riesgo)
    const q = aPesosTipo({ 'renta fija': { coste: 5 } })
    expect(q['renta fija']).toEqual({ ...PESOS_DEFECTO, coste: 5 })
    expect(q['renta variable']).toEqual(PESOS_DEFECTO)
    expect(aPesosTipo(null)).toEqual(PESOS_TIPO_DEFECTO)
  })

  it('tipo de activo por la categoría', () => {
    expect(tipoActivo('GBP Allocation 80%+ Equity')).toBe('mixto')
    expect(tipoActivo('EUR Money Market')).toBe('monetario')
    expect(tipoActivo(null)).toBe('otros')
  })
})
