import { useEffect, useState } from 'react'
import { hoy, pct } from '../calculo/formato'
import { haceAnos, haceDias, muestra, variacion, type Punto } from '../calculo/series'
import { sustitutos } from '../datos/consultas'
import { serieEur } from '../datos/series'
import Mini from './Mini'

type Periodo = 'semana' | 'mes' | 'año'
const PERIODOS: Periodo[] = ['semana', 'mes', 'año']
/** Desde cuándo se mide cada periodo, a partir del último dato de la serie. */
const desde = (ultimo: string, p: Periodo) => (p === 'semana' ? haceDias(ultimo, 7) : p === 'mes' ? haceDias(ultimo, 30) : `${+ultimo.slice(0, 4) - 1}-12-31`)
const cambios = (s: Punto[]) => Object.fromEntries(PERIODOS.map((p) => [p, s.length ? variacion(s, desde(s.at(-1)!.fecha, p)) : null])) as Record<Periodo, number | null>
type Mercado = { indice: string; isin: string; bolsa: boolean; cambio: Record<Periodo, number | null>; anual: number | null; linea: number[] }
const tono = (v?: number | null) => (v == null ? 'text-suave' : v >= 0 ? 'text-sube' : 'text-baja')
const colorLinea = (l: number[]) => (l.length > 1 && l.at(-1)! < l[0] ? 'baja' : 'acento')

/** Cinta de Inicio, bajo la cabecera: los índices de referencia (con su fondo indexado en euros) corriendo en bucle, con el
 *  periodo a elegir. Se para al pasar el ratón, con el teclado, con su botón o si el sistema pide menos movimiento. */
export default function Cinta() {
  const [mercados, setMercados] = useState<Mercado[] | Error | null>(null)
  const [periodo, setPeriodo] = useState<Periodo>('semana')
  const [parada, setParada] = useState(false)
  useEffect(() => {
    sustitutos().then((is) => Promise.all(is.map(async (i): Promise<Mercado> => {
      const s = await serieEur(i.isin, 'EUR') // los fondos que representan a los índices están todos en euros
      const ultimo = s.at(-1)?.fecha ?? hoy()
      return { indice: i.indice, isin: i.isin, bolsa: /^(MSCI|S&P)/.test(i.indice), cambio: cambios(s), anual: variacion(s, haceAnos(ultimo, 1)), linea: muestra(s, haceAnos(ultimo, 1), 10) }
    }))).then(setMercados).catch(setMercados)
  }, [])

  const tramo = (copia: boolean) => Array.isArray(mercados) && [['Bolsa', mercados.filter((m) => m.bolsa)], ['Renta fija', mercados.filter((m) => !m.bolsa)]].flatMap(([g, ms]) => [
    <span key={`${g}${copia}`} className="ml-4 shrink-0 rounded-sm border border-borde px-2 py-0.5 rotulo">{g as string}</span>,
    ...(ms as Mercado[]).map((m) => {
      const v = m.cambio[periodo]
      return (
        <a key={m.isin + copia} href={`#/fondo/${m.isin}`} tabIndex={copia ? -1 : undefined} title={`${m.indice} · 1 año ${pct(m.anual)}`}
          className="flex shrink-0 items-center gap-2 px-4 py-2 text-[13px] whitespace-nowrap hover:text-acento">
          <span className="estrecha text-[14px] font-bold uppercase tracking-[0.02em]">{m.indice.replace(/^(MSCI|Bloomberg) /, '')}</span>
          <Mini valores={m.linea} color={colorLinea(m.linea)} className="h-3.5 w-11" />
          <span className={`tabular ${tono(v)}`}>{pct(v, 2)}<span className="sr-only"> ({periodo}); 1 año {pct(m.anual)}</span></span>
        </a>
      )
    }),
  ])

  return (
    <div className="border-b border-borde bg-panel">
      <div className="mx-auto flex min-h-10 flex-wrap items-center gap-x-3 px-4 pt-1.5 sm:flex-nowrap sm:pt-0">
        <div role="group" aria-label="Periodo de los índices" className="flex shrink-0 gap-0.5 rounded-sm bg-borde/50 p-0.5 text-[12px]">
          {PERIODOS.map((p) => (
            <button key={p} onClick={() => setPeriodo(p)} aria-pressed={periodo === p}
              className={`rounded-sm px-2.5 py-1 capitalize ${periodo === p ? 'bg-panel text-texto ring-1 ring-borde' : 'text-suave hover:text-texto'}`}>{p}</button>
          ))}
        </div>
        <div role="region" aria-label="Índices de referencia" className="cinta order-last min-w-0 basis-full sm:order-none sm:flex-1 sm:basis-auto">
          {!mercados ? <p className="px-4 py-2 text-[13px] text-suave">Cargando índices…</p>
            : mercados instanceof Error ? <p className="px-4 py-2 text-[13px] text-baja">No se han podido leer los índices: {mercados.message}</p>
            : (
              <div className={`cinta-pista flex w-max items-center ${parada ? 'parada' : ''}`}>
                {tramo(false)}
                {/* Segunda copia para que el bucle no tenga costura: ni se lee ni se alcanza con el teclado. */}
                <div aria-hidden="true" className="cinta-copia flex items-center">{tramo(true)}</div>
              </div>
            )}
        </div>
        <button onClick={() => setParada(!parada)} aria-label={parada ? 'Reanudar la cinta de índices' : 'Parar la cinta de índices'} title={parada ? 'Reanudar' : 'Parar'}
          className="ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-sm border border-borde text-suave hover:border-suave hover:text-texto sm:ml-0">
          <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            {parada ? <path d="M5 3.5v9l7-4.5z" /> : <path d="M5 3.5v9M11 3.5v9" />}
          </svg>
        </button>
      </div>
    </div>
  )
}
