import { useEffect, useState } from 'react'
import { calcularCartera } from '../calculo/cartera'
import { cifra, fecha, hoy, pct } from '../calculo/formato'
import { tintas } from '../calculo/jornada'
import { rendimientos, simularCartera } from '../calculo/metricas'
import { haceAnos, muestra, variacion } from '../calculo/series'
import type { Tarea } from '../calculo/vigilancia'
import { evolucion, type NotaSemanal, type Senal } from '../calculo/senales'
import type { Estado } from '../App'
import Mini from '../componentes/Mini'
import { exposicion, type Fila } from '../calculo/exposicion'
import { cartera as leerCartera, categoriasReferencia, crearCartera, carteras as leerCarteras, notasDe, referenciaSeries, refCartera, seguidos, type Cartera, fondosEnCarteras, datosNovedades, seguimiento, umbrales } from '../datos/consultas'
import { serieEur } from '../datos/series'
import { novedades, umbralesNovedades, type Novedad } from '../calculo/novedades'
import ListaNovedades from '../componentes/ListaNovedades'
import { cargarFondo } from './Cartera'
import Fallo from '../componentes/Fallo'

type ResumenCartera = {
  año: number | null; linea: number[]
  r1?: number; r3?: number; r5?: number; vol3?: number; caida3?: number; sharpe3?: number
  vsRef3: number | null // rentabilidad anual a 3 años menos la de la referencia combinada
  gastos: number | null // TER ponderado, en %
  fondos: { isin: string; nombre: string; objetivo: number; hoy: number | null }[] // pesos en tanto por uno
  activos: Fila[]; cobertura: number // tipo de activo (X-Ray, %) y % de la cartera con composición
}
/** Fondos de una cartera con señales de revisión, por ISIN. */
type Senales = Map<string, Senal[]>
type Seguido = { isin: string; nombre: string; categoria: string | null; myinvestor: boolean; nota: number; semana: number | null; nuevo: boolean; divisa: string | null }

type Comun = { cats: Awaited<ReturnType<typeof categoriasReferencia>>; rf: Map<string, number> }

/** La cartera simulada con su rebalanceo, calculada como en su pantalla (mismas referencias, €STR y bandas), más la línea
 *  del último año y el reparto de hoy. */
async function resumen(c: Cartera, { cats, rf }: Comun): Promise<ResumenCartera | null> {
  const d = await leerCartera(c.id)
  const lineas = d?.fondos.filter((l) => l.peso > 0) ?? []
  if (!lineas.length) return null
  const fs = await Promise.all(lineas.map(async (l) => {
    const x = await cargarFondo(l.fondo, cats)
    return { isin: l.fondo.isin, peso: l.peso, ...x, vol3: x.metricas.get('3a|volatilidad') ?? null }
  }))
  const bandas = { banda: c.banda || 5, tipo: c.banda_tipo, revision: c.revision }
  const sim = simularCartera(fs, c.rebalanceo, bandas).valor
  const calc = calcularCartera(fs, c.rebalanceo, rf, hoy(), bandas, await refCartera(c))
  const m = calc?.metricas
  if (!calc || !m || !sim.length) return null
  const total = lineas.reduce((t, l) => t + l.peso, 0)
  const ultimo = sim.at(-1)!.fecha
  const r3 = m['3a']?.rentabilidad, ref3 = calc.referencia?.['3a']?.rentabilidad
  return {
    año: variacion(sim, `${+ultimo.slice(0, 4) - 1}-12-31`),
    r1: m['1a']?.rentabilidad, r3, r5: m['5a']?.rentabilidad, vol3: m['3a']?.volatilidad, caida3: m['3a']?.max_caida, sharpe3: m['3a']?.sharpe,
    vsRef3: r3 != null && ref3 != null ? r3 - ref3 : null,
    gastos: lineas.every((l) => l.fondo.ter != null) ? lineas.reduce((t, l) => t + (l.peso * Number(l.fondo.ter)) / total, 0) : null,
    linea: muestra(sim, haceAnos(ultimo, 1)),
    ...(({ activos, cobertura }) => ({ activos, cobertura }))(exposicion(lineas.map((l, k) => ({ peso: l.peso, nombre: l.fondo.nombre, c: fs[k].comp })))),
    fondos: lineas.map((l, k) => ({ isin: l.fondo.isin, nombre: l.fondo.nombre, objetivo: l.peso / total, hoy: calc.fondos[k]?.pesoHoy ?? null })),
  }
}

