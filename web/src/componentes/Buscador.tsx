import { useEffect, useId, useRef, useState } from 'react'
import { millones } from '../calculo/formato'
import { ordenes } from '../calculo/ordenes'
import { buscar, carteras as leerCarteras, type Fondo } from '../datos/consultas'

type Fila = { clave: string; nombre: string; detalle?: string; suave?: boolean; tipo: string; ir: () => void }

/** Barra de órdenes: pantallas, carteras y fondos (por nombre o ISIN). Atajo «/» para escribir, ↑↓ mueven, Intro abre
 *  la resaltada (la primera si no se ha movido), Esc cierra. Con `onElegir` solo busca fondos y da el elegido (sin atajo). */
export default function Buscador({ onElegir, texto: indicacion = '/ fondo, cartera o pantalla' }: { onElegir?: (f: Fondo) => void; texto?: string } = {}) {
  const [texto, setTexto] = useState('')
  const [resultados, setResultados] = useState<Fondo[]>([])
  const [carteras, setCarteras] = useState<{ id: number; nombre: string }[]>([])
  const [abierto, setAbierto] = useState(false)
  const [activa, setActiva] = useState(0)
  const campo = useRef<HTMLInputElement>(null)
  const lista = useRef<HTMLUListElement>(null)
  const id = useId()

  useEffect(() => {
    if (onElegir) return
    leerCarteras().then(setCarteras).catch(() => setCarteras([])) // sin carteras, la barra sigue buscando fondos
    const atajo = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault()
        campo.current?.focus()
      }
    }
    addEventListener('keydown', atajo)
    return () => removeEventListener('keydown', atajo)
  }, [onElegir])

  useEffect(() => {
    let vigente = true
    const t = setTimeout(() => {
      buscar(texto).then((r) => vigente && setResultados(r)).catch(() => vigente && setResultados([]))
    }, 250)
    return () => { vigente = false; clearTimeout(t) }
  }, [texto])

  useEffect(() => { lista.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }) }, [activa])

  const filas: Fila[] = [
    ...(onElegir ? [] : ordenes(texto, carteras).map((o) => ({ clave: o.ruta, nombre: o.nombre, tipo: o.tipo, ir: () => { location.hash = o.ruta } }))),
    ...resultados.map((f) => ({
      clave: f.isin, nombre: f.nombre, suave: !f.en_universo, tipo: 'fondo',
      detalle: `${f.isin} · ${f.categoria ?? 'sin categoría'} · ${f.divisa} · ${millones(f.patrimonio_meur)}`,
      ir: () => { if (onElegir) onElegir(f); else location.hash = `#/fondo/${f.isin}` },
    })),
  ]
  const i = Math.min(activa, filas.length - 1)

  function abrir(f: Fila) {
    f.ir()
    setAbierto(false)
    setTexto('')
    campo.current?.blur()
  }

  const visible = abierto && filas.length > 0
  return (
    <div className="relative flex-1">
      <input
        ref={campo}
        value={texto}
        onChange={(e) => { setTexto(e.target.value); setAbierto(true); setActiva(0) }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            setActiva(Math.max(0, Math.min(filas.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1))))
          }
          if (e.key === 'Enter' && filas[i]) abrir(filas[i])
          if (e.key === 'Escape') campo.current?.blur()
        }}
        placeholder={indicacion}
        aria-label={indicacion}
        role="combobox"
        aria-expanded={visible}
        aria-controls={id}
        aria-activedescendant={visible ? `${id}-${i}` : undefined}
        className="w-full border border-borde bg-panel px-2 py-1 text-texto outline-none focus:border-acento"
      />
      {visible && (
        <ul ref={lista} id={id} role="listbox" className="absolute left-0 right-0 top-full z-20 max-h-[70vh] overflow-auto border border-borde bg-panel">
          {filas.map((f, k) => (
            <li key={f.clave} id={`${id}-${k}`} role="option" aria-selected={k === i} onMouseDown={() => abrir(f)} onMouseEnter={() => setActiva(k)}
              className={`flex cursor-pointer items-baseline gap-2 px-2 py-1.5 ${k === i ? 'bg-borde' : ''}`}>
              <span className="min-w-0 flex-1">
                <span className={f.suave ? 'text-suave' : 'text-texto'}>{f.nombre}</span>
                {f.detalle && <span className="block text-[11px] text-suave">{f.detalle}</span>}
              </span>
              {!onElegir && <span className="shrink-0 text-[11px] text-suave">{f.tipo}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
