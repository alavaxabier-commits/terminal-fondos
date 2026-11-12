import { useEffect, useState } from 'react'
import { sustitutos } from '../datos/consultas'

/** Fase 1: la pantalla de inicio solo orienta. Carteras y avisos llegan en las fases 2 a 4. */
export default function Inicio() {
  const [indices, setIndices] = useState<{ indice: string; isin: string }[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    sustitutos().then(setIndices).catch((e: Error) => setError(e.message))
  }, [])

  return (
    <div className="space-y-6">
      <p className="text-suave">Busca un fondo por nombre o ISIN (tecla «/»), o abre uno de los índices de referencia.</p>
      {error && <p className="text-baja">No se han podido leer los datos: {error}</p>}
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
