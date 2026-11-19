import * as echarts from 'echarts'
import { useEffect, useRef, useState } from 'react'
import { cifra, fecha } from '../calculo/formato'
import type { Punto } from '../calculo/series'
import { token, useCambioTema } from './tema'

/** color: nombre de un token (acento, suave, serie2…), que se resuelve con el tema actual. */
type Linea = { nombre: string; serie: Punto[]; color: string }
/** Colores grises: esas líneas llevan su nombre al final, que es lo que las distingue. */
const GRISES = new Set(['gris', 'serie4', 'serie5'])

/** Líneas (en base 100, o la nota semanal) con zoom (rueda o pellizco) y lectura al pasar el ratón. Colores del tema actual
 *  (se repinta al cambiarlo). Como pide dataviz: rejilla de filete continuo, el último valor escrito al final de cada línea,
 *  leyenda solo con varias series y el mismo dato en tabla (botón «Tabla»), para no depender del ratón ni del color. */
export default function Grafico({ lineas, alto = 'h-72 sm:h-96' }: { lineas: Linea[]; alto?: string }) {
  const caja = useRef<HTMLDivElement>(null)
  const tema = useCambioTema()
  const [tabla, setTabla] = useState(false)
  const [ocultas, setOcultas] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!caja.current || tabla) return
    const g = echarts.init(caja.current, undefined, { renderer: 'canvas' })
    const ajusta = () => g.resize()
    addEventListener('resize', ajusta)
    return () => { removeEventListener('resize', ajusta); g.dispose() }
  }, [tabla])

  useEffect(() => {
    if (!caja.current) return
    const g = echarts.getInstanceByDom(caja.current)
    if (!g) return
    const [texto, suave, borde, panel, acento] = ['texto', 'suave', 'borde', 'panel', 'acento'].map(token)
    const fuente = getComputedStyle(document.body).fontFamily
    // En el móvil, menos sitio para el nombre de las líneas grises: si no, el gráfico se queda en la mitad.
    const estrecho = caja.current.clientWidth < 520, largo = estrecho ? 9 : 16
    const grises = lineas.some((l) => GRISES.has(l.color))
    g.setOption(
      {
        backgroundColor: 'transparent',
        textStyle: { fontFamily: fuente, color: suave },
        aria: { enabled: true },
        grid: { left: 44, right: grises ? (estrecho ? 104 : 132) : 52, top: 12, bottom: 48 },
        // La leyenda va en HTML, encima (se parte en varias filas y no pisa el gráfico); aquí solo dice qué líneas se ven.
        legend: { show: false, selected: Object.fromEntries(lineas.map((l) => [l.nombre, !ocultas.has(l.nombre)])) },
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'line', lineStyle: { color: suave, width: 1 } },
          backgroundColor: panel,
          borderColor: borde,
          textStyle: { color: texto, fontFamily: fuente },
          valueFormatter: (v: unknown) => (typeof v === 'number' ? v.toFixed(1) : String(v)),
        },
        xAxis: { type: 'time', axisLine: { lineStyle: { color: borde } }, axisLabel: { hideOverlap: true }, splitLine: { show: false } },
        yAxis: { type: 'value', scale: true, splitLine: { lineStyle: { color: borde, type: 'solid' } } },
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
          lineStyle: { width: 2, color: token(l.color) },
          // Último valor al final; las líneas en gris (4.º y 5.º fondo del comparador) llevan además su nombre.
          endLabel: { show: lineas.length <= 5, color: GRISES.has(l.color) ? suave : texto, fontSize: 11,
            formatter: (p: { value: [string, number] }) => `${cifra(p.value[1], 1)}${GRISES.has(l.color) ? ` ${l.nombre.length > largo ? l.nombre.slice(0, largo - 1) + '…' : l.nombre}` : ''}` },
          // Si dos líneas acaban cerca, sus valores se apartan en vertical en lugar de pisarse.
          labelLayout: { moveOverlap: 'shiftY' },
          itemStyle: { color: token(l.color) },
          data: l.serie.map((p) => [p.fecha, Number(p.valor.toFixed(2))]),
        })),
      },
      { notMerge: true },
    )
  }, [lineas, tema, tabla, ocultas])

  const alternar = (n: string) => setOcultas((o) => { const x = new Set(o); if (!x.delete(n)) x.add(n); return x })
  return (
    <div>
      <div className="flex items-start gap-3">
        {lineas.length > 1 && !tabla && (
          <ul className="flex min-w-0 flex-1 flex-wrap gap-x-4 gap-y-1 text-[12px]">
            {lineas.map((l) => (
              <li key={l.nombre} className="min-w-0 max-w-full">
                <button type="button" onClick={() => alternar(l.nombre)} aria-pressed={!ocultas.has(l.nombre)} title={l.nombre}
                  className={`flex max-w-full items-center gap-1.5 text-left ${ocultas.has(l.nombre) ? 'text-suave line-through' : 'text-texto hover:text-acento'}`}>
                  <span aria-hidden className="h-[3px] w-3.5 shrink-0" style={{ background: `var(--color-${l.color})` }} />
                  <span className="truncate">{l.nombre}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <button type="button" onClick={() => setTabla((t) => !t)} aria-pressed={tabla}
          className={`ml-auto shrink-0 rounded-sm px-2 py-0.5 font-mono text-[11px] ${tabla ? 'bg-panel text-texto ring-1 ring-borde' : 'text-suave hover:text-texto'}`}>
          {tabla ? 'Gráfico' : 'Tabla'}
        </button>
      </div>
      {tabla ? <TablaLineas lineas={lineas} alto={alto} /> : <div ref={caja} className={`w-full ${alto}`} />}
    </div>
  )
}

/** El gráfico en tabla: el último valor de cada mes (o cada punto, si son pocos), del más reciente al más antiguo. */
function TablaLineas({ lineas, alto }: { lineas: Linea[]; alto: string }) {
  const porMes = new Map<string, Map<string, number>>()
  for (const l of lineas) for (const p of l.serie) {
    const k = lineas[0].serie.length > 60 ? p.fecha.slice(0, 7) : p.fecha
    if (!porMes.has(k)) porMes.set(k, new Map())
    porMes.get(k)!.set(l.nombre, p.valor)
  }
  const filas = [...porMes.keys()].sort().reverse()
  return (
    <div className={`overflow-auto ${alto}`}>
      <table className="w-full text-right tabular text-[13px]">
        <thead className="sticky top-0 bg-panel text-[12px] text-suave">
          <tr className="border-b border-borde"><th className="py-1 text-left font-normal">{filas[0]?.length === 7 ? 'Mes' : 'Fecha'}</th>{lineas.map((l) => <th key={l.nombre} className="pl-4 font-normal">{l.nombre}</th>)}</tr>
        </thead>
        <tbody>
          {filas.map((k) => (
            <tr key={k} className="border-b border-borde/60">
              <td className="py-1 text-left text-suave">{k.length === 7 ? `${k.slice(5)}/${k.slice(0, 4)}` : fecha(k)}</td>
              {lineas.map((l) => { const v = porMes.get(k)!.get(l.nombre); return <td key={l.nombre} className="pl-4">{v == null ? '—' : cifra(v, 1)}</td> })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
