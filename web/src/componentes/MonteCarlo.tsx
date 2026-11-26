import { useMemo, useState } from 'react'
import { montecarlo, PERCENTILES_MC, rendMensuales } from '../calculo/cartera'
import { cifra, pct } from '../calculo/formato'
import type { Punto } from '../calculo/series'
import Grafico from './Grafico'

const HORIZONTES = [5, 10, 20] as const
const COLOR = ['gris', 'suave', 'acento', 'suave', 'gris'] // P5 y P95 llevan su nombre al final (gris)
const MIN_MESES = 36

/** Montecarlo de una cartera: futuros posibles en base 100 armados con tramos de un año de su propia historia simulada. */
export default function MonteCarlo({ sim }: { sim: Punto[] }) {
  const [anos, setAnos] = useState<number>(10)
  const rends = useMemo(() => rendMensuales(sim), [sim])
  const r = useMemo(() => (rends.length >= MIN_MESES ? montecarlo(rends, anos * 12) : null), [rends, anos])
  if (!r) return <p className="text-suave">Hacen falta al menos {MIN_MESES} meses de historia para simular (hay {rends.length}).</p>

  // un punto por mes desde el último valor
  const inicio = new Date(sim.at(-1)!.fecha + 'T00:00:00Z')
  const fechas = r.bandas.map((_, m) => { const d = new Date(inicio); d.setUTCMonth(d.getUTCMonth() + m); return d.toISOString().slice(0, 10) })
  const lineas = PERCENTILES_MC.map((p, k) => ({
    nombre: p === 50 ? 'Mediana' : `P${p}`, color: COLOR[k], serie: r.bandas.map((b, m) => ({ fecha: fechas[m], valor: b[k] })),
  })).reverse()
  const final = r.bandas.at(-1)!
  const anual = (v: number) => (v / 100) ** (1 / anos) - 1
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-[13px]">
          <div><dt className="rotulo">Mediana</dt><dd className="cifra text-[21px] font-bold">{cifra(final[2], 0)} <span className="text-[13px] font-normal text-suave">{pct(anual(final[2]))} al año</span></dd></div>
          <div><dt className="rotulo">Mal escenario (P5)</dt><dd className="cifra text-[21px] font-bold">{cifra(final[0], 0)} <span className="text-[13px] font-normal text-suave">{pct(anual(final[0]))} al año</span></dd></div>
          <div><dt className="rotulo">Acabar perdiendo</dt><dd className="cifra text-[21px] font-bold">{pct(r.perdida, 0, false)}</dd></div>
        </dl>
        <div role="group" aria-label="Horizonte de la simulación" className="flex gap-0.5 rounded-sm bg-borde/50 p-0.5 text-[12px]">
          {HORIZONTES.map((n) => (
            <button key={n} onClick={() => setAnos(n)} aria-pressed={anos === n}
              className={`rounded-sm px-3 py-0.5 ${anos === n ? 'bg-panel text-texto ring-1 ring-borde' : 'text-suave hover:text-texto'}`}>{n} años</button>
          ))}
        </div>
      </div>
      <Grafico lineas={lineas} alto="h-64 sm:h-80" />
      <p className="text-[11px] text-suave">
        2.000 futuros en base 100, hechos con tramos de 12 meses seguidos de la cartera simulada ({cifra(rends.length, 0)} meses, con su rebalanceo),
        elegidos al azar. Entre P25 y P75 cae la mitad de los futuros; entre P5 y P95, nueve de cada diez. Supone que el futuro se parece a esa historia.
      </p>
    </div>
  )
}
