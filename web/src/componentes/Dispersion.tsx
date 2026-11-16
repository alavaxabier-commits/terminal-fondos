import * as echarts from 'echarts'
import { useEffect, useRef } from 'react'
import { cifra } from '../calculo/formato'
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
    const eje = (nombre: string, hueco: number) => ({ type: 'value', name: nombre, nameLocation: 'middle', nameGap: hueco, scale: true, boundaryGap: ['8%', '8%'],
      axisLabel: { formatter: (v: number) => `${cifra(v, Number.isInteger(v) ? 0 : 1)} %` }, axisLine: { lineStyle: { color: borde } }, splitLine: { lineStyle: { color: borde, type: 'solid' } } })
    g.setOption({
      backgroundColor: 'transparent',
      textStyle: { fontFamily: fuente, color: suave },
      grid: { left: 64, right: 24, top: 28, bottom: 44 },
      tooltip: { backgroundColor: panel, borderColor: borde, textStyle: { color: texto, fontFamily: fuente },
        formatter: (p: { seriesName: string; value: number[] }) => `${p.seriesName}<br>rentabilidad ${p.value[1].toFixed(1)} % · volatilidad ${p.value[0].toFixed(1)} %` },
      xAxis: eje('Volatilidad (menos es mejor)', 28),
      yAxis: eje('Rentabilidad anual', 48),
      aria: { enabled: true },
      // Nombre junto a cada punto (dataviz: con más de 3 colores en una dispersión, el color solo no basta) y anillo del fondo del panel.
      series: puntos.map((p) => ({ name: p.nombre, type: 'scatter', symbolSize: 11, itemStyle: { color: token(p.color), borderColor: panel, borderWidth: 2 },
        label: { show: true, position: 'top', color: texto, fontSize: 11, formatter: () => (p.nombre.length > 26 ? p.nombre.slice(0, 25) + '…' : p.nombre) },
        labelLayout: { hideOverlap: true }, data: [[p.x, p.y]] })),
    }, { notMerge: true })
  }, [puntos, tema])

  return <div ref={caja} className="h-64 w-full sm:h-72" />
}
