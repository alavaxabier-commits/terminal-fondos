import { useEffect, useState } from 'react'
import { calcularCartera } from '../calculo/cartera'
import { cifra, fecha, hoy, pct } from '../calculo/formato'
import { rendimientos, simularCartera } from '../calculo/metricas'
import { haceAnos, haceDias, muestra, variacion, type Punto } from '../calculo/series'
import type { Tarea } from '../calculo/vigilancia'
import { evolucion, type NotaSemanal, type Senal } from '../calculo/senales'
import type { Estado } from '../App'
import { COLOR_ACTIVO } from '../componentes/Exposicion'
import Mini from '../componentes/Mini'
import { exposicion, type Fila } from '../calculo/exposicion'
import { cartera as leerCartera, categoriasReferencia, crearCartera, carteras as leerCarteras, notasDe, referenciaSeries, seguidos, sustitutos, type Cartera } from '../datos/consultas'
import { serieEur } from '../datos/series'
import { cargarFondo } from './Cartera'

type Periodo = 'semana' | 'mes' | 'año'
const PERIODOS: Periodo[] = ['semana', 'mes', 'año']
/** Desde cuándo se mide cada periodo, a partir del último dato de la serie. */
const desde = (ultimo: string, p: Periodo) => (p === 'semana' ? haceDias(ultimo, 7) : p === 'mes' ? haceDias(ultimo, 30) : `${+ultimo.slice(0, 4) - 1}-12-31`)
const cambios = (s: Punto[]) => Object.fromEntries(PERIODOS.map((p) => [p, s.length ? variacion(s, desde(s.at(-1)!.fecha, p)) : null])) as Record<Periodo, number | null>

type ResumenCartera = {
  año: number | null; semana: number | null; linea: number[]; ultimoRebalanceo: string | null
  r1?: number; r3?: number; r5?: number; vol3?: number; caida3?: number; sharpe3?: number
  vsRef3: number | null // rentabilidad anual a 3 años menos la de la referencia combinada
  gastos: number | null // TER ponderado, en %
  fondos: { isin: string; nombre: string; objetivo: number; hoy: number | null }[] // pesos en tanto por uno
  activos: Fila[]; cobertura: number // tipo de activo (X-Ray, %) y % de la cartera con composición
}
/** Fondos de una cartera con señales de revisión, por ISIN. */
type Senales = Map<string, Senal[]>
type Mercado = { indice: string; isin: string; bolsa: boolean; cambio: Record<Periodo, number | null>; anual: number | null; linea: number[] }
type Seguido = { isin: string; nombre: string; categoria: string | null; estado: string; myinvestor: boolean; nota: number; semana: number | null; nuevo: boolean; divisa: string | null }

type Comun = { cats: Awaited<ReturnType<typeof categoriasReferencia>>; rf: Map<string, number> }

/** La cartera simulada con su rebalanceo, calculada como en su pantalla (mismas referencias, €STR y bandas), más la
 *  variación de la semana, la línea del último año y el reparto de hoy. */
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
  const calc = calcularCartera(fs, c.rebalanceo, rf, hoy(), bandas)
  const m = calc?.metricas
  if (!calc || !m || !sim.length) return null
  const total = lineas.reduce((t, l) => t + l.peso, 0)
  const ultimo = sim.at(-1)!.fecha
  const r3 = m['3a']?.rentabilidad, ref3 = calc.referencia?.['3a']?.rentabilidad
  return {
    año: variacion(sim, desde(ultimo, 'año')), semana: variacion(sim, desde(ultimo, 'semana')),
    r1: m['1a']?.rentabilidad, r3, r5: m['5a']?.rentabilidad, vol3: m['3a']?.volatilidad, caida3: m['3a']?.max_caida, sharpe3: m['3a']?.sharpe,
    vsRef3: r3 != null && ref3 != null ? r3 - ref3 : null,
    gastos: lineas.every((l) => l.fondo.ter != null) ? lineas.reduce((t, l) => t + (l.peso * Number(l.fondo.ter)) / total, 0) : null,
    linea: muestra(sim, haceAnos(ultimo, 1)), ultimoRebalanceo: calc.ultimoRebalanceo,
    ...(({ activos, cobertura }) => ({ activos, cobertura }))(exposicion(lineas.map((l, k) => ({ peso: l.peso, nombre: l.fondo.nombre, c: fs[k].comp })))),
    fondos: lineas.map((l, k) => ({ isin: l.fondo.isin, nombre: l.fondo.nombre, objetivo: l.peso / total, hoy: calc.fondos[k]?.pesoHoy ?? null })),
  }
}

