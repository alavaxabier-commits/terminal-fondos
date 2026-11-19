import { useEffect, useMemo, useRef, useState } from 'react'
import { cifra, hoy, pct } from '../calculo/formato'
import { aPesosTipo } from '../calculo/nota'
import { cifraDe, grupo, grupos, NOMBRE_GRUPO, pasa, puntuar, tipoActivo, TIPOS, type Filtros, type Puntuado } from '../calculo/screener'
import * as q from '../datos/consultas'
import { MAX_BANDEJA } from '../datos/bandeja'

// El universo se lee una vez por visita y se comparte entre aperturas del cajón.
let universo: Promise<q.FilaScreener[]> | null = null
const leerUniverso = () => (universo ??= q.screener().catch((e) => { universo = null; throw e }))
/** Los pesos que haya en el screener (lo que se eligió allí, perfil incluido), para que la nota sea la misma. */
const pesosScreener = () => { try { return aPesosTipo(JSON.parse(sessionStorage.getItem('screener') ?? '{}').pesos) } catch { return aPesosTipo(undefined) } }

const POR_PAGINA = 50
const tono = (v: number | null) => (v == null ? 'text-suave' : v >= 0 ? 'text-sube' : 'text-baja')
type Col = 'nota' | 'ter' | 'rent' | 'vol' | 'caida'
type Fila = { isin: string; nombre: string; categoria: string | null; p: Puntuado | null }
const control = 'min-w-0 rounded-sm border border-borde bg-panel px-2 py-1 text-texto outline-none focus:border-acento'

