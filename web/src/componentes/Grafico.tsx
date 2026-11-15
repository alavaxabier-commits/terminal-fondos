import * as echarts from 'echarts'
import { useEffect, useRef } from 'react'
import type { Punto } from '../calculo/series'
import { token, useCambioTema } from './tema'

/** color: nombre de un token (acento, suave, serie2…), que se resuelve con el tema actual. */
type Linea = { nombre: string; serie: Punto[]; color: string }

/** Líneas (en base 100, o la nota semanal) con zoom (rueda o pellizco) y tooltip. Colores del tema actual (se repinta al cambiarlo). */
export default function Grafico({ lineas, alto = 'h-72 sm:h-96' }: { lineas: Linea[]; alto?: string }) {
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
    if (!caja.current) return
    const g = echarts.getInstanceByDom(caja.current)
    if (!g) return
    const [texto, suave, borde, panel, acento] = ['texto', 'suave', 'borde', 'panel', 'acento'].map(token)
    const fuente = getComputedStyle(document.body).fontFamily
    g.setOption(
      {
        backgroundColor: 'transparent',
        textStyle: { fontFamily: fuente, color: suave },
        grid: { left: 44, right: 12, top: 28, bottom: 48 },
        legend: { top: 0, left: 0, textStyle: { color: texto }, itemWidth: 14 },
        tooltip: {
          trigger: 'axis',
          backgroundColor: panel,
          borderColor: borde,
          textStyle: { color: texto, fontFamily: fuente },
          valueFormatter: (v: unknown) => (typeof v === 'number' ? v.toFixed(1) : String(v)),
        },
        xAxis: { type: 'time', axisLine: { lineStyle: { color: borde } }, splitLine: { show: false } },
        yAxis: { type: 'value', scale: true, splitLine: { lineStyle: { color: borde, type: 'dashed' } } },
        dataZoom: [{ type: 'inside' }, {
          type: 'slider', height: 18, bottom: 8, borderColor: borde, textStyle: { color: suave },
          // Colores del tema (ECharts trae un azul propio): tramo elegido en acento suave, asas y fondo con los tokens.
          fillerColor: `color-mix(in srgb, ${acento} 15%, transparent)`, handleStyle: { color: panel, borderColor: suave },
          moveHandleStyle: { color: borde }, dataBackground: { lineStyle: { color: suave }, areaStyle: { color: borde } },
          selectedDataBackground: { lineStyle: { color: acento }, areaStyle: { color: `color-mix(in srgb, ${acento} 25%, transparent)` } },
          emphasis: { handleStyle: { borderColor: acento }, moveHandleStyle: { color: acento } },
        }],
        series: lineas.map((l) => ({
          name: l.nombre,
          type: 'line',
          showSymbol: false,
          lineStyle: { width: 1.5, color: token(l.color) },
          itemStyle: { color: token(l.color) },
          data: l.serie.map((p) => [p.fecha, Number(p.valor.toFixed(2))]),
        })),
      },
      { notMerge: true },
    )
  }, [lineas, tema])

  return <div ref={caja} className={`w-full ${alto}`} />
}