/** En seguimiento, lo que merece mirarse: la nota 2 puntos arriba o abajo en la semana (los nuevos van detrás, marcados). */
const seMueve = (f: Seguido) => Math.abs(Math.round(f.semana ?? 0)) >= 2 // redondeada, como se ve
const tono = (v?: number | null) => (v == null ? 'text-suave' : v >= 0 ? 'text-sube' : 'text-baja')
const Seccion = ({ titulo, extra, children, className = '' }: { titulo: string; extra?: React.ReactNode; children: React.ReactNode; className?: string }) => (
  <section className={className}>
    <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b-2 border-texto pb-1">
      <h2 className="estrecha text-[22px] font-extrabold uppercase leading-tight">{titulo}</h2>{extra}
    </div>
    {children}
  </section>
)
const LeerFallo = ({ e }: { e: Error }) => <Fallo>No se ha podido leer: {e.message}</Fallo>

/** Inicio: el tablero de las carteras modelo (una fila por cartera) y el seguimiento; los índices van en la cinta de arriba
 *  (componentes/Cinta, que pone App). Descargas y revisión llegan de App, que las lee una vez para la barra de estado. */
export default function Inicio({ estado: { descargas, revision, error: errorEstado } }: { estado: Estado }) {
  // Cada sección: null mientras carga, Error si falla su lectura (lo dice ella misma, no se queda «cargando»).
  const [carteras, setCarteras] = useState<Cartera[] | Error | null>(null)
  const [resumenes, setResumenes] = useState<Map<number, ResumenCartera | null | Error>>(new Map())
  const [seg, setSeg] = useState<Seguido[] | Error | null>(null)
  const [nov, setNov] = useState<{ lista: Novedad[]; enCarteras: Map<string, { id: number }[]>; dias: number } | Error | null>(null)
  const [error, setError] = useState('')
  const falla = (e: Error) => setError(e.message)

  useEffect(() => {
    Promise.all([leerCarteras(), categoriasReferencia(), referenciaSeries(['indice:estr'])]).then(([cs, cats, estr]) => {
      setCarteras(cs)
      const comun = { cats, rf: rendimientos(estr.get('indice:estr')?.semanal ?? new Map()) }
      for (const c of cs) resumen(c, comun).catch((e: Error) => e).then((r) => setResumenes((m) => new Map(m).set(c.id, r)))
    }).catch(setCarteras)
    seguidos().then(async (fs) => {
      const porIsin = new Map<string, NotaSemanal[]>()
      for (const n of await notasDe(fs.map((f) => f.isin))) porIsin.set(n.isin, [...(porIsin.get(n.isin) ?? []), n])
      const semana = Date.now() - 7 * 864e5
      setSeg(fs.flatMap((f) => {
        const notas = porIsin.get(f.isin) ?? []
        const e = evolucion(notas)
        return e ? [{ isin: f.isin, nombre: f.fondo.nombre, categoria: f.fondo.categoria, myinvestor: f.myinvestor, nota: e.nota, semana: e.semana, nuevo: Date.parse(f.alta) >= semana, divisa: f.fondo.divisa }] : []
      }).sort((a, b) => Number(seMueve(b)) - Number(seMueve(a)) || Number(b.nuevo) - Number(a.nuevo) || Math.abs(b.semana ?? 0) - Math.abs(a.semana ?? 0) || b.nota - a.nota))
    }).catch(setSeg)
    // Novedades de los fondos de tus carteras y de seguimiento (cambios de gestor de los últimos días, flujos y patrimonio).
    Promise.all([fondosEnCarteras(), seguimiento(), umbrales()]).then(async ([enCarteras, segs, us]) => {
      const u = umbralesNovedades(us)
      const isins = [...new Set([...enCarteras.keys(), ...segs.map((x) => x.isin)])]
      const desde = new Date(Date.now() - u.novedad_dias * 864e5).toISOString().slice(0, 10)
      setNov({ lista: novedades(await datosNovedades(isins, desde), u), enCarteras, dias: u.novedad_dias })
    }).catch(setNov)
  }, [])

  const senalesDe = (id: number): Senales | undefined => revision
    ? new Map(revision.carteras.find((x) => x.cartera.id === id)?.fondos.filter((f) => f.senales.length).map((f) => [f.fondo.isin, f.senales]) ?? [])
    : undefined
  const nueva = () => crearCartera({ nombre: 'Cartera nueva', objetivo: null, rebalanceo: 'anual', banda: 5, banda_tipo: 'puntos', revision: 'diaria', referencia: null }).then((id) => (location.hash = `#/cartera/${id}`)).catch(falla)

  return (
    <div className="space-y-10">
      <h1 className="sr-only">Inicio</h1>
      {errorEstado && <p className="text-baja">No se ha podido leer el estado (descargas, base o revisión): {errorEstado}</p>}
      {error && <p className="text-baja">No se ha podido crear la cartera: {error}</p>}
      {descargas && <AlarmasDescargas tareas={descargas} />}

      <Seccion titulo={Array.isArray(carteras) && carteras.length === 1 ? 'Cartera modelo' : 'Carteras modelo'} extra={<button onClick={nueva} className="-my-1 py-1 text-suave hover:text-acento">+ nueva cartera</button>}>
        {!carteras ? <p className="py-3 text-suave">Cargando…</p>
          : carteras instanceof Error ? <LeerFallo e={carteras} />
          : !carteras.length ? <p className="py-3 text-suave">Aún no hay ninguna cartera modelo: «+ nueva cartera» crea una.</p>
          : <TablaCarteras carteras={carteras} resumenes={resumenes} senalesDe={senalesDe} />}
      </Seccion>

      <Novedades nov={nov} carteras={Array.isArray(carteras) ? carteras : []} />
      <ListaSeguimiento seg={seg} />
      <p className="text-[12px] text-suave">Índices de la cinta: con su fondo indexado en euros. «Año»: desde el 31 de diciembre; la línea, el último año.</p>
    </div>
  )
}

