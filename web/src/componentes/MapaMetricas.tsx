import { useRef, useState } from 'react'
import { colorPercentil, fondoPercentil } from '../calculo/formato'
import type { Distribucion, Metrica } from '../datos/consultas'
import { FILAS, GRUPOS } from '../pantallas/Ficha'

const PLAZOS = [['1a', '1 año'], ['3a', '3 años'], ['5a', '5 años'], ['10a', '10 años']] as const
// Como en nucleo/metricas.py: dónde menos es mejor (la escala se da la vuelta) y qué no tiene mejor ni peor.
const MENOS = new Set(['volatilidad', 'volatilidad_mensual', 'tracking_error', 'captura_bajista'])
const NEUTRAS = new Set(['beta', 'acumulada', 'r2'])
const fondoCelda = (p: number | null) => (p == null ? 'bg-panel ring-1 ring-inset ring-borde' : fondoPercentil(p))
const tonoP = colorPercentil
const etiqueta = (nombre: string) => FILAS.find(([k]) => k === nombre)!

/** Pestaña Métricas de la ficha: un mapa métrica × plazo con la cifra y el percentil en la categoría (el color dice el
 *  cuartil) y, al lado, el detalle de la celda elegida frente a cómo se reparte su categoría. */
export default function MapaMetricas({ m, dist }: { m: Map<string, Metrica>; dist: Distribucion | null }) {
  const filas = GRUPOS.map(([grupo, ayuda, claves]) => ({ grupo, ayuda, claves: claves.filter(([k]) => PLAZOS.some(([v]) => m.has(`${v}|${k}`))) }))
    .filter((g) => g.claves.length)
  const [sel, setSel] = useState(m.has('3a|rentabilidad') ? '3a|rentabilidad' : [...m.keys()].find((k) => PLAZOS.some(([v]) => k.startsWith(`${v}|`))) ?? '')
  const panel = useRef<HTMLElement>(null)
  const elegir = (k: string) => {
    setSel(k)
    if (matchMedia('(max-width: 1023px)').matches) panel.current?.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }
  if (!filas.length) return <p className="text-suave">Aún no hay métricas de este fondo: hacen falta al menos 1 año de valores.</p>
  const totales = PLAZOS.map(([v]) => {
    const ps = filas.flatMap((g) => g.claves.map(([k]) => m.get(`${v}|${k}`)?.percentil)).filter((p): p is number => p != null)
    return { alta: ps.filter((p) => p >= 75).length, baja: ps.filter((p) => p < 25).length }
  })
  const fila = 'grid grid-cols-[minmax(0,7.5rem)_repeat(4,minmax(0,1fr))] gap-[3px] sm:grid-cols-[13rem_repeat(4,minmax(0,1fr))]'

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex flex-col gap-[3px]">
        {/* La cabecera de los plazos baja con la tabla, justo bajo la cabecera de la web (--alto-cabecera, de App). */}
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
                  const x = m.get(`${v}|${k}`), clave = `${v}|${k}`
                  if (!x) return <span key={v} className="rayado grid min-h-10 place-items-center text-[11px] text-suave">{dist?.has(clave) ? 'sin historia' : '—'}</span>
                  const p = x.percentil == null ? null : Number(x.percentil)
                  return (
                    <button key={v} onClick={() => elegir(clave)} aria-pressed={sel === clave}
                      aria-label={`${etiqueta(k)[1]}, ${t}: ${etiqueta(k)[2](Number(x.valor))}${p == null ? '' : `, percentil ${Math.round(p)}`}`}
                      className={`flex min-h-10 flex-col items-end justify-center px-1.5 py-1 sm:px-2 text-right sm:flex-row sm:items-baseline sm:justify-between ${fondoCelda(p)} ${sel === clave ? 'outline-2 -outline-offset-2 outline-texto' : 'hover:outline-2 hover:-outline-offset-2 hover:outline-gris'}`}>
                      <span className="estrecha text-[13px] font-bold whitespace-nowrap sm:text-[17px]">{etiqueta(k)[2](Number(x.valor))}</span>
                      {p != null && <span className={`text-[11px] tabular ${tonoP(p)}`}>p{Math.round(p)}</span>}
                    </button>
                  )
                })}
              </div>
            ))}
          </section>
        ))}
        <div className={`${fila} mt-2 border-t border-borde pt-1.5 text-[12px] text-suave`}>
          <span>Mejor 25 % · peor 25 %</span>
          {totales.map((t, i) => <span key={i} className="text-center tabular"><span className="text-acento">{t.alta}</span> · <span className="text-baja">{t.baja}</span></span>)}
        </div>
      </div>
      <Detalle refPanel={panel} clave={sel} m={m} dist={dist} />
    </div>
  )
}

