import type { Fila } from '../calculo/exposicion'
import { pct } from '../calculo/formato'

/** Color de cada tipo de activo (el resto, gris), en Inicio, la ficha y la cartera. */
export const COLOR_ACTIVO: Record<string, string> = { Acciones: 'var(--color-acento)', Bonos: 'var(--color-serie2)', Liquidez: 'var(--color-gris)' }
const color = (n: string) => COLOR_ACTIVO[n] ?? 'var(--color-serie3)'

/** Tipo de activo en una barra partida (dataviz: un total en ≤ 6 partes, de un vistazo, mejor que un donut) y su leyenda.
 *  La cifra va dentro del bloque solo si cabe; siempre está en la leyenda. */
export default function Reparto({ activos, cobertura = 100 }: { activos: Fila[]; cobertura?: number }) {
  const positivos = activos.filter(([, v]) => v > 0.5)
  if (!positivos.length) return <p className="text-suave">Sin composición todavía: se descarga los domingos.</p>
  const total = positivos.reduce((t, [, v]) => t + v, 0)
  return (
    <div className="w-full min-w-0">
      <div className="flex h-8 gap-0.5 overflow-hidden rounded-lg" role="img" aria-label={`Tipo de activo: ${positivos.map(([n, v]) => `${n} ${Math.round(v)} %`).join(', ')}`}>
        {positivos.map(([n, v]) => (
          <span key={n} className="flex min-w-1 items-center overflow-hidden pl-2 text-[12px] font-medium whitespace-nowrap" style={{ flex: v / total, background: color(n), color: n === 'Acciones' ? 'var(--color-sobre-acento)' : 'var(--color-texto)' }}>
            {v / total > 0.14 ? pct(v / 100, 0, false) : ''}
          </span>
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
        {positivos.map(([n, v]) => (
          <li key={n} className="flex items-center gap-1.5">
            <i aria-hidden="true" className="inline-block h-2.5 w-2.5 shrink-0 rounded-xs" style={{ background: color(n) }} />
            <span>{n}</span><span className="text-suave">{pct(v / 100, 1, false)}</span>
          </li>
        ))}
      </ul>
      {cobertura < 99 && <p className="mt-1 text-[12px] text-suave">Con composición: {Math.round(cobertura)} % de la cartera</p>}
    </div>
  )
}