const puntos = (v: number | null) => (v == null ? '—' : `${v > 0 ? '+' : ''}${cifra(v * 100, 1)} pts`)
const colorLinea = (l: number[]) => (l.length > 1 && l.at(-1)! < l[0] ? 'baja' : 'acento')
const nFondos = (n: number) => `${n} ${n === 1 ? 'fondo' : 'fondos'}`

type Aviso = { k: string; href: string; texto: string; title: string }
/** Lo que pide atención en una cartera: fondos con señales de revisión o fuera de la banda de rebalanceo (el detalle, en la cartera). */
function avisosDe(c: Cartera, r: ResumenCartera, senales: Senales): Aviso[] {
  return r.fondos.flatMap((f) => {
    const deriva = f.hoy == null ? 0 : (f.hoy - f.objetivo) * 100
    const s = senales.get(f.isin)
    return [
      ...(s ? [{ k: `s${f.isin}`, href: '#/revision', texto: `${f.nombre}: ${s.map((x) => x.tipo.toLowerCase()).join(', ')}`, title: s.map((x) => x.motivo).join(' · ') }] : []),
      ...(Math.abs(deriva) >= c.banda ? [{ k: `b${f.isin}`, href: `#/cartera/${c.id}`, texto: `${f.nombre} se sale de la banda: ${pct(f.objetivo, 0, false)} → ${pct(f.hoy, 1, false)}`, title: '' }] : []),
    ]
  })
}
/** Avisos de una cartera en una línea: cuántos y el primero; si la revisión aún no ha llegado, nada. */
function Avisos({ c, r, senales }: { c: Cartera; r: ResumenCartera; senales?: Senales }) {
  if (senales === undefined) return <span className="text-suave">…</span>
  const avisos = avisosDe(c, r, senales)
  if (!avisos.length) return <span className="text-suave"><span className="text-sube" aria-hidden="true">● </span>sin avisos</span>
  return (
    <span className="block max-w-56">
      <a href={avisos[0].href} title={avisos.map((a) => a.texto).join('\n')} className="text-aviso hover:underline">▲ {avisos.length} a revisar</a>
      <span className="block truncate text-[12px] text-suave">{avisos[0].texto}</span>
    </span>
  )
}

