import * as echarts from 'echarts'
import { useEffect, useRef } from 'react'
import { pct } from '../calculo/formato'
import { token, useCambioTema } from './tema'

/** Una casilla: área = valor (%). `color` es un token; `fuerza` (0–1), cuánto de ese color lleva sobre el panel. */
export type Hoja = { nombre: string; valor: number; color: string; fuerza: number; nota?: string }
export type Rama = { nombre: string; hojas: Hoja[] }

// Mezcla dos colores #rrggbb (el canvas de ECharts no entiende color-mix()).
function mezcla(a: string, b: string, p: number): string {
  const c = (h: string, i: number) => parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16)
  return '#' + [0, 1, 2].map((i) => Math.round(c(a, i) * p + c(b, i) * (1 - p)).toString(16).padStart(2, '0')).join('')
}

/**
 * Mapa de árbol: casillas con área proporcional al peso, agrupadas por ramas (regiones) o sueltas (posiciones).
 * Texto del color del texto sobre el color mezclado con el panel (como mucho a la mitad), legible en los dos temas.
 */
export default function Arbol({ ramas, alto = 'h-72', etiqueta }: { ramas: Rama[]; alto?: string; etiqueta: string }) {
  const caja = useRef<HTMLDivElement>(null)
  const tema = useCambioTema()

  useEffect(() => {
    if (!caja.current) return
    const g = echarts.init(caja.current, undefined, { renderer: 'canvas' })
    const ajusta = () => g.resize()
    addEventListener('resize', ajusta)
    return () => { removeEventListener('resize', ajusta); g.dispose() }
  }, [])

  useEffect(() => {
    const g = caja.current && echarts.getInstanceByDom(caja.current)
    if (!g) return
    const [texto, borde, panel] = ['texto', 'borde', 'panel'].map(token)
    const fuente = getComputedStyle(document.body).fontFamily
    const hoja = (h: Hoja) => ({
      name: h.nombre, value: h.valor, nota: h.nota,
      itemStyle: { color: mezcla(token(h.color), panel, Math.min(h.fuerza, 0.5)) },
    })
    const datos = ramas.length === 1 ? ramas[0].hojas.filter((h) => h.valor > 0).map(hoja)
      : ramas.map((r) => ({ name: r.nombre, children: r.hojas.filter((h) => h.valor > 0).map(hoja) })).filter((r) => r.children.length)
    g.setOption({
      textStyle: { fontFamily: fuente },
      tooltip: { backgroundColor: panel, borderColor: borde, textStyle: { color: texto, fontFamily: fuente },
        formatter: (p: { name: string; value: number; data: { nota?: string } }) => `${p.name} · ${pct(p.value / 100, 1, false)}${p.data?.nota ? `<br>${p.data.nota}` : ''}` },
      series: [{
        type: 'treemap', left: 0, right: 0, top: 0, bottom: 0, roam: false, nodeClick: false, breadcrumb: { show: false },
        animation: false, data: datos,
        label: { show: true, color: texto, fontFamily: fuente, fontSize: 13, overflow: 'truncate', lineHeight: 17,
          formatter: (p: { name: string; value: number }) => `{b|${p.name}}\n${pct(p.value / 100, 1, false)}`, rich: { b: { fontWeight: 600, fontSize: 13, color: texto } } },
        upperLabel: { show: false },
        levels: [{ itemStyle: { borderColor: panel, borderWidth: 0, gapWidth: 3 } }, { itemStyle: { borderColor: panel, borderWidth: 1, gapWidth: 1 } }],
      }],
    }, { notMerge: true })
  }, [ramas, tema])

  return <div ref={caja} role="img" aria-label={etiqueta} className={`${alto} w-full`} />
}
