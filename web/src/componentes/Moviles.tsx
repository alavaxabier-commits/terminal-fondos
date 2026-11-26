import { useMemo, useState } from 'react'
import { movil, type Punto } from '../calculo/series'
import Grafico from './Grafico'

const PLAZOS = [2, 3, 5] as const

/** Rentabilidad móvil (anualizada, en %) a 2, 3 o 5 años de cada línea: cómo le ha ido a quien entró en cada fecha y
 *  aguantó ese plazo. Se calcula con las mismas series que el gráfico de valor. */
export default function Moviles({ lineas }: { lineas: { nombre: string; serie: Punto[]; color: string }[] }) {
  const [anos, setAnos] = useState<number>(3)
  const moviles = useMemo(() => lineas.map((l) => ({ ...l, serie: movil(l.serie, anos) })).filter((l) => l.serie.length), [lineas, anos])
  return (
    <div className="space-y-2">
      <div role="group" aria-label="Plazo de la rentabilidad móvil" className="ml-auto flex w-fit gap-0.5 rounded-sm bg-borde/50 p-0.5 text-[12px]">
        {PLAZOS.map((n) => (
          <button key={n} onClick={() => setAnos(n)} aria-pressed={anos === n}
            className={`rounded-sm px-3 py-0.5 ${anos === n ? 'bg-panel text-texto ring-1 ring-borde' : 'text-suave hover:text-texto'}`}>{n}A</button>
        ))}
      </div>
      {moviles.length ? <Grafico lineas={moviles} alto="h-56 sm:h-72" /> : <p className="text-suave">No hay historial de {anos} años.</p>}
      <p className="text-[11px] text-suave">En cada fecha, la rentabilidad anual de los {anos} años anteriores, en % y en euros.</p>
    </div>
  )
}