/** Tipo de activo en una barra partida, en tonos neutros: la tinta de la cartera ya usa los colores de las series. */
const TONO_ACTIVO: Record<string, string> = { Acciones: 'var(--color-texto)', Bonos: 'var(--color-gris)' }
const CORTO: Record<string, string> = { Acciones: 'Acc.', Liquidez: 'Liq.' }
function BarraActivos({ activos, cobertura, className = 'w-40' }: { activos: Fila[]; cobertura: number; className?: string }) {
  const pos = activos.filter(([, v]) => v > 0.5)
  if (!pos.length) return <span className="text-[12px] text-suave">Sin composición todavía</span>
  return (
    <div className={className}>
      <div role="img" aria-label={`Tipo de activo: ${pos.map(([n, v]) => `${n} ${Math.round(v)} %`).join(', ')}`} className="flex h-2.5 gap-0.5">
        {pos.map(([n, v]) => <span key={n} className="min-w-0.5" style={{ flex: v, background: TONO_ACTIVO[n] ?? 'color-mix(in srgb, var(--color-gris) 45%, var(--color-fondo))' }} />)}
      </div>
      <p className="mt-1 text-[12px] whitespace-normal text-suave">{pos.map(([n, v]) => `${CORTO[n] ?? n} ${Math.round(v)}`).join(' · ')}{cobertura < 99 ? ` · X-Ray del ${Math.round(cobertura)} %` : ''}</p>
    </div>
  )
}

const Nombre = ({ c, tinta }: { c: Cartera; tinta?: string }) => (
  <span className="flex items-center gap-2">
    <i aria-hidden="true" className="inline-block h-3 w-3 shrink-0" style={{ background: tinta }} />
    <a href={`#/cartera/${c.id}`} className="estrecha text-[17px] font-bold uppercase leading-tight tracking-[0.02em] hover:text-acento">{c.nombre}</a>
  </span>
)

/** Las carteras modelo en una tabla, una fila por cartera con su tinta; en el móvil, un bloque por cartera con lo esencial.
 *  Cada fila se calcula por su cuenta: mientras tanto, o si falla, lo dice esa fila. */
