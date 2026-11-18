import { useRef, useState } from 'react'
import type { CalculoCartera } from '../calculo/cartera'
import { fecha } from '../calculo/formato'
import { FILAS, GRUPOS } from '../pantallas/Ficha'
import { corto } from './EstadisticasCartera'

const PLAZOS = [['1a', '1 año'], ['3a', '3 años'], ['5a', '5 años'], ['10a', '10 años']] as const
// Como en nucleo/metricas.py: dónde menos es mejor y qué no tiene mejor ni peor.
const MENOS = new Set(['volatilidad', 'volatilidad_mensual', 'tracking_error', 'captura_bajista'])
const NEUTRAS = new Set(['beta', 'acumulada', 'r2'])
const etiqueta = (k: string) => FILAS.find(([x]) => x === k)!

/** Mejor (1), parecida (0) o peor (−1) que la referencia: parecida si la diferencia no llega al 5 % de la cifra de la referencia. */
export function frente(k: string, c: number, r: number | null | undefined): 1 | 0 | -1 | null {
  if (r == null || NEUTRAS.has(k)) return null
  const d = MENOS.has(k) ? r - c : c - r
  return Math.abs(d) < Math.abs(r) * 0.05 ? 0 : d > 0 ? 1 : -1
}
const fondoCelda = (f: 1 | 0 | -1 | null) => (f == null ? 'bg-panel ring-1 ring-inset ring-borde' : f > 0 ? 'bg-tinte-alta' : f < 0 ? 'bg-tinte-baja' : 'bg-borde/45')

type FondoMapa = { isin: string; nombre: string; peso: number; metricas: Map<string, number> | undefined }

/** Pestaña Métricas de la cartera: un mapa métrica × plazo con la cifra de la cartera y la de su referencia (el color dice si es
 *  mejor o peor) y, al lado, la celda elegida con la cartera, la referencia y cada uno de sus fondos en una misma escala. */
