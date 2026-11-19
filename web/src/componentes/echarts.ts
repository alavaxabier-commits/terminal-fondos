// Solo las piezas de ECharts que usan Grafico, Arbol y Dispersion: el paquete entero pesa casi 1 MB. Si un gráfico usa otra, se registra aquí.
import { LineChart, ScatterChart, TreemapChart } from 'echarts/charts'
import { AriaComponent, DataZoomComponent, GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import * as echarts from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([LineChart, ScatterChart, TreemapChart, AriaComponent, DataZoomComponent, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer])
export { echarts }
