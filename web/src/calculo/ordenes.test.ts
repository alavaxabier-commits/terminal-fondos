import { describe, expect, it } from 'vitest'
import { ordenes } from './ordenes'

describe('ordenes', () => {
  it('pantallas y carteras que contienen lo escrito, sin acentos ni mayúsculas', () => {
    const cs = [{ id: 1, nombre: 'Indexada 70/30' }, { id: 2, nombre: 'Revisión anual' }]
    expect(ordenes('', cs)).toEqual([])
    expect(ordenes('REVISION', cs).map((o) => `${o.tipo}:${o.ruta}`)).toEqual(['pantalla:#/revision', 'cartera:#/cartera/2'])
    expect(ordenes('70/30', cs).map((o) => o.nombre)).toEqual(['Indexada 70/30'])
  })
})
