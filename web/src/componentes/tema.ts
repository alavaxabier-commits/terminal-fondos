import { useEffect, useState } from 'react'

/** Tema de la web: claro u oscuro (data-tema en <html>, guardado en este navegador). Sin elección guardada, el del sistema. */
export type Tema = 'claro' | 'oscuro'

export function leerTema(): Tema {
  try {
    const t = localStorage.getItem('tema')
    if (t === 'claro' || t === 'oscuro') return t
  } catch { /* sin almacenamiento: el del sistema */ }
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro'
}

/** Aplica el tema; `guardar` solo cuando lo elige la persona (al arrancar se aplica sin fijarlo). */
export function ponerTema(t: Tema, guardar = false) {
  document.documentElement.dataset.tema = t
  if (guardar) try { localStorage.setItem('tema', t) } catch { /* vale para esta visita */ }
  dispatchEvent(new Event('tema'))
}

/** Un token de color (--color-NOMBRE) ya resuelto: ECharts pinta en canvas y no entiende var(). */
export const token = (nombre: string) => getComputedStyle(document.documentElement).getPropertyValue(`--color-${nombre}`).trim()

/** Cambia cada vez que cambia el tema, para repintar lo que no es CSS. */
export function useCambioTema(): number {
  const [n, setN] = useState(0)
  useEffect(() => {
    const otra = () => setN((x) => x + 1)
    addEventListener('tema', otra)
    return () => removeEventListener('tema', otra)
  }, [])
  return n
}
