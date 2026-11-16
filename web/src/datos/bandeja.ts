// Lista del comparador («bandeja»): los fondos que se comparan, apartados desde cualquier pantalla o elegidos en el comparador.
// shortcut: vive en la pestaña (sessionStorage), no en la base; pasar a tabla si se quiere conservar entre dispositivos
import { useSyncExternalStore } from 'react'

export type EnBandeja = { isin: string; nombre: string }
export const MAX_BANDEJA = 5
const CLAVE = 'bandeja'
const avisos = new Set<() => void>()
let lista: EnBandeja[] | null = null

export function bandeja(): EnBandeja[] {
  if (!lista) {
    try { lista = JSON.parse(sessionStorage.getItem(CLAVE) ?? '[]') } catch { lista = [] }
  }
  return lista!
}

function escribir(l: EnBandeja[]) {
  lista = l
  try { sessionStorage.setItem(CLAVE, JSON.stringify(l)) } catch { /* sin almacenamiento: dura lo que la página */ }
  avisos.forEach((f) => f())
}

/** La pone si no está (y cabe) o la quita si ya está. */
export function alternar(f: EnBandeja) {
  const l = bandeja()
  if (l.some((x) => x.isin === f.isin)) escribir(l.filter((x) => x.isin !== f.isin))
  else if (l.length < MAX_BANDEJA) escribir([...l, { isin: f.isin, nombre: f.nombre }])
}
export const quitarDeBandeja = (isin: string) => escribir(bandeja().filter((x) => x.isin !== isin))
export const vaciarBandeja = () => escribir([])
/** La deja igual que la lista del comparador (solo escribe si cambia). */
export function fijarBandeja(l: EnBandeja[]) {
  if (JSON.stringify(l) !== JSON.stringify(bandeja())) escribir(l.slice(0, MAX_BANDEJA))
}
/** Ruta del comparador con la lista y este fondo al final (si está llena, sale el primero). */
export const rutaCon = (isin: string) =>
  `#/comparar/${[...bandeja().map((x) => x.isin).filter((i) => i !== isin), isin].slice(-MAX_BANDEJA).join(',')}`

/** La bandeja, y que el componente se repinte cuando cambia. */
export function useBandeja(): EnBandeja[] {
  return useSyncExternalStore((f) => { avisos.add(f); return () => { avisos.delete(f) } }, bandeja)
}