/** En seguimiento, lo que merece mirarse: la nota 2 puntos arriba o abajo en la semana (los nuevos van detrás, marcados). */
const seMueve = (f: Seguido) => Math.abs(Math.round(f.semana ?? 0)) >= 2 // redondeada, como se ve
const tono = (v?: number | null) => (v == null ? 'text-suave' : v >= 0 ? 'text-sube' : 'text-baja')
const Seccion = ({ titulo, extra, children, className = '' }: { titulo: string; extra?: React.ReactNode; children: React.ReactNode; className?: string }) => (
  <section className={className}>
    <div className="mb-3 flex items-baseline justify-between gap-3 border-b border-borde pb-1">
      <h2 className="font-serif text-2xl">{titulo}</h2>{extra}
    </div>
    {children}
  </section>
)
const Fallo = ({ e }: { e: Error }) => <p className="text-baja">No se ha podido leer: {e.message}</p>

/** Inicio: portada con un resumen escrito, carteras, mercados (índices de referencia), fondos a revisar y seguimiento.
 *  Descargas y revisión llegan de App, que las lee una vez para la barra de estado. */
export default function Inicio({ estado: { descargas, revision, error: errorEstado } }: { estado: Estado }) {
  // Cada sección: null mientras carga, Error si falla su lectura (lo dice ella misma, no se queda «cargando»).
  const [carteras, setCarteras] = useState<Cartera[] | Error | null>(null)
  const [resumenes, setResumenes] = useState<Map<number, ResumenCartera | null | Error>>(new Map())
  const [mercados, setMercados] = useState<Mercado[] | Error | null>(null)
  const [seg, setSeg] = useState<Seguido[] | Error | null>(null)
  const [error, setError] = useState('')
  const falla = (e: Error) => setError(e.message)

  useEffect(() => {
    Promise.all([leerCarteras(), categoriasReferencia(), referenciaSeries(['indice:estr'])]).then(([cs, cats, estr]) => {
      setCarteras(cs)
      const comun = { cats, rf: rendimientos(estr.get('indice:estr')?.semanal ?? new Map()) }
      for (const c of cs) resumen(c, comun).catch((e: Error) => e).then((r) => setResumenes((m) => new Map(m).set(c.id, r)))
    }).catch(setCarteras)
    sustitutos().then((is) => Promise.all(is.map(async (i): Promise<Mercado> => {
      const s = await serieEur(i.isin, 'EUR') // los fondos que representan a los índices están todos en euros
      const ultimo = s.at(-1)?.fecha ?? hoy()
      return { indice: i.indice, isin: i.isin, bolsa: /^(MSCI|S&P)/.test(i.indice), cambio: cambios(s), anual: variacion(s, haceAnos(ultimo, 1)), linea: muestra(s, haceAnos(ultimo, 1), 10) }
    }))).then(setMercados).catch(setMercados)
    seguidos().then(async (fs) => {
      const activos = fs.filter((f) => f.estado !== 'descartado')
      const porIsin = new Map<string, NotaSemanal[]>()
      for (const n of await notasDe(activos.map((f) => f.isin))) porIsin.set(n.isin, [...(porIsin.get(n.isin) ?? []), n])
      const semana = Date.now() - 7 * 864e5
      setSeg(activos.flatMap((f) => {
        const notas = porIsin.get(f.isin) ?? []
        const e = evolucion(notas)
        return e ? [{ isin: f.isin, nombre: f.fondo.nombre, categoria: f.fondo.categoria, estado: f.estado, myinvestor: f.myinvestor, nota: e.nota, semana: e.semana, nuevo: Date.parse(f.alta) >= semana, divisa: f.fondo.divisa }] : []
      }).sort((a, b) => Number(seMueve(b)) - Number(seMueve(a)) || Number(b.nuevo) - Number(a.nuevo) || Math.abs(b.semana ?? 0) - Math.abs(a.semana ?? 0) || b.nota - a.nota))
    }).catch(setSeg)
  }, [])

  const senalesDe = (id: number): Senales | undefined => revision
    ? new Map(revision.carteras.find((x) => x.cartera.id === id)?.fondos.filter((f) => f.senales.length).map((f) => [f.fondo.isin, f.senales]) ?? [])
    : undefined
  const nueva = () => crearCartera({ nombre: 'Cartera nueva', objetivo: null, rebalanceo: 'anual', banda: 5, banda_tipo: 'puntos', revision: 'diaria' }).then((id) => (location.hash = `#/cartera/${id}`)).catch(falla)

  return (
    <div className="space-y-10">
      <h1 className="sr-only">Inicio</h1>
      {errorEstado && <p className="text-baja">No se ha podido leer el estado (descargas, base o revisión): {errorEstado}</p>}
      {error && <p className="text-baja">No se ha podido crear la cartera: {error}</p>}
      {descargas && <AlarmasDescargas tareas={descargas} />}

      <Seccion titulo={Array.isArray(carteras) && carteras.length === 1 ? 'Cartera modelo' : 'Carteras modelo'} extra={<button onClick={nueva} className="-my-1 py-1 text-suave hover:text-acento">+ nueva cartera</button>}>
        {!carteras ? <p className="text-suave">Cargando…</p>
          : carteras instanceof Error ? <Fallo e={carteras} />
          : !carteras.length ? <p className="text-suave">Aún no hay ninguna cartera modelo: «+ nueva cartera» crea una.</p>
          : carteras.length === 1 ? <CarteraAncha c={carteras[0]} r={resumenes.get(carteras[0].id)} cargando={!resumenes.has(carteras[0].id)} senales={senalesDe(carteras[0].id)} />
          : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {carteras.map((c) => <TarjetaCartera key={c.id} c={c} r={resumenes.get(c.id)} cargando={!resumenes.has(c.id)} senales={senalesDe(c.id)} />)}
            </ul>
          )}
      </Seccion>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <ListaSeguimiento seg={seg} />
        <Mercados mercados={mercados} />
      </div>
    </div>
  )
}

