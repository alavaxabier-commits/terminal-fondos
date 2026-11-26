import { useMemo, useState } from 'react'
import { montecarlo, PERCENTILES_MC, rendMensuales } from '../calculo/cartera'
import { cifra, pct } from '../calculo/formato'
import type { Punto } from '../calculo/series'
import Grafico from './Grafico'

const HORIZONTES = [5, 10, 20] as const
const COLOR = ['gris', 'suave', 'acento', 'suave', 'gris'] // P5 y P95 llevan su nombre al final (gris)
const MIN_MESES = 36
const CADA = [[1, 'mes'], [3, 'trimestre'], [6, 'semestre'], [12, 'año']] as const
const euros = (v: number) => `${cifra(v, 0)} €`
const control = 'w-24 rounded-md border border-borde bg-panel px-2 py-1 text-right text-texto outline-none focus:border-acento'

/** Campo de euros o %: vacío o no numérico cuenta como 0. */
const Numero = ({ etiqueta, valor, cambiar }: { etiqueta: string; valor: number; cambiar: (v: number) => void }) => (
  <label className="flex items-center gap-2 text-[13px]">
    <span>{etiqueta}</span>
    <input type="number" min={0} inputMode="decimal" value={valor} onChange={(e) => cambiar(Math.max(0, Number(e.target.value) || 0))} className={control} />
  </label>
)

/** Montecarlo de una cartera: futuros posibles, con un capital inicial y aportaciones periódicas, armados con tramos de un año de su propia historia simulada. */
export default function MonteCarlo({ sim }: { sim: Punto[] }) {
  const [anos, setAnos] = useState<number>(10)
  const [inicial, setInicial] = useState(10000)
  const [aporte, setAporte] = useState(0)
  const [cada, setCada] = useState<number>(1)
  const [subida, setSubida] = useState(0) // % al año que sube la aportación (p. ej. con la inflación)
  const rends = useMemo(() => rendMensuales(sim), [sim])
  const r = useMemo(() => {
    if (rends.length < MIN_MESES) return null
    const aportes = Array.from({ length: anos * 12 }, (_, m) => (m % cada === 0 ? aporte * (1 + subida / 100) ** Math.floor(m / 12) : 0))
    return montecarlo(rends, anos * 12, { inicial, aportes })
  }, [rends, anos, inicial, aporte, cada, subida])
  if (!r) return <p className="text-suave">Hacen falta al menos {MIN_MESES} meses de historia para simular (hay {rends.length}).</p>

  // un punto por mes desde el último valor
  const inicio = new Date(sim.at(-1)!.fecha + 'T00:00:00Z')
  const fechas = r.bandas.map((_, m) => { const d = new Date(inicio); d.setUTCMonth(d.getUTCMonth() + m); return d.toISOString().slice(0, 10) })
  const lineas = PERCENTILES_MC.map((p, k) => ({
    nombre: p === 50 ? 'Mediana' : `P${p}`, color: COLOR[k], serie: r.bandas.map((b, m) => ({ fecha: fechas[m], valor: b[k] })),
  })).reverse()
  const final = r.bandas.at(-1)!
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Numero etiqueta="Inicial (€)" valor={inicial} cambiar={setInicial} />
          <Numero etiqueta="Aportación (€)" valor={aporte} cambiar={setAporte} />
          <label className="flex items-center gap-2 text-[13px]">
            <span>cada</span>
            <select value={cada} onChange={(e) => setCada(+e.target.value)} className="rounded-md border border-borde bg-panel px-2 py-1 text-texto outline-none focus:border-acento">
              {CADA.map(([n, t]) => <option key={n} value={n}>{t}</option>)}
            </select>
          </label>
          <Numero etiqueta="Sube al año (%)" valor={subida} cambiar={setSubida} />
        </div>
        <div role="group" aria-label="Horizonte de la simulación" className="flex gap-0.5 rounded-sm bg-borde/50 p-0.5 text-[12px]">
          {HORIZONTES.map((n) => (
            <button key={n} onClick={() => setAnos(n)} aria-pressed={anos === n}
              className={`rounded-sm px-3 py-0.5 ${anos === n ? 'bg-panel text-texto ring-1 ring-borde' : 'text-suave hover:text-texto'}`}>{n} años</button>
          ))}
        </div>
      </div>
      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-[13px]">
        <div><dt className="rotulo">Aportado</dt><dd className="cifra text-[21px] font-bold">{euros(r.aportado)}</dd></div>
        <div><dt className="rotulo">Mediana</dt><dd className="cifra text-[21px] font-bold">{euros(final[2])} <span className="text-[13px] font-normal text-suave">{pct(final[2] / r.aportado - 1)}</span></dd></div>
        <div><dt className="rotulo">Mal escenario (P5)</dt><dd className="cifra text-[21px] font-bold">{euros(final[0])} <span className="text-[13px] font-normal text-suave">{pct(final[0] / r.aportado - 1)}</span></dd></div>
        <div><dt className="rotulo">Acabar con menos de lo aportado</dt><dd className="cifra text-[21px] font-bold">{pct(r.perdida, 0, false)}</dd></div>
      </dl>
      <Grafico lineas={lineas} alto="h-64 sm:h-80" />
      <p className="text-[11px] text-suave">
        2.000 futuros en euros, hechos con tramos de 12 meses seguidos de la cartera simulada ({cifra(rends.length, 0)} meses, con su rebalanceo),
        elegidos al azar. Entre P25 y P75 cae la mitad de los futuros; entre P5 y P95, nueve de cada diez. Cada aportación entra al empezar su mes; la subida anual la aumenta cada 12 meses. Supone que el futuro se parece a esa historia.
      </p>
    </div>
  )
}