function TablaCarteras({ carteras, resumenes, senalesDe }: { carteras: Cartera[]; resumenes: Map<number, ResumenCartera | null | Error>; senalesDe: (id: number) => Senales | undefined }) {
  const tinta = tintas(carteras.map((c) => c.id))
  const estado = (c: Cartera) => {
    const r = resumenes.get(c.id)
    return !resumenes.has(c.id) ? 'calculando…' : r instanceof Error ? <LeerFallo e={r} /> : !r ? <>Sin fondos o sin datos suficientes. <a href={`#/cartera/${c.id}`} className="text-acento hover:underline">Añadir fondos ›</a></> : null
  }
  const th = 'rotulo px-2.5 pt-2 pb-1.5 align-bottom whitespace-nowrap', thn = `${th} text-right`
  return (
    <>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-borde">
              <th scope="col" className={`${th} pl-1 text-left`}>Cartera</th>
              <th scope="col" className={thn}>En el año</th>
              <th scope="col" className={thn}>1 año</th>
              <th scope="col" className={thn}>3 años</th>
              <th scope="col" className={thn}>5 años</th>
              <th scope="col" className={thn}>vs ref.</th>
              <th scope="col" className={thn}>Volat.</th>
              <th scope="col" className={thn}>Caída máx.</th>
              <th scope="col" className={`${thn} max-[1180px]:hidden`}>Sharpe</th>
              <th scope="col" className={`${thn} max-[1180px]:hidden`}>Gastos</th>
              <th scope="col" className={`${th} text-left`}>Último año</th>
              <th scope="col" className={`${th} hidden text-left min-[1500px]:table-cell`}>Tipo de activo</th>
              <th scope="col" className={`${th} text-left`}>Avisos</th>
            </tr>
          </thead>
          <tbody>
            {carteras.map((c) => {
              const r = resumenes.get(c.id), falta = estado(c)
              const td = 'px-2.5 py-3.5 text-right whitespace-nowrap tabular'
              return (
                <tr key={c.id} className="border-b border-borde hover:bg-borde/25">
                  <td className="py-3.5 pr-2.5 pl-1">
                    <Nombre c={c} tinta={tinta.get(c.id)} />
                    <p className="mt-0.5 pl-5 text-[12px] whitespace-nowrap text-suave">{`${c.rebalanceo[0].toUpperCase()}${c.rebalanceo.slice(1)}`} · banda {c.banda} pts{r && !(r instanceof Error) ? ` · ${nFondos(r.fondos.length)}` : ''}</p>
                  </td>
                  {falta || !r || r instanceof Error ? <td colSpan={12} className="px-2.5 py-3.5 text-suave">{falta}</td> : (<>
                    <td className={td}><span className={`cifra text-[28px] leading-none font-extrabold ${tono(r.año)}`}>{pct(r.año)}</span></td>
                    <td className={`${td} ${tono(r.r1)}`}>{pct(r.r1)}</td>
                    <td className={`${td} ${tono(r.r3)}`}>{pct(r.r3)}</td>
                    <td className={`${td} ${tono(r.r5)}`}>{pct(r.r5)}</td>
                    <td className={`${td} ${tono(r.vsRef3)}`}>{puntos(r.vsRef3)}</td>
                    <td className={td}>{pct(r.vol3, 1, false)}</td>
                    <td className={`${td} text-baja`}>{pct(r.caida3)}</td>
                    <td className={`${td} max-[1180px]:hidden`}>{cifra(r.sharpe3)}</td>
                    <td className={`${td} max-[1180px]:hidden`}>{r.gastos == null ? '—' : `${cifra(r.gastos)} %`}</td>
                    <td className="px-2.5 py-3.5"><Mini valores={r.linea} color={tinta.get(c.id)} className="h-8.5 w-32" /></td>
                    <td className="hidden px-2.5 py-3.5 min-[1500px]:table-cell"><BarraActivos activos={r.activos} cobertura={r.cobertura} /></td>
                    <td className="px-2.5 py-3.5 text-[13px]"><Avisos c={c} r={r} senales={senalesDe(c.id)} /></td>
                  </>)}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-col gap-3 sm:hidden">
        {carteras.map((c) => {
          const r = resumenes.get(c.id), falta = estado(c)
          return (
            <article key={c.id} className="flex flex-col gap-3 rounded-lg border border-borde bg-panel p-4">
              <Nombre c={c} tinta={tinta.get(c.id)} />
              {falta || !r || r instanceof Error ? <div className="text-suave">{falta}</div> : (<>
                <div><span className={`cifra text-[44px] leading-none font-extrabold tabular ${tono(r.año)}`}>{pct(r.año)}</span><span className="ml-2 text-suave">en el año</span></div>
                <Mini valores={r.linea} color={tinta.get(c.id)} area className="h-14 w-full" />
                <dl className="grid grid-cols-3 gap-x-3 gap-y-1">
                  {([['1 año', pct(r.r1), tono(r.r1)], ['3 años', pct(r.r3), tono(r.r3)], ['5 años', pct(r.r5), tono(r.r5)],
                    ['vs ref.', puntos(r.vsRef3), tono(r.vsRef3)], ['Volat.', pct(r.vol3, 1, false), ''], ['Caída máx.', pct(r.caida3), 'text-baja']] as const).map(([et, v, cls]) => (
                    <div key={et}><dt className="text-[12px] text-suave">{et}</dt><dd className={`tabular ${cls}`}>{v}</dd></div>
                  ))}
                </dl>
                <BarraActivos activos={r.activos} cobertura={r.cobertura} className="w-full" />
                <div className="text-[13px]"><Avisos c={c} r={r} senales={senalesDe(c.id)} /></div>
                <a href={`#/cartera/${c.id}`} className="text-[13px] text-suave hover:text-acento">{nFondos(r.fondos.length)} · ver cartera ›</a>
              </>)}
            </article>
          )
        })}
      </div>
      <p className="mt-2 text-[12px] text-suave">Rentabilidades a 3 y 5 años, anuales. Volatilidad, caída máxima y Sharpe, a 3 años. «vs ref.»: rentabilidad anual a 3 años menos la de su referencia. «Gastos»: TER ponderado. La línea, el último año simulado con su rebalanceo.</p>
    </>
  )
}

/** Seis fondos del seguimiento: primero los que se mueven (±2 puntos de nota en la semana), después los nuevos y los de mejor nota. */
function ListaSeguimiento({ seg: dato }: { seg: Seguido[] | Error | null }) {
  const seg = dato instanceof Error ? null : dato
  const vistos = (seg ?? []).slice(0, 6)
  // Valor del último año, solo de los fondos que se ven. La línea es accesoria: si una serie falla, ese fondo va sin ella.
  const [lineas, setLineas] = useState<Map<string, number[]>>(new Map())
  useEffect(() => {
    for (const f of vistos) serieEur(f.isin, f.divisa).then((s) => s.length && setLineas((m) => new Map(m).set(f.isin, muestra(s, haceAnos(s.at(-1)!.fecha, 1))))).catch(() => {})
  }, [vistos.map((f) => f.isin).join()]) // eslint-disable-line react-hooks/exhaustive-deps
  const nMueven = (seg ?? []).filter(seMueve).length
  return (
    <Seccion titulo="Seguimiento" extra={<a href="#/seguimiento" className="-my-1 py-1 text-suave hover:text-acento">{seg?.length ? `ver los ${seg.length}` : 'ver lista'}</a>}>
      {dato instanceof Error ? <LeerFallo e={dato} /> : !seg ? <p className="text-suave">Cargando…</p> : !seg.length ? <p className="text-suave">No sigues ningún fondo. Desde el screener o una ficha, «s» lo añade.</p>
        : (<>
        <p className="mb-1 text-[12px] text-suave">{nMueven ? `${nMueven === 1 ? 'Uno se mueve' : `${nMueven} se mueven`} esta semana (±2 puntos de nota); después, los nuevos y los de mejor nota.` : 'Ninguno se mueve esta semana (±2 puntos de nota): primero los nuevos, después los de mejor nota.'} La línea es su valor en el último año.</p>
        <ul className="grid gap-x-10 lg:grid-cols-2">
          {vistos.map((f) => (
            <li key={f.isin}>
              <a href={`#/fondo/${f.isin}`} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-borde py-2 hover:text-acento">
                <span className="min-w-0">
                  <span className="block truncate">{f.nombre}</span>
                  <span className="block truncate text-[12px] text-suave">
                    {f.categoria ?? 'Sin categoría'}{f.nuevo && <> · <span className="text-acento">nuevo</span></>}{f.myinvestor ? ' · MyInvestor' : ''}
                  </span>
                </span>
                <Mini valores={lineas.get(f.isin) ?? []} color={colorLinea(lineas.get(f.isin) ?? [])} className="h-6 w-16" />
                <span className="w-14 text-right">
                  <span className="cifra block text-2xl leading-none tabular text-texto">{Math.round(f.nota)}</span>
                  <span className={`block text-[12px] tabular ${seMueve(f) ? `font-medium ${tono(f.semana)}` : 'text-suave'}`}>
                    {f.semana == null ? '—' : `${Math.round(f.semana) > 0 ? '+' : ''}${Math.round(f.semana)}`}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </>)}
    </Seccion>
  )
}

const hora = (ts: string) => `${fecha(ts)} ${new Date(ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`

/** En rojo, las alarmas y las tareas que no han pasado cuando tocaba (si todo va bien, solo lo dice la barra de estado). */
function AlarmasDescargas({ tareas }: { tareas: Tarea[] }) {
  const mal = tareas.filter((t) => t.alarmas.length || t.atrasada)
  if (!mal.length) return null
  return (
    <section role="alert" className="rounded-lg border border-baja/60 p-3">
      <h2 className="mb-1 rotulo text-baja!">Alarmas de las descargas</h2>
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

const FILTROS = [['todas', 'Todas'], ['gestor', 'Gestor'], ['flujos', 'Flujos'], ['patrimonio', 'Patrimonio']] as const
/** Novedades de tus fondos sin entrar en cada ficha: cambios de gestor recientes y movimientos fuertes de su patrimonio. */
function Novedades({ nov, carteras }: { nov: { lista: Novedad[]; enCarteras: Map<string, { id: number }[]>; dias: number } | Error | null; carteras: Cartera[] }) {
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number][0]>('todas')
  const tinta = tintas(carteras.map((c) => c.id))
  const lista = nov && !(nov instanceof Error) ? nov.lista.filter((n) => filtro === 'todas' || (filtro === 'flujos' ? n.tipo === 'salidas' || n.tipo === 'entradas' : n.tipo === filtro)) : []
  return (
    <Seccion titulo="Novedades de tus fondos" extra={
      <div role="group" aria-label="Qué novedades ver" className="flex gap-0.5 rounded-sm bg-borde/50 p-0.5 text-[12px]">
        {FILTROS.map(([k, t]) => (
          <button key={k} onClick={() => setFiltro(k)} aria-pressed={filtro === k}
            className={`rounded-sm px-2.5 py-1 ${filtro === k ? 'bg-panel text-texto ring-1 ring-borde' : 'text-suave hover:text-texto'}`}>{t}</button>
        ))}
      </div>
    }>
      {!nov ? <p className="py-2 text-suave">Cargando…</p> : nov instanceof Error ? <LeerFallo e={nov} /> : (<>
        <p className="mb-1 text-[12px] text-suave">De los fondos de tus carteras y de seguimiento: cambios de gestor de los últimos {nov.dias} días y flujos o patrimonio fuera de los umbrales (se ajustan en Revisión). El cuadro de color dice en qué cartera está.</p>
        {lista.length
          ? <ListaNovedades lista={lista} conFondo tintas={new Map([...nov.enCarteras].map(([i, cs]) => [i, cs.map((c) => tinta.get(c.id)).filter((t): t is string => !!t)]))}
              enlace={(n) => <a href={`#/fondo/${n.isin}`} className="text-acento hover:underline">ver ficha ›</a>} />
          : <p className="py-2 text-[13px] text-suave">{nov.lista.length ? 'Ninguna novedad de este tipo.' : `Nada nuevo en tus fondos: ningún cambio de gestor en ${nov.dias} días ni movimiento fuerte de patrimonio.`}</p>}
      </>)}
    </Seccion>
  )
}