const puntos = (v: number | null) => (v == null ? '—' : `${v > 0 ? '+' : ''}${cifra(v * 100, 1)} pts`)
/** KPIs de la cartera. `todos`: los 8 de la tarjeta ancha (una sola cartera); si no, 6. Rentabilidades a 3 y 5 años, anuales. */
const Cifras = ({ r, todos = false }: { r: ResumenCartera; todos?: boolean }) => {
  const k: [string, string, string][] = [
    ...(todos ? [['1 año', pct(r.r1), tono(r.r1)], ['3 años', pct(r.r3), tono(r.r3)], ['5 años', pct(r.r5), tono(r.r5)]] as [string, string, string][]
      : [['3 años', pct(r.r3), tono(r.r3)]] as [string, string, string][]),
    ['vs referencia', puntos(r.vsRef3), tono(r.vsRef3)],
    ['Volatilidad', pct(r.vol3, 1, false), ''],
    ['Caída máx.', pct(r.caida3), 'text-baja'],
    ['Sharpe', cifra(r.sharpe3), ''],
    ['Gastos', r.gastos == null ? '—' : `${cifra(r.gastos)} %`, ''],
  ]
  return (
    <div>
      <dl className={`grid gap-x-3 gap-y-2 text-[12px] ${todos ? 'grid-cols-4' : 'grid-cols-3'}`}>
        {k.map(([et, v, cls]) => (
          <div key={et}><dt className="text-suave">{et}</dt><dd className={`tabular text-[13px] ${cls}`}>{v}</dd></div>
        ))}
      </dl>
      {/* Las aclaraciones van a la vista (antes en title, que no se ve en el móvil ni con teclado). */}
      <p className="mt-1 text-[11px] text-suave">
        A 3 años{todos ? ', salvo indicado' : ''}; rentabilidades a 3{todos ? ' y 5' : ''} años, anuales. «vs referencia»: menos la referencia combinada de sus fondos; «Gastos»: TER ponderado.
      </p>
    </div>
  )
}
const PildoraSemana = ({ v }: { v: number | null }) => v == null ? null
  : <span className={`rounded-full px-2 text-[12px] tabular ${tono(v)} ${v >= 0 ? 'bg-sube/10' : 'bg-baja/10'}`}>{pct(v)} semana</span>
