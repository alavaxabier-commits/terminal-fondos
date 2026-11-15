import { useEffect, useState } from 'react'

/** Tema de la web: «sistema» sigue al sistema operativo; claro u oscuro lo fijan (data-tema en <html>, guardado en este navegador). */
export type Tema = 'sistema' | 'claro' | 'oscuro'
export const TEMAS: Tema[] = ['sistema', 'claro', 'oscuro']

export function leerTema(): Tema {
  try {
    const t = localStorage.getItem('tema')
    return t === 'claro' || t === 'oscuro' ? t : 'sistema'
  } catch {
    return 'sistema'
  }
}

export function ponerTema(t: Tema) {
  if (t === 'sistema') delete document.documentElement.dataset.tema
  else document.documentElement.dataset.tema = t
  try { localStorage.setItem('tema', t) } catch { /* sin almacenamiento: vale para esta visita */ }
  dispatchEvent(new Event('tema'))
}

/** Un token de color (--color-NOMBRE) ya resuelto: ECharts pinta en canvas y no entiende var(). */
export const token = (nombre: string) => getComputedStyle(document.documentElement).getPropertyValue(`--color-${nombre}`).trim()

/** Cambia cada vez que cambia el tema efectivo (selector o sistema), para repintar lo que no es CSS. */
export function useCambioTema(): number {
  const [n, setN] = useState(0)
  useEffect(() => {
    const otra = () => setN((x) => x + 1)
    const mq = matchMedia('(prefers-color-scheme: dark)')
    addEventListener('tema', otra)
    mq.addEventListener('change', otra)
    return () => { removeEventListener('tema', otra); mq.removeEventListener('change', otra) }
  }, [])
  return n
}