export default function MapaCartera({ calc, fondos }: { calc: CalculoCartera; fondos: FondoMapa[] }) {
  const m = calc.metricas, ref = calc.referencia ?? {}
  const filas = GRUPOS.map(([grupo, ayuda, claves]) => ({ grupo, ayuda, claves: claves.filter(([k]) => FILAS.some(([x]) => x === k) && PLAZOS.some(([v]) => m[v]?.[k] != null)) }))
    .filter((g) => g.claves.length)
  const [sel, setSel] = useState(m['3a']?.volatilidad != null ? '3a|volatilidad' : `${PLAZOS.find(([v]) => m[v])?.[0] ?? '1a'}|rentabilidad`)
  const panel = useRef<HTMLElement>(null)
  if (!filas.length) return <p className="text-suave">Sin historia suficiente para las métricas (hace falta al menos un año).</p>
  const elegir = (k: string) => {
    setSel(k)
    if (matchMedia('(max-width: 1023px)').matches) panel.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }
  const totales = PLAZOS.map(([v]) => {
    const fs = filas.flatMap((g) => g.claves.map(([k]) => (m[v]?.[k] == null ? null : frente(k, m[v][k], ref[v]?.[k])))).filter((x) => x != null)
    return { mejor: fs.filter((x) => x > 0).length, peor: fs.filter((x) => x < 0).length, hay: !!m[v] }
  })
  const fila = 'grid grid-cols-[minmax(0,7.5rem)_repeat(4,minmax(0,1fr))] gap-[3px] sm:grid-cols-[13rem_repeat(4,minmax(0,1fr))]'
  return (
    <div className="space-y-3">
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-suave">
        <li><i aria-hidden="true" className="mr-1.5 inline-block h-3 w-3 rounded-xs bg-tinte-alta align-[-2px]" />mejor que la referencia</li>
        <li><i aria-hidden="true" className="mr-1.5 inline-block h-3 w-3 rounded-xs bg-borde/45 align-[-2px]" />parecida (menos de un 5 % de diferencia)</li>
        <li><i aria-hidden="true" className="mr-1.5 inline-block h-3 w-3 rounded-xs bg-tinte-baja align-[-2px]" />peor</li>
        <li>· pulsa una cifra: al lado, la cartera, la referencia y sus fondos</li>
      </ul>
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="flex flex-col gap-[3px]">
          <div className={`${fila} sticky top-(--alto-cabecera,48px) z-[5] bg-fondo py-1.5`}>
            <span className="rotulo">Métrica</span>
            {PLAZOS.map(([v, t]) => <span key={v} className="rotulo text-center">{t}</span>)}
          </div>
          {filas.map((g) => (
            <section key={g.grupo} aria-label={g.grupo} className="flex flex-col gap-[3px]">
              <h3 className="mt-3 mb-1 flex items-baseline justify-between gap-3 border-b-2 border-texto pb-1">
                <span className="estrecha text-[15px] font-bold uppercase tracking-[0.02em]">{g.grupo}</span>
                <span className="hidden text-[12px] text-suave sm:inline">{g.ayuda}</span>
              </h3>
              {g.claves.map(([k]) => (
                <div key={k} className={fila}>
                  <span className="self-center pr-2 text-[13px] leading-tight">{etiqueta(k)[1]}</span>
                  {PLAZOS.map(([v, t]) => {
                    const c = m[v]?.[k], r = ref[v]?.[k], clave = `${v}|${k}`, fmt = etiqueta(k)[2]
                    if (c == null) return <span key={v} className="rayado grid min-h-11 place-items-center text-[11px] text-suave">{m[v] ? '—' : 'sin historia común'}</span>
                    return (
                      <button key={v} onClick={() => elegir(clave)} aria-pressed={sel === clave}
                        aria-label={`${etiqueta(k)[1]}, ${t}: cartera ${fmt(c)}${r == null ? '' : `, referencia ${fmt(r)}`}`}
                        className={`flex min-h-11 flex-col items-end justify-center px-1.5 py-1 text-right sm:flex-row sm:items-baseline sm:justify-between sm:px-2 ${fondoCelda(frente(k, c, r))} ${sel === clave ? 'outline-2 -outline-offset-2 outline-texto' : 'hover:outline-2 hover:-outline-offset-2 hover:outline-gris'}`}>
                        <span className="estrecha text-[13px] font-bold whitespace-nowrap sm:text-[17px]">{fmt(c)}</span>
                        {r != null && <span className="text-[11px] whitespace-nowrap text-suave">ref. {fmt(r)}</span>}
                      </button>
                    )
                  })}
                </div>
              ))}
            </section>
          ))}
          <div className={`${fila} mt-2 border-t border-borde pt-1.5 text-[12px] text-suave`}>
            <span>Mejor · peor que la ref.</span>
            {totales.map((t, i) => <span key={i} className="text-center tabular">{t.hay ? <><span className="text-acento">{t.mejor}</span> · <span className="text-baja">{t.peor}</span></> : '—'}</span>)}
          </div>
          <p className="mt-3 text-[12px] text-suave">Cartera simulada con su rebalanceo desde el {fecha(calc.desde)} hasta el {fecha(calc.hasta)}; la referencia es la elegida en la cabecera (por defecto, la de cada fondo combinada con sus pesos).</p>
        </div>
        <Detalle refPanel={panel} clave={sel} calc={calc} fondos={fondos} />
      </div>
    </div>
  )
}

