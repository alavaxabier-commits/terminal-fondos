import { useEffect, useState } from 'react'
import { fecha } from '../calculo/formato'
import { estadoDescargas, type Tarea } from '../calculo/vigilancia'
import { crearCartera, carteras as leerCarteras, sustitutos, vigilancia, type Cartera } from '../datos/consultas'

/** Inicio: mis carteras modelo y atajos a los índices. Los avisos llegan en las fases 3 y 4. */
export default function Inicio() {
  const [indices, setIndices] = useState<{ indice: string; isin: string }[]>([])
  const [carteras, setCarteras] = useState<Cartera[]>([])
  const [error, setError] = useState('')
  const [descargas, setDescargas] = useState<Tarea[] | null>(null)
  useEffect(() => {
    vigilancia().then((l) => setDescargas(estadoDescargas(l, new Date()))).catch((e: Error) => setError(e.message))
    sustitutos().then(setIndices).catch((e: Error) => setError(e.message))
    leerCarteras().then(setCarteras).catch((e: Error) => setError(e.message))
  }, [])

  return (
    <div className="space-y-6">
      <p className="text-suave">Busca un fondo por nombre o ISIN (tecla «/»), o abre uno de los índices de referencia.</p>
      {error && <p className="text-baja">No se han podido leer los datos: {error}</p>}
      {descargas && <EstadoDescargas tareas={descargas} />}
      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-[11px] uppercase tracking-widest text-suave">Carteras modelo</h2>
          <button
            onClick={() => crearCartera({ nombre: 'Cartera nueva', objetivo: null, rebalanceo: 'anual', banda: 5, banda_tipo: 'puntos', revision: 'diaria' }).then((id) => (location.hash = `#/cartera/${id}`)).catch((e: Error) => setError(e.message))}
            className="min-h-8 border border-borde px-3 text-suave hover:text-texto"
          >
            nueva cartera
          </button>
        </div>
        {carteras.length > 0 && (
          <ul className="grid gap-px border border-borde bg-borde sm:grid-cols-2">
            {carteras.map((c) => (
              <li key={c.id} className="bg-fondo">
                <a href={`#/cartera/${c.id}`} className="block px-3 py-2 hover:bg-panel">
                  {c.nombre} <span className="text-suave">· rebalanceo {c.rebalanceo}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2 className="mb-2 text-[11px] uppercase tracking-widest text-suave">Índices de referencia</h2>
        <ul className="grid gap-px border border-borde bg-borde sm:grid-cols-2">
          {indices.map((i) => (
            <li key={i.isin} className="bg-fondo">
              <a href={`#/fondo/${i.isin}`} className="block px-3 py-2 hover:bg-panel">
                {i.indice} <span className="text-suave">· {i.isin}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

const hora = (ts: string) => `${fecha(ts)} ${new Date(ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`

/** Una línea con el estado de las descargas; en rojo, las alarmas y las tareas que no han pasado cuando tocaba. */
function EstadoDescargas({ tareas }: { tareas: Tarea[] }) {
  const mal = tareas.filter((t) => t.alarmas.length || t.atrasada)
  if (!tareas.length) return null
  if (!mal.length)
    return (
      <p className="text-suave">
        <span className="text-sube" aria-hidden="true">● </span>
        Descargas en orden · {tareas.map((t) => `${t.tarea} ${hora(t.ts)}`).join(' · ')}
      </p>
    )
  return (
    <section role="alert" className="border border-baja/60 p-3">
      <h2 className="mb-1 text-[11px] uppercase tracking-widest text-baja">Alarmas de las descargas</h2>
      <ul className="space-y-1">
        {mal.flatMap((t) => [
          ...t.alarmas.map((a) => <li key={t.tarea + a}><span className="text-suave">{t.tarea} · {hora(t.ts)} · </span>{a}</li>),
          ...(t.atrasada ? [<li key={t.tarea + 'atrasada'}><span className="text-suave">{t.tarea} · </span>no ha pasado desde el {hora(t.ts)}</li>] : []),
        ])}
      </ul>
      <p className="mt-2 text-suave">Puede que Morningstar haya cambiado algo: el detalle está en GitHub Actions y en el registro de descargas.</p>
    </section>
  )
}
