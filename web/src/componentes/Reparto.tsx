import type { Fila } from '../calculo/exposicion'
import { pct } from '../calculo/formato'

/** Color de cada tipo de activo (el resto, gris), en Inicio, la ficha y la cartera. */
export const COLOR_ACTIVO: Record<string, string> = { Acciones: 'var(--color-serie1)', Bonos: 'var(--color-serie2)', Liquidez: 'var(--color-gris)' }
const color = (n: string) => COLOR_ACTIVO[n] ?? 'var(--color-serie3)'

/** Tipo de activo en una barra partida (dataviz: un total en ≤ 6 partes, de un vistazo, mejor que un donut) y su leyenda.
 *  Las cifras, en la leyenda. */
export default function Reparto({ activos, cobertura = 100 }: { activos: Fila[]; cobertura?: number }) {
  const positivos = activos.filter(([, v]) => v > 0.5)
  if (!positivos.length) return <p className="text-suave">Sin composición todavía: se descarga los domingos.</p>
  const total = positivos.reduce((t, [, v]) => t + v, 0)
  return (
    <div className="w-full min-w-0">
      {/* Sin cifras dentro: con colores apagados no hay un color de texto legible sobre los tres; van en la leyenda. */}
      <div className="flex h-6 gap-0.5 overflow-hidden rounded-lg" role="img" aria-label={`Tipo de activo: ${positivos.map(([n, v]) => `${n} ${Math.round(v)} %`).join(', ')}`}>
        {positivos.map(([n, v]) => <span key={n} className="min-w-1" style={{ flex: v / total, background: color(n) }} />)}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
        {positivos.map(([n, v]) => (
          <li key={n} className="flex items-center gap-1.5">
            <i aria-hidden="true" className="inline-block h-2.5 w-2.5 shrink-0 rounded-xs" style={{ background: color(n) }} />
            <span>{n}</span><span className="tabular text-suave">{pct(v / 100, 1, false)}</span>
          </li>
        ))}
      </ul>
      {cobertura < 99 && <p className="mt-1 text-[12px] text-suave">Con composición: {Math.round(cobertura)} % de la cartera</p>}
    </div>
  )
}