const colorLinea = (l: number[]) => (l.length > 1 && l.at(-1)! < l[0] ? 'baja' : 'acento')

/** Con una sola cartera, ocupa todo el ancho: cifras, el último año y el tipo de activo con los avisos de sus fondos. */
function CarteraAncha({ c, r, cargando, senales }: { c: Cartera; r: ResumenCartera | null | Error | undefined; cargando: boolean; senales?: Senales }) {
  if (cargando || !r || r instanceof Error) return <div className="rounded-lg border border-borde bg-panel p-5 text-suave">{r instanceof Error ? <Fallo e={r} /> : cargando ? 'calculando…' : 'Sin fondos o sin datos suficientes.'}</div>
  // Lo que pide atención en el reparto: fondos con señales de revisión o fuera de la banda de rebalanceo (el detalle, en la cartera).
  const avisos = r.fondos.flatMap((f) => {
    const deriva = f.hoy == null ? 0 : (f.hoy - f.objetivo) * 100
    return [
      ...(senales?.get(f.isin) ? [{ k: `s${f.isin}`, href: '#/revision', texto: `${f.nombre}: ${senales.get(f.isin)!.map((x) => x.tipo.toLowerCase()).join(', ')}`, title: senales.get(f.isin)!.map((x) => x.motivo).join(' · ') }] : []),
      ...(Math.abs(deriva) >= c.banda ? [{ k: `b${f.isin}`, href: `#/cartera/${c.id}`, texto: `${f.nombre} se sale de la banda: ${pct(f.objetivo, 0, false)} → ${pct(f.hoy, 1, false)}`, title: '' }] : []),
    ]
  })
  return (
    <div className="grid gap-6 rounded-lg border border-borde bg-panel p-5 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1.1fr)]">
      {/* Solo el nombre es el enlace (el lector de pantalla no lee todas las cifras como su nombre); su ::after cubre la columna. */}
      <div className="relative flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline gap-2"><a href={`#/cartera/${c.id}`} className="font-medium after:absolute after:inset-0 hover:text-acento">{c.nombre}</a><PildoraSemana v={r.semana} /></div>
        <div><span className={`cifra text-6xl tabular ${tono(r.año)}`}>{pct(r.año)}</span><span className="ml-2 text-suave">en el año</span></div>
        <Cifras r={r} todos />
        <p className="mt-auto text-[12px] text-suave">Rebalanceo {c.rebalanceo}{r.ultimoRebalanceo ? `, el último el ${fecha(r.ultimoRebalanceo)}` : ''}{c.objetivo ? ` · ${c.objetivo}` : ''}</p>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[12px] text-suave">Último año, simulada con su rebalanceo</span>
        <div className="relative min-h-44 flex-1"><Mini valores={r.linea} area color={colorLinea(r.linea)} className="absolute inset-0 h-full w-full" /></div>
      </div>
      <div className="flex flex-col gap-3 md:col-span-2 lg:col-span-1">
        <span className="text-[12px] text-suave">Tipo de activo</span>
        <Donut activos={r.activos} cobertura={r.cobertura} />
        <div className="mt-auto text-[12px]">
          {senales === undefined ? null : avisos.length
            ? avisos.slice(0, 3).map((a) => <a key={a.k} href={a.href} title={a.title} className="block truncate py-1 text-aviso hover:underline">▲ {a.texto}{a.title && <span className="sr-only"> ({a.title})</span>}</a>)
            : <p className="py-1 text-suave"><span className="text-sube" aria-hidden="true">● </span>Ningún fondo con señales de revisión ni fuera de banda.</p>}
          {avisos.length > 3 && <a href="#/revision" className="block py-1 text-suave hover:text-acento">y {avisos.length - 3} avisos más</a>}
          <a href={`#/cartera/${c.id}`} className="block py-1 text-suave hover:text-acento">{r.fondos.length} fondos · ver composición ›</a>
        </div>
      </div>
    </div>
  )
}

