import * as echarts from 'echarts'
import { useEffect, useRef } from 'react'
import type { Punto } from '../calculo/series'

type Linea = { nombre: string; serie: Punto[]; color: string }

/** Líneas en base 100 con zoom (rueda o pellizco) y tooltip. Tema oscuro de la app. */
export default function Grafico({ lineas }: { lineas: Linea[] }) {
  const caja = useRef<HTMLDivElement>(null)

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
    g.setOption(
      {
        backgroundColor: 'transparent',
        textStyle: { fontFamily: 'ui-monospace, Menlo, monospace', color: '#7d8f86' },
        grid: { left: 44, right: 12, top: 28, bottom: 48 },
        legend: { top: 0, left: 0, textStyle: { color: '#d6e2dc' }, itemWidth: 14 },
        tooltip: {
          trigger: 'axis',
          backgroundColor: '#121715',
          borderColor: '#24302b',
          textStyle: { color: '#d6e2dc', fontFamily: 'ui-monospace, Menlo, monospace' },
          valueFormatter: (v: unknown) => (typeof v === 'number' ? v.toFixed(1) : String(v)),
        },
        xAxis: { type: 'time', axisLine: { lineStyle: { color: '#24302b' } }, splitLine: { show: false } },
        yAxis: { type: 'value', scale: true, splitLine: { lineStyle: { color: '#1a221f' } } },
        dataZoom: [{ type: 'inside' }, { type: 'slider', height: 18, bottom: 8, borderColor: '#24302b', textStyle: { color: '#7d8f86' } }],
        series: lineas.map((l) => ({
          name: l.nombre,
          type: 'line',
          showSymbol: false,
          lineStyle: { width: 1.5, color: l.color },
          itemStyle: { color: l.color },
          data: l.serie.map((p) => [p.fecha, Number(p.valor.toFixed(2))]),
        })),
      },
      { notMerge: true },
    )
  }, [lineas])

  return <div ref={caja} className="h-72 w-full sm:h-96" />
}
