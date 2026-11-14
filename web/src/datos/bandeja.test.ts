import { describe, expect, it } from 'vitest'
import { alternar, bandeja, MAX_BANDEJA, quitarDeBandeja, vaciarBandeja } from './bandeja'

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
})
