import { describe, expect, it } from 'vitest'
import { encaje } from './encaje'

const fondo = (isin: string, categoria: string) => ({ isin, nombre: isin, categoria })
const carteras = [
  { cartera: { id: 1, nombre: 'Uno' }, fondos: [{ peso: 60, fondo: fondo('A', 'RV') }, { peso: 40, fondo: fondo('B', 'RF') }] },
  { cartera: { id: 2, nombre: 'Dos' }, fondos: [{ peso: 100, fondo: fondo('C', 'Mon') }] },
]

describe('encaje en carteras', () => {
  it('sustituye al fondo de su categoría y trae su correlación', () => {
    const e = encaje({ isin: 'X', categoria: 'RF' }, carteras, [{ cartera_id: 1, isin: 'X', correlacion: 0.4, percentil: 80 }])
    expect(e[0]).toMatchObject({ dentro: false, correlacion: 0.4, percentil: 80, sustituye: { isin: 'B', peso: 40 } })
    expect(e[1]).toMatchObject({ correlacion: null, sustituye: null })
  })
  it('si ya está en la cartera no se sustituye a sí mismo', () => {
    expect(encaje({ isin: 'A', categoria: 'RV' }, carteras, [])[0]).toMatchObject({ dentro: true, sustituye: null })
  })
})
