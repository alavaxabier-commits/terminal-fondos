import { describe, expect, it } from 'vitest'
import { grupo, ordenes } from './ordenes'

describe('ordenes', () => {
  it('pantallas y carteras que contienen lo escrito, sin acentos ni mayúsculas', () => {
    const cs = [{ id: 1, nombre: 'Indexada 70/30' }, { id: 2, nombre: 'Revisión anual' }]
    expect(ordenes('', cs)).toEqual([])
    expect(ordenes('REVISION', cs).map((o) => `${o.tipo}:${o.ruta}`)).toEqual(['pantalla:#/revision', 'cartera:#/cartera/2'])
    expect(ordenes('70/30', cs).map((o) => o.nombre)).toEqual(['Indexada 70/30'])
  })

  it('grupo del menú de cada ruta', () => {
    expect(['', '#/', '#/fondo/LU0000000000', '#/comparar/A,B', '#/cartera/3', '#/simular/3/A/B', '#/revision'].map(grupo))
      .toEqual(['inicio', 'inicio', 'fondos', 'fondos', 'carteras', 'carteras', 'carteras'])
  })
})
