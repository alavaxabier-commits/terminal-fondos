import { describe, expect, it } from 'vitest'
import { dato, leer, PREGUNTAS, respuesta } from './cuestionario'

describe('cuestionario', () => {
  it('los puntos suman 100, como PREGUNTAS en Python', () => {
    expect(PREGUNTAS.reduce((s, p) => s + p.max, 0)).toBe(100)
  })

  it('lee lo guardado en metrica y en la vista del screener', () => {
    const m = new Map([['cuestionario|nota', 80], ['cuestionario|p1', 15], ['cuestionario|p3', 5], ['cuestionario|posibles', 100], ['cuestionario|puntos', 80], ['cuestionario|plazo', 5]])
    const c = leer(m)!
    expect(c.nota).toBe(80)
    expect(c.puntosDe).toEqual({ p1: 15, p3: 5 })
    expect(leer({ nota: 40, p5: 0, plazo: 3 })!.plazo).toBe(3)
    expect(leer(new Map())).toBeNull()
    expect(leer(null)).toBeNull()
  })

  it('respuesta: sí, a medias, no o sin respuesta', () => {
    const p1 = PREGUNTAS[0]
    expect(respuesta(p1, 15)).toBe('sí')
    expect(respuesta(p1, 7.5)).toBe('a medias')
    expect(respuesta(p1, 0)).toBe('no')
    expect(respuesta(p1, undefined)).toBeNull()
  })

  it('dato: la cifra que contesta la pregunta', () => {
    const valores: Record<string, number> = { '5a|diferencia_seguimiento': 0.0042 }
    expect(dato(PREGUNTAS[0], 5, (k) => valores[k], () => null, null)).toBe('+0,42 % al año')
    expect(dato(PREGUNTAS[7], 5, () => null, () => null, 250)).toBe('250 M€')
    expect(dato(PREGUNTAS[8], 5, () => null, () => null, 250)).toBeNull()
  })
})