/** La categoría que más se repite entre los fondos que se comparan: de ahí salen los filtros de partida. */
function masComun(cats: (string | null)[]): string | null {
  const n = new Map<string, number>()
  for (const c of cats) if (c) n.set(c, (n.get(c) ?? 0) + 1)
  return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

/** Cajón para añadir fondos al comparador sin salir de él: el universo por nota (pesos del screener), filtrado por tipo,
 *  grupo y categoría (de partida, la de los fondos comparados), o buscado por nombre o ISIN (entonces también fuera del universo). */
export default function Candidatos({ isins, categorias, rango, anadir, cerrar }: {
  isins: string[]; categorias: (string | null)[]; rango: number; anadir: (f: { isin: string; nombre: string }) => void; cerrar: () => void
}) {
  const [datos, setDatos] = useState<q.FilaScreener[] | null>(null)
  const [error, setError] = useState('')
  const [filtros, setFiltros] = useState<Filtros>(() => {
    const c = masComun(categorias)
    return c ? { tipo: tipoActivo(c), grupo: grupo(c) ?? undefined, categoria: c } : {}
  })
  const [texto, setTexto] = useState('')
  const [encontrados, setEncontrados] = useState<q.Fondo[] | null>(null)
  const [orden, setOrden] = useState<Col>('nota')
  const [mostrar, setMostrar] = useState(POR_PAGINA)
  const [activa, setActiva] = useState(0)
  const campo = useRef<HTMLInputElement>(null)
  const lleno = isins.length >= MAX_BANDEJA
  const plazo = `${rango}a`

  useEffect(() => { leerUniverso().then(setDatos).catch((e: Error) => setError(e.message)) }, [])
  useEffect(() => { campo.current?.focus() }, [])
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar() }
    addEventListener('keydown', tecla)
    return () => removeEventListener('keydown', tecla)
  }, [cerrar])

  useEffect(() => { // por nombre o ISIN, en la base (como la barra de órdenes)
    setActiva(0)
    if (texto.trim().length < 2) { setEncontrados(null); return }
    let vigente = true
    const t = setTimeout(() => q.buscar(texto).then((r) => vigente && setEncontrados(r)).catch(() => vigente && setEncontrados([])), 250)
    return () => { vigente = false; clearTimeout(t) }
  }, [texto])

  const puntuados = useMemo(() => (datos ? puntuar(datos, pesosScreener()) : []), [datos])
  const porIsin = useMemo(() => new Map(puntuados.map((p) => [p.isin, p])), [puntuados])
  const valor: Record<Col, (p: Puntuado) => number | null> = {
    nota: (p) => p.nota, ter: (p) => p.ter, rent: (p) => cifraDe(p, `${plazo}|rentabilidad`),
    vol: (p) => cifraDe(p, `${plazo}|volatilidad`), caida: (p) => cifraDe(p, `${plazo}|max_caida`),
  }
  const menos = orden === 'ter' || orden === 'vol' // en la caída (negativa) más es mejor
  const filas: Fila[] = useMemo(() => {
    if (encontrados) return encontrados.map((f) => ({ isin: f.isin, nombre: f.nombre, categoria: f.categoria, p: porIsin.get(f.isin) ?? null }))
    const hoyEs = hoy(), nadie = new Set<string>()
    const v = valor[orden]
    return puntuados.filter((p) => pasa(p, filtros, hoyEs, nadie))
      .sort((a, b) => (v(a) == null ? 1 : 0) - (v(b) == null ? 1 : 0) || (menos ? 1 : -1) * ((v(a) ?? 0) - (v(b) ?? 0)))
      .map((p) => ({ isin: p.isin, nombre: p.nombre, categoria: p.categoria, p }))
  }, [encontrados, porIsin, puntuados, filtros, orden, plazo]) // eslint-disable-line react-hooks/exhaustive-deps
  const visibles = filas.slice(0, mostrar)
  const i = Math.min(activa, visibles.length - 1)

  // opciones de los desplegables, con lo que cuelga del nivel de arriba
  const enTipo = useMemo(() => puntuados.filter((p) => !filtros.tipo || tipoActivo(p.categoria) === filtros.tipo), [puntuados, filtros.tipo])
  const categoriasDe = useMemo(() => {
    const n = new Map<string, number>()
    for (const p of enTipo) if (p.categoria && (!filtros.grupo || grupo(p.categoria) === filtros.grupo)) n.set(p.categoria, (n.get(p.categoria) ?? 0) + 1)
    return [...n].sort((a, b) => a[0].localeCompare(b[0]))
  }, [enTipo, filtros.grupo])
  const filtrar = (f: Filtros) => { setFiltros(f); setMostrar(POR_PAGINA); setActiva(0) }

  const poner = (f: Fila) => { if (!lleno && !isins.includes(f.isin)) anadir({ isin: f.isin, nombre: f.nombre }) }
  const cabecera = (c: Col, texto: string) => (
    <th className="pb-1 pl-3 font-normal" aria-sort={!encontrados && orden === c ? (c === 'ter' || c === 'vol' ? 'ascending' : 'descending') : undefined}>
      {encontrados ? texto // la búsqueda por nombre llega ya ordenada (universo primero, por patrimonio)
        : <button onClick={() => { setOrden(c); setMostrar(POR_PAGINA) }} className={orden === c ? 'text-texto' : 'hover:text-texto'}>{texto}{orden === c ? ' ↓' : ''}</button>}
    </th>
  )

  return (
    <aside aria-label="Añadir fondos al comparador"
      className="cajon fixed inset-0 z-20 m-0 flex flex-col bg-panel sm:inset-y-0 sm:left-auto sm:w-[min(46rem,92vw)] sm:border-l sm:border-borde">
      <div className="space-y-3 border-b border-borde p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="estrecha text-[17px] font-bold uppercase tracking-[0.02em]">Añadir fondos</h2>
          <span className="ml-auto text-[12px] text-suave tabular">{isins.length} de {MAX_BANDEJA}</span>
          <button onClick={cerrar} aria-label="Cerrar" className="min-h-7 min-w-7 text-suave hover:text-texto">✕</button>
        </div>
        <input ref={campo} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Nombre o ISIN (busca en todos los fondos)" aria-label="Buscar por nombre o ISIN"
          className={`${control} w-full py-1.5`}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault()
              const n = Math.max(0, Math.min(visibles.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))
              setActiva(n)
              document.querySelector(`[data-candidato="${visibles[n]?.isin}"]`)?.scrollIntoView({ block: 'nearest' })
            }
            if (e.key === 'Enter' && visibles[i]) poner(visibles[i])
          }} />
        <div className={`grid grid-cols-1 gap-2 text-[13px] sm:grid-cols-3 ${encontrados ? 'opacity-50' : ''}`}>
          <select aria-label="Tipo de activo" className={control} value={filtros.tipo ?? ''}
            onChange={(e) => filtrar({ tipo: (e.target.value || undefined) as Filtros['tipo'] })}>
            <option value="">Todos los tipos</option>
            {TIPOS.map((t) => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}
          </select>
          <select aria-label={filtros.tipo ? NOMBRE_GRUPO[filtros.tipo] ?? 'Grupo' : 'Grupo'} className={control} value={filtros.grupo ?? ''}
            disabled={!filtros.tipo || !grupos(filtros.tipo).length} onChange={(e) => filtrar({ tipo: filtros.tipo, grupo: e.target.value || undefined })}>
            <option value="">{filtros.tipo && NOMBRE_GRUPO[filtros.tipo] ? `${NOMBRE_GRUPO[filtros.tipo]}: todos` : 'Todos los grupos'}</option>
            {filtros.tipo && grupos(filtros.tipo).map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <select aria-label="Categoría" className={control} value={filtros.categoria ?? ''}
            onChange={(e) => filtrar({ ...filtros, categoria: e.target.value || undefined })}>
            <option value="">Todas las categorías</option>
            {categoriasDe.map(([c, n]) => <option key={c} value={c}>{c} ({n})</option>)}
          </select>
        </div>
        <p className="text-[11px] text-suave">
          {encontrados ? 'Buscando por nombre: los filtros no cuentan. En gris, fuera del universo (sin cifras).'
            : `Nota con los pesos del screener · cifras a ${rango} ${rango === 1 ? 'año' : 'años'}, el plazo del comparador · ↑↓ e Intro para añadir, Esc cierra`}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
        {error ? <p className="pt-4 text-baja">No se ha podido leer el universo: {error}. Cierra y vuelve a abrir para reintentar.</p>
          : !datos ? <p className="pt-4 text-suave">Cargando el universo…</p>
          : !visibles.length ? <p className="pt-4 text-suave">{encontrados ? 'Ningún fondo con ese nombre o ISIN.' : 'Ningún fondo con estos filtros.'}</p>
          : (
            <table className="w-full whitespace-nowrap text-right text-[13px] tabular">
              <thead className="rotulo sticky top-0 bg-panel">
                <tr className="[&>th]:pb-1.5 [&>th]:pt-3">
                  <th className="sticky left-0 bg-panel pb-1 text-left font-normal">Fondo</th>
                  {cabecera('nota', 'Nota')}{cabecera('ter', 'TER')}{cabecera('rent', `Rent. ${rango}A`)}{cabecera('vol', `Vol. ${rango}A`)}{cabecera('caida', `Caída ${rango}A`)}
                  <th className="w-px pl-3"><span className="sr-only">Añadir</span></th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((f, k) => {
                  const dentro = isins.includes(f.isin), p = f.p
                  const c = (v: number | null, t: string) => <td className={`pl-3 ${v == null ? 'text-suave' : ''}`}>{v == null ? '—' : t}</td>
                  return (
                    <tr key={f.isin} data-candidato={f.isin} onMouseEnter={() => setActiva(k)}
                      className={`border-t border-borde/60 ${k === i ? 'bg-fondo' : ''} ${p ? '' : 'text-suave'}`}>
                      <td className={`sticky left-0 w-full max-w-0 min-w-44 py-1.5 pr-2 text-left ${k === i ? 'bg-fondo' : 'bg-panel'}`}>
                        <a href={`#/fondo/${f.isin}`} className="block truncate hover:text-acento" title={f.nombre}>{f.nombre}</a>
                        <span className="block truncate text-[11px] text-suave">{f.categoria ?? 'sin categoría'}{p ? '' : ' · fuera del universo'}</span>
                      </td>
                      <td className="pl-3">{p?.nota == null ? <span className="text-suave">—</span> : <span className="cifra text-[21px] font-extrabold leading-none">{Math.round(p.nota)}</span>}</td>
                      {c(p?.ter ?? null, `${cifra(p?.ter)} %`)}
                      <td className={`pl-3 ${tono(p ? valor.rent(p) : null)}`}>{pct(p ? valor.rent(p) : null)}</td>
                      {c(p ? valor.vol(p) : null, pct(p ? valor.vol(p) : null, 1, false))}
                      {c(p ? valor.caida(p) : null, pct(p ? valor.caida(p) : null))}
                      <td className="pl-3">
                        {dentro ? <span className="text-[12px] text-suave"><span style={{ color: `var(--color-serie${isins.indexOf(f.isin) + 1})` }} aria-hidden="true">● </span>comparando</span> : (
                          <button onClick={() => poner(f)} disabled={lleno} title={lleno ? `Como mucho ${MAX_BANDEJA}: quita uno para añadir otro` : undefined}
                            aria-label={`Añadir ${f.nombre}`} className="px-1 py-0.5 text-acento hover:underline disabled:text-suave disabled:no-underline">+ añadir</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        {filas.length > mostrar && (
          <button onClick={() => setMostrar((m) => m + POR_PAGINA)} className="boton mt-3">Ver {Math.min(POR_PAGINA, filas.length - mostrar)} más de {filas.length - mostrar}</button>
        )}
      </div>
    </aside>
  )
}
