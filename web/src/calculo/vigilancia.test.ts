import { describe, expect, it } from 'vitest'
import { estadoDescargas } from './vigilancia'

describe('estadoDescargas', () => {
  const ahora = new Date('2026-11-13T09:00:00Z')
  const lineas = [
    { ts: '2026-11-13T06:40:00Z', estado: 'error', mensaje: 'precios: Morningstar solo ha dado 2 de 10 descargas' },
    { ts: '2026-11-13T06:40:01Z', estado: 'error', mensaje: 'precios: iShares sin precio todavía' },
    { ts: '2026-11-12T06:40:00Z', estado: 'error', mensaje: 'precios: una alarma de ayer' },
    { ts: '2026-11-13T06:45:00Z', estado: 'ok', mensaje: 'métricas: sin alarmas' },
    { ts: '2026-11-01T05:00:00Z', estado: 'ok', mensaje: 'universo: sin alarmas' },
  ]

  it('alarmas de la última ejecución de cada tarea y tareas atrasadas', () => {
    const e = estadoDescargas(lineas, ahora)
    expect(e.map((t) => t.tarea)).toEqual(['precios', 'métricas', 'universo'])
    expect(e[0].alarmas).toEqual(['Morningstar solo ha dado 2 de 10 descargas', 'iShares sin precio todavía'])
    expect(e[1]).toMatchObject({ alarmas: [], atrasada: false })
    expect(e[2]).toMatchObject({ alarmas: [], atrasada: true }) // 12 días sin pasar
  })

  it('sin líneas, nada', () => {
    expect(estadoDescargas([], ahora)).toEqual([])
  })
})
