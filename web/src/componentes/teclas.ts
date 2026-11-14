import { useEffect } from 'react'

/** Los atajos de una letra no actúan mientras se escribe en un campo ni con Ctrl, Cmd o Alt. */
export const escribiendo = (e: KeyboardEvent) =>
  e.ctrlKey || e.metaKey || e.altKey || ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName ?? '')

/** Lista con selección por teclado (Screener y Seguimiento): j/↓ y k/↑ mueven, y cada tecla de `acciones` actúa sobre
 *  el seleccionado. Las filas llevan `data-isin` para traerlas a la vista. */
export function useTeclasLista(isins: string[], sel: string | null, elegir: (isin: string) => void, acciones: Record<string, (isin: string) => void>) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (escribiendo(e)) return
      const paso = e.key === 'j' || e.key === 'ArrowDown' ? 1 : e.key === 'k' || e.key === 'ArrowUp' ? -1 : 0
      if (paso && isins.length) {
        e.preventDefault()
        const i = sel ? isins.indexOf(sel) : -1
        const nuevo = isins[i < 0 ? 0 : Math.max(0, Math.min(isins.length - 1, i + paso))]
        elegir(nuevo)
        document.querySelector(`[data-isin="${nuevo}"]`)?.scrollIntoView({ block: 'nearest' })
        return
      }
      if (e.key === 'Enter' && document.activeElement !== document.body) return // Intro sobre un botón o enlace hace lo suyo
      if (sel && acciones[e.key]) {
        e.preventDefault()
        acciones[e.key](sel)
      }
    }
    addEventListener('keydown', tecla)
    return () => removeEventListener('keydown', tecla)
  }) // sin dependencias: se vuelve a enganchar en cada pintado con la lista y la selección de ese momento
}