function Detalle({ refPanel, clave, calc, fondos }: { refPanel: React.RefObject<HTMLElement | null>; clave: string; calc: CalculoCartera; fondos: FondoMapa[] }) {
  const [v, k] = clave.split('|'), c = calc.metricas[v]?.[k]
  if (c == null) return null
  const [, nombre, fmt] = etiqueta(k), r = calc.referencia?.[v]?.[k], f = frente(k, c, r), inv = MENOS.has(k), neutra = NEUTRAS.has(k)
  const total = fondos.reduce((s, x) => s + x.peso, 0) || 1
  const deFondos = fondos.map((x, i) => ({ ...x, n: i + 1, v: x.metricas?.get(clave) })).filter((x): x is FondoMapa & { n: number; v: number } => x.v != null)
  const todos = [c, ...(r == null ? [] : [r]), ...deFondos.map((x) => x.v)]
  let lo = Math.min(...todos), hi = Math.max(...todos)
  const pad = (hi - lo) * 0.05 || Math.abs(hi) * 0.05 || 1; lo -= pad; hi += pad
  const pos = (x: number) => { const t = (x - lo) / (hi - lo); return `${((inv ? 1 - t : t) * 100).toFixed(2)}%` }
  // fondos casi en el mismo sitio: se escalonan hacia arriba para que se lean (como mucho dos pisos; la lista de abajo da las cifras)
  const nivel = new Map<number, number>()
  let ult: number | null = null, n = 0
  for (const x of [...deFondos].sort((a, b) => a.v - b.v)) { n = ult != null && Math.abs(x.v - ult) / (hi - lo) < 0.05 ? Math.min(n + 1, 2) : 0; nivel.set(x.n, n); ult = x.v }
  const orden = [...deFondos].sort((a, b) => (inv ? a.v - b.v : b.v - a.v))
  return (
    <aside ref={refPanel} aria-live="polite" className="order-first border border-borde bg-panel p-4 lg:sticky lg:top-[calc(var(--alto-cabecera,48px)+1rem)] lg:order-none">
      <p className="text-[12px] text-suave">{PLAZOS.find(([x]) => x === v)?.[1]}</p>
      <h3 className="estrecha text-[17px] font-bold uppercase tracking-[0.02em]">{nombre}</h3>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
        <span className="cifra text-[40px] leading-none font-extrabold">{fmt(c)}</span>
        <span className={`font-semibold ${f == null ? 'text-suave' : f > 0 ? 'text-acento' : f < 0 ? 'text-baja' : 'text-suave'}`}>
          {r == null ? 'sin referencia' : `${f == null ? 'frente a' : f > 0 ? 'mejor que' : f < 0 ? 'peor que' : 'parecida a'} la referencia (${fmt(r)})`}
        </span>
      </div>
      <div aria-hidden="true" className="relative mx-1.5 mt-8 h-14">
        <span className="absolute inset-x-0 top-[38px] h-0.5 bg-borde" />
        {deFondos.map((x) => (
          <span key={x.isin}>
            <span className="absolute top-[18px] h-5 w-px bg-gris" style={{ left: pos(x.v) }} />
            <span className="absolute -ml-[9px] grid h-[18px] w-[18px] place-items-center rounded-full border-[1.5px] border-gris bg-panel text-[10px] font-bold text-suave" style={{ left: pos(x.v), top: -nivel.get(x.n)! * 14 }}>{x.n}</span>
          </span>
        ))}
        {r != null && <span className="absolute top-[26px] -ml-px h-[26px] w-0.5 bg-texto" style={{ left: pos(r) }} />}
        <span className="absolute top-[31px] -ml-2 h-4 w-4 rounded-full bg-acento shadow-[0_0_0_2px_var(--color-panel)]" style={{ left: pos(c) }} />
      </div>
      <div className="flex justify-between gap-2 text-[11px] text-suave">
        <span>{neutra ? 'menos' : 'peor'}</span><span>● cartera · ┃ referencia · números: sus fondos</span><span>{neutra ? 'más' : 'mejor'}</span>
      </div>
      <ol className="mt-3 text-[13px]">
        {orden.map((x) => (
          <li key={x.isin} className="grid grid-cols-[1.4rem_minmax(0,1fr)_auto_auto] items-baseline gap-2 border-t border-borde/60 py-1">
            <span className="grid h-[18px] w-[18px] place-items-center rounded-full border-[1.5px] border-gris text-[10px] font-bold text-suave">{x.n}</span>
            <a href={`#/fondo/${x.isin}`} className="truncate hover:text-acento">{x.nombre}</a>
            <span className="text-[12px] text-suave tabular">{Math.round((x.peso / total) * 100)} %</span>
            <span className="text-right font-semibold tabular">{fmt(x.v)}</span>
          </li>
        ))}
      </ol>
      {orden.length > 1 && !neutra && (
        <p className="mt-3 text-[13px]">
          El fondo que mejor sale es {corto(orden[0].nombre)} ({fmt(orden[0].v)}); el que peor, {corto(orden.at(-1)!.nombre)} ({fmt(orden.at(-1)!.v)}).
          {deFondos.length < fondos.length && ' Los fondos sin historia a este plazo no salen.'}
        </p>
      )}
    </aside>
  )
}
