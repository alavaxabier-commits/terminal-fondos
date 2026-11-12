import { useEffect, useRef, useState } from 'react'
import { millones } from '../calculo/formato'
import { buscar, type Fondo } from '../datos/consultas'

/** Búsqueda por nombre o ISIN. Atajo: «/» para escribir, Intro abre el primero, Esc cierra. */
export default function Buscador() {
  const [texto, setTexto] = useState('')
  const [resultados, setResultados] = useState<Fondo[]>([])
  const [abierto, setAbierto] = useState(false)
  const campo = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const atajo = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault()
        campo.current?.focus()
      }
    }
    addEventListener('keydown', atajo)
    return () => removeEventListener('keydown', atajo)
  }, [])

  useEffect(() => {
    let vigente = true
    const t = setTimeout(() => {
      buscar(texto).then((r) => vigente && setResultados(r)).catch(() => vigente && setResultados([]))
    }, 250)
    return () => { vigente = false; clearTimeout(t) }
  }, [texto])

  function abrir(isin: string) {
    location.hash = `#/fondo/${isin}`
    setAbierto(false)
    setTexto('')
    campo.current?.blur()
  }

  return (
    <div className="relative flex-1">
      <input
        ref={campo}
        value={texto}
        onChange={(e) => { setTexto(e.target.value); setAbierto(true) }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && resultados[0]) abrir(resultados[0].isin)
          if (e.key === 'Escape') campo.current?.blur()
        }}
        placeholder="/ buscar fondo o ISIN"
        className="w-full border border-borde bg-panel px-2 py-1 text-texto outline-none focus:border-acento"
      />
      {abierto && resultados.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-20 max-h-[70vh] overflow-auto border border-borde bg-panel">
          {resultados.map((f) => (
            <li key={f.isin}>
              <button onMouseDown={() => abrir(f.isin)} className="block w-full px-2 py-1.5 text-left hover:bg-borde">
                <span className={f.en_universo ? 'text-texto' : 'text-suave'}>{f.nombre}</span>
                <span className="block text-[11px] text-suave">
                  {f.isin} · {f.categoria ?? 'sin categoría'} · {f.divisa} · {millones(f.patrimonio_meur)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