/** Tipo de activo en un donut y su leyenda; mismos colores que la exposición de la cartera. */
function Donut({ activos, cobertura }: { activos: Fila[]; cobertura: number }) {
  const positivos = activos.filter(([, v]) => v > 0.5)
  if (!positivos.length) return <p className="text-suave">Sin composición todavía: se descarga los domingos.</p>
  const total = positivos.reduce((t, [, v]) => t + v, 0)
  let acum = 0
  const mayor = positivos[0][0] // mezclar() las devuelve de mayor a menor
  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 100 100" className="h-32 w-32 shrink-0" role="img" aria-label={`Tipo de activo: ${positivos.map(([n, v]) => `${n} ${Math.round(v)} %`).join(', ')}`}>
        <circle cx="50" cy="50" r="40" fill="none" strokeWidth="13" style={{ stroke: 'var(--color-borde)' }} />
        {positivos.map(([n, v]) => {
          const parte = (v / total) * 100
          const el = <circle key={n} cx="50" cy="50" r="40" fill="none" strokeWidth="13" pathLength={100} transform="rotate(-90 50 50)"
            strokeDasharray={`${Math.max(parte - 0.6, 0.1)} ${100 - Math.max(parte - 0.6, 0.1)}`} strokeDashoffset={-acum} style={{ stroke: COLOR_ACTIVO[n] ?? 'var(--color-serie2)' }} />
          acum += parte
          return el
        })}
      </svg>
      <ul className="min-w-0 space-y-1 text-[13px]">
        {positivos.map(([n, v]) => (
          <li key={n} className="flex items-center gap-2">
            <i aria-hidden="true" className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: COLOR_ACTIVO[n] ?? 'var(--color-serie2)' }} />
            <span className={n === mayor ? 'text-texto' : 'text-suave'}>{n}</span><span className="tabular">{Math.round(v)} %</span>
          </li>
        ))}
        {cobertura < 99 && <li className="text-[12px] text-suave">Con composición: {Math.round(cobertura)} % de la cartera</li>}
      </ul>
    </div>
  )
}

function TarjetaCartera({ c, r: dato, cargando, senales }: { c: Cartera; r: ResumenCartera | null | Error | undefined; cargando: boolean; senales?: Senales }) {
  const r = dato instanceof Error ? null : dato
  return (
    <li>
      <div className="relative flex h-full flex-col gap-3 rounded-lg border border-borde bg-panel p-4 hover:border-acento">
        <div className="flex items-baseline justify-between gap-2">
          <a href={`#/cartera/${c.id}`} className="font-medium after:absolute after:inset-0 after:rounded-lg">{c.nombre}</a>
          {r && <PildoraSemana v={r.semana} />}
        </div>
        {cargando ? <p className="text-suave">calculando…</p> : dato instanceof Error ? <Fallo e={dato} /> : !r ? <p className="text-suave">Sin fondos o sin datos suficientes.</p> : <>
          <div>
            <span className={`cifra text-5xl tabular ${tono(r.año)}`}>{pct(r.año)}</span>
            <span className="ml-2 text-suave">en el año</span>
          </div>
          <Mini valores={r.linea} area color={colorLinea(r.linea)} className="h-14 w-full" />
          <Cifras r={r} />
          <p className="text-[12px] text-suave">{r.fondos.length} fondos · rebalanceo {c.rebalanceo}{senales?.size ? <span className="text-aviso"> · ▲ {senales.size} a revisar</span> : ''}</p>
        </>}
      </div>
    </li>
  )
}

