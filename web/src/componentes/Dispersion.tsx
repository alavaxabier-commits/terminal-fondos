import * as echarts from 'echarts'
import { useEffect, useRef } from 'react'
import { token, useCambioTema } from './tema'

type Punto = { nombre: string; x: number; y: number; color: string }

/** Un punto por fondo: volatilidad (x) frente a rentabilidad anualizada (y), en %. Colores: tokens del tema. */
export default function Dispersion({ puntos }: { puntos: Punto[] }) {
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
    const [texto, suave, borde, panel] = ['texto', 'suave', 'borde', 'panel'].map(token)
    const fuente = getComputedStyle(document.body).fontFamily
    const eje = (nombre: string) => ({ type: 'value', name: nombre, nameLocation: 'middle', nameGap: 28, scale: true,
      axisLabel: { formatter: '{value} %' }, axisLine: { lineStyle: { color: borde } }, splitLine: { lineStyle: { color: borde, type: 'dashed' } } })
    g.setOption({
      backgroundColor: 'transparent',
      textStyle: { fontFamily: fuente, color: suave },
      grid: { left: 56, right: 16, top: 16, bottom: 44 },
      tooltip: { backgroundColor: panel, borderColor: borde, textStyle: { color: texto, fontFamily: fuente },
        formatter: (p: { seriesName: string; value: number[] }) => `${p.seriesName}<br>rentabilidad ${p.value[1].toFixed(1)} % · volatilidad ${p.value[0].toFixed(1)} %` },
      xAxis: eje('Volatilidad (menos es mejor)'),
      yAxis: eje('Rentabilidad anual'),
      series: puntos.map((p) => ({ name: p.nombre, type: 'scatter', symbolSize: 14, itemStyle: { color: token(p.color) }, data: [[p.x, p.y]] })),
    }, { notMerge: true })
  }, [puntos, tema])

  return <div ref={caja} className="h-64 w-full sm:h-72" />
}