function Detalle({ refPanel, clave, m, dist }: { refPanel: React.RefObject<HTMLElement | null>; clave: string; m: Map<string, Metrica>; dist: Distribucion | null }) {
  const x = m.get(clave)
  if (!x) return null
  const [v, k] = clave.split('|'), [, nombre, fmt] = etiqueta(k)
  const ayuda = GRUPOS.flatMap(([, , cs]) => cs).find(([c]) => c === k)?.[1]
  const p = x.percentil == null ? null : Number(x.percentil), valor = Number(x.valor), d = dist?.get(clave)
  return (
    <aside ref={refPanel} aria-live="polite" className="order-first border border-borde bg-panel p-4 lg:sticky lg:top-[calc(var(--alto-cabecera,48px)+1rem)] lg:order-none">
      <p className="text-[12px] text-suave">{PLAZOS.find(([c]) => c === v)?.[1]}</p>
      <h3 className="estrecha text-[17px] font-bold uppercase tracking-[0.02em]">{nombre}</h3>
      {ayuda && <p className="text-[12px] text-suave">{ayuda}</p>}
      <div className="mt-2 flex flex-wrap items-baseline gap-x-3">
        <span className="cifra text-[40px] leading-none font-extrabold">{fmt(valor)}</span>
        <span className={`font-semibold ${tonoP(p)}`}>{p != null ? `mejor que el ${Math.round(p)} % de su categoría` : NEUTRAS.has(k) ? 'sin mejor ni peor' : 'sin percentil'}</span>
      </div>
      {d ? <Tira q={d.cuantiles} v={valor} p={p} inv={MENOS.has(k)} neutra={NEUTRAS.has(k)} /> : null}
      <p className="mt-3 text-[13px]">
        {d ? `En su categoría (${d.n} fondos), la mediana es ${fmt(d.cuantiles[2])} y la mitad central va de ${fmt(d.cuantiles[MENOS.has(k) ? 3 : 1])} a ${fmt(d.cuantiles[MENOS.has(k) ? 1 : 3])}.`
          : 'Sin datos de su categoría para comparar (fondo fuera del universo o sin categoría).'}
      </p>
      {d && <p className="mt-2 text-[12px] text-suave">La caja es la mitad central de su categoría; la raya, 8 de cada 10; la marca, la mediana.</p>}
    </aside>
  )
}

/** El fondo frente a su categoría: a la derecha, mejor (en riesgo la escala va al revés); sin mejor ni peor, de menos a más. */
function Tira({ q, v, p, inv, neutra }: { q: number[]; v: number; p: number | null; inv: boolean; neutra: boolean }) {
  let lo = Math.min(q[0], v), hi = Math.max(q[4], v)
  const pad = (hi - lo) * 0.06 || 1; lo -= pad; hi += pad
  const pos = (x: number) => { const t = (x - lo) / (hi - lo); return (inv ? 1 - t : t) * 100 }
  const tramo = (a: number, b: number) => ({ left: `${Math.min(pos(a), pos(b))}%`, width: `${Math.abs(pos(b) - pos(a))}%` })
  return (
    <>
      <div aria-hidden="true" className="relative mt-4 h-6">
        <span className="absolute top-[11px] h-0.5 bg-gris" style={tramo(q[0], q[4])} />
        <span className="absolute top-[5px] h-3.5 bg-[color-mix(in_srgb,var(--color-gris)_38%,var(--color-panel))]" style={tramo(q[1], q[3])} />
        <span className="absolute top-0.5 -ml-px h-5 w-0.5 bg-texto" style={{ left: `${pos(q[2])}%` }} />
        <span className={`absolute top-[5px] -ml-[7px] h-3.5 w-3.5 rounded-full border-2 border-texto shadow-[0_0_0_2px_var(--color-panel)] ${neutra ? 'bg-panel' : p != null && p >= 75 ? 'bg-acento' : p != null && p < 25 ? 'bg-baja' : 'bg-texto'}`} style={{ left: `${pos(v)}%` }} />
      </div>
      <div className="flex justify-between text-[11px] text-suave"><span>{neutra ? 'menos' : 'peor'}</span><span>{neutra ? 'más' : 'mejor'}</span></div>
    </>
  )
}
