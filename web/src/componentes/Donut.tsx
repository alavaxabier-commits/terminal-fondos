import type { Fila } from '../calculo/exposicion'

/** Color de cada tipo de activo (el resto, arena), en Inicio, la ficha y la cartera. */
export const COLOR_ACTIVO: Record<string, string> = { Acciones: 'var(--color-acento)', Bonos: 'var(--color-serie3)', Liquidez: 'var(--color-suave)' }

/** Tipo de activo en un donut y su leyenda; mismos colores que la exposición de la cartera. */
export default function Donut({ activos, cobertura = 100 }: { activos: Fila[]; cobertura?: number }) {
  const positivos = activos.filter(([, v]) => v > 0.5)
  if (!positivos.length) return <p className="text-suave">Sin composición todavía: se descarga los domingos.</p>
  const total = positivos.reduce((t, [, v]) => t + v, 0)
  let acum = 0
  const mayor = positivos[0][0] // mezclar() las devuelve de mayor a menor
  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 100 100" className="h-32 w-32 shrink-0" role="img" aria-label={`Tipo de activo: ${positivos.map(([n, v]) => `${n} ${Math.round(v)} %`).join(', ')}`}>
        <circle cx="50" cy="50" r="40" fill="none" strokeWidth="13" style={{ stroke: 'var(--color-borde)' }} />
        {positivos.map(([n, v]) => {
          const parte = (v / total) * 100
          const el = <circle key={n} cx="50" cy="50" r="40" fill="none" strokeWidth="13" pathLength={100} transform="rotate(-90 50 50)"
            strokeDasharray={`${Math.max(parte - 0.6, 0.1)} ${100 - Math.max(parte - 0.6, 0.1)}`} strokeDashoffset={-acum} style={{ stroke: COLOR_ACTIVO[n] ?? 'var(--color-serie2)' }} />
          acum += parte
          return el
        })}
      </svg>
      <ul className="min-w-0 space-y-1 text-[13px]">
        {positivos.map(([n, v]) => (
          <li key={n} className="flex items-center gap-2">
            <i aria-hidden="true" className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: COLOR_ACTIVO[n] ?? 'var(--color-serie2)' }} />
            <span className={n === mayor ? 'text-texto' : 'text-suave'}>{n}</span><span className="tabular">{Math.round(v)} %</span>
          </li>
        ))}
        {cobertura < 99 && <li className="text-[12px] text-suave">Con composición: {Math.round(cobertura)} % de la cartera</li>}
      </ul>
    </div>
  )
}
