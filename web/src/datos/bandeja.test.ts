import { describe, expect, it } from 'vitest'
import { alternar, bandeja, fijarBandeja, MAX_BANDEJA, quitarDeBandeja, rutaCon, vaciarBandeja } from './bandeja'

describe('bandeja', () => {
  it('pone y quita, sin repetir y como mucho 5', () => {
    vaciarBandeja()
    alternar({ isin: 'A', nombre: 'a' })
    alternar({ isin: 'B', nombre: 'b' })
    alternar({ isin: 'A', nombre: 'a' }) // ya estaba: sale
    expect(bandeja().map((x) => x.isin)).toEqual(['B'])
    for (const i of 'CDEFG') alternar({ isin: i, nombre: i })
    expect(bandeja()).toHaveLength(MAX_BANDEJA)
    expect(bandeja().some((x) => x.isin === 'G')).toBe(false)
    quitarDeBandeja('B')
    expect(bandeja().map((x) => x.isin)).toEqual(['C', 'D', 'E', 'F'])
  })

  it('la lista del comparador: fijarla y la ruta con un fondo más', () => {
    fijarBandeja('ABCDE'.split('').map((i) => ({ isin: i, nombre: i })))
    expect(rutaCon('C')).toBe('#/comparar/A,B,D,E,C') // ya estaba: pasa al final
    expect(rutaCon('Z')).toBe('#/comparar/B,C,D,E,Z') // llena: sale el primero
    fijarBandeja([])
    expect(bandeja()).toEqual([])
  })
})