/** Los índices de referencia (a través de su fondo indexado en euros), en lista compacta con la línea del último año. */
function Mercados({ mercados }: { mercados: Mercado[] | Error | null }) {
  const [periodo, setPeriodo] = useState<Periodo>('semana')
  const grupo = (titulo: string, ms: Mercado[]) => (
    <div>
      <h3 className="mb-1 text-[11px] uppercase tracking-widest text-suave">{titulo}</h3>
      <ul>
        {ms.map((m) => {
          const v = m.cambio[periodo]
          return (
            <li key={m.isin}>
              <a href={`#/fondo/${m.isin}`} title={`${m.indice} · 1 año ${pct(m.anual)}`} className="grid grid-cols-[minmax(0,1fr)_auto_4.5rem] items-center gap-3 py-1 text-[13px] hover:text-acento">
                <span className="truncate">{m.indice.replace(/^(MSCI|Bloomberg) /, '')}</span>
                <Mini valores={m.linea} color={colorLinea(m.linea)} className="h-4 w-14" />
                <span className={`text-right tabular ${tono(v)}`}>{pct(v)}<span className="sr-only"> ({periodo}); 1 año {pct(m.anual)}</span></span>
              </a>
            </li>
          )
        })}
      </ul>
    </div>
  )
  return (
    <Seccion titulo="Mercados" extra={
      <div role="group" aria-label="Periodo" className="flex gap-0.5 rounded-full bg-borde/50 p-0.5 text-[12px]">
        {PERIODOS.map((p) => (
          <button key={p} onClick={() => setPeriodo(p)} aria-pressed={periodo === p}
            className={`rounded-full px-2.5 py-1 ${periodo === p ? 'bg-panel text-texto shadow-sm' : 'text-suave hover:text-texto'}`}>{p}</button>
        ))}
      </div>
    }>
      {!mercados ? <p className="text-suave">Cargando índices…</p> : mercados instanceof Error ? <Fallo e={mercados} /> : (
        <div className="space-y-3">
          {grupo('Bolsa', mercados.filter((m) => m.bolsa))}
          {grupo('Renta fija', mercados.filter((m) => !m.bolsa))}
          <p className="text-[12px] text-suave">Con su fondo indexado en euros. «Año»: desde el 31 de diciembre; la línea, el último año.</p>
        </div>
      )}
    </Seccion>
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
      {dato instanceof Error ? <Fallo e={dato} /> : !seg ? <p className="text-suave">Cargando…</p> : !seg.length ? <p className="text-suave">No sigues ningún fondo. Desde el screener o una ficha, «s» lo añade.</p>
        : (<>
        <p className="mb-1 text-[12px] text-suave">{nMueven ? `${nMueven === 1 ? 'Uno se mueve' : `${nMueven} se mueven`} esta semana (±2 puntos de nota); después, los nuevos y los de mejor nota.` : 'Ninguno se mueve esta semana (±2 puntos de nota): primero los nuevos, después los de mejor nota.'} La línea es su valor en el último año.</p>
        <ul className="divide-y divide-borde">
          {vistos.map((f) => (
            <li key={f.isin}>
              <a href={`#/fondo/${f.isin}`} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 py-2 hover:text-acento">
                <span className="min-w-0">
                  <span className="block truncate">{f.nombre}</span>
                  <span className="block truncate text-[12px] text-suave">
                    {f.estado === 'candidato' ? <span className="text-acento">candidato</span> : f.estado}{f.nuevo && <> · <span className="text-acento">nuevo</span></>}{f.myinvestor ? ' · MyInvestor' : ''}{f.categoria ? ` · ${f.categoria}` : ''}
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
