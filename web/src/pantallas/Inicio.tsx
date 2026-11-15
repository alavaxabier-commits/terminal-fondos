import { useEffect, useState } from 'react'
import { calcularCartera } from '../calculo/cartera'
import { cifra, fecha, hoy, pct } from '../calculo/formato'
import { rendimientos, simularCartera } from '../calculo/metricas'
import { haceAnos, haceDias, muestra, variacion, type Punto } from '../calculo/series'
import type { Tarea } from '../calculo/vigilancia'
import { evolucion, type NotaSemanal, type Senal } from '../calculo/senales'
import type { Estado } from '../App'
import Mini from '../componentes/Mini'
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
    fondos: lineas.map((l, k) => ({ isin: l.fondo.isin, nombre: l.fondo.nombre, objetivo: l.peso / total, hoy: calc.fondos[k]?.pesoHoy ?? null })),
  }
}

/** En seguimiento, lo que merece mirarse: nuevo esta semana o con la nota 2 puntos arriba o abajo. */
const seMueve = (f: Seguido) => f.nuevo || Math.abs(f.semana ?? 0) >= 2
const tono = (v?: number | null) => (v == null ? 'text-suave' : v >= 0 ? 'text-sube' : 'text-baja')
const Seccion = ({ titulo, extra, children, className = '' }: { titulo: string; extra?: React.ReactNode; children: React.ReactNode; className?: string }) => (
  <section className={className}>
    <div className="mb-3 flex items-baseline justify-between gap-3 border-b border-borde pb-1">
      <h2 className="font-serif text-2xl">{titulo}</h2>{extra}
    </div>
    {children}
  </section>
)

/** Inicio: portada con un resumen escrito, carteras, mercados (índices de referencia), fondos a revisar y seguimiento.
 *  Descargas y revisión llegan de App, que las lee una vez para la barra de estado. */
export default function Inicio({ estado: { descargas, revision, error: errorEstado } }: { estado: Estado }) {
  const [carteras, setCarteras] = useState<Cartera[]>([])
  const [resumenes, setResumenes] = useState<Map<number, ResumenCartera | null>>(new Map())
  const [mercados, setMercados] = useState<Mercado[] | null>(null)
  const [seg, setSeg] = useState<Seguido[] | null>(null)
  const [error, setError] = useState('')
  const falla = (e: Error) => setError(e.message)

  useEffect(() => {
    Promise.all([leerCarteras(), categoriasReferencia(), referenciaSeries(['indice:estr'])]).then(([cs, cats, estr]) => {
      setCarteras(cs)
      const comun = { cats, rf: rendimientos(estr.get('indice:estr')?.semanal ?? new Map()) }
      for (const c of cs) resumen(c, comun).then((r) => setResumenes((m) => new Map(m).set(c.id, r))).catch(falla)
    }).catch(falla)
    sustitutos().then((is) => Promise.all(is.map(async (i): Promise<Mercado> => {
      const s = await serieEur(i.isin, 'EUR') // los fondos que representan a los índices están todos en euros
      const ultimo = s.at(-1)?.fecha ?? hoy()
      return { indice: i.indice, isin: i.isin, bolsa: /^(MSCI|S&P)/.test(i.indice), cambio: cambios(s), anual: variacion(s, haceAnos(ultimo, 1)), linea: muestra(s, haceAnos(ultimo, 1), 10) }
    }))).then(setMercados).catch(falla)
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
    }).catch(falla)
  }, [])

  const senalesDe = (id: number): Senales | undefined => revision
    ? new Map(revision.carteras.find((x) => x.cartera.id === id)?.fondos.filter((f) => f.senales.length).map((f) => [f.fondo.isin, f.senales]) ?? [])
    : undefined
  const nueva = () => crearCartera({ nombre: 'Cartera nueva', objetivo: null, rebalanceo: 'anual', banda: 5, banda_tipo: 'puntos', revision: 'diaria' }).then((id) => (location.hash = `#/cartera/${id}`)).catch(falla)

  return (
    <div className="space-y-10">
      {(error || errorEstado) && <p className="text-baja">No se han podido leer los datos: {error || errorEstado}</p>}
      {descargas && <AlarmasDescargas tareas={descargas} />}

      <Seccion titulo={carteras.length === 1 ? 'Cartera modelo' : 'Carteras modelo'} extra={<button onClick={nueva} className="text-suave hover:text-acento">+ nueva cartera</button>}>
        {carteras.length === 1 ? <CarteraAncha c={carteras[0]} r={resumenes.get(carteras[0].id)} cargando={!resumenes.has(carteras[0].id)} senales={senalesDe(carteras[0].id)} />
          : carteras.length > 1 && (
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
  const k: [string, string, string, string?][] = [
    ...(todos ? [['1 año', pct(r.r1), tono(r.r1)], ['3 años', pct(r.r3), tono(r.r3), 'anual'], ['5 años', pct(r.r5), tono(r.r5), 'anual']] as [string, string, string, string?][]
      : [['3 años', pct(r.r3), tono(r.r3), 'anual']] as [string, string, string, string?][]),
    ['vs referencia', puntos(r.vsRef3), tono(r.vsRef3), 'a 3 años, rentabilidad anual de la cartera menos la de la referencia combinada de sus fondos'],
    ['Volatilidad', pct(r.vol3, 1, false), ''],
    ['Caída máx.', pct(r.caida3), 'text-baja'],
    ['Sharpe', cifra(r.sharpe3), ''],
    ['Gastos', r.gastos == null ? '—' : `${cifra(r.gastos)} %`, '', 'TER medio ponderado por los pesos objetivo'],
  ]
  return (
    <div>
      <dl className={`grid gap-x-3 gap-y-2 text-[12px] ${todos ? 'grid-cols-4' : 'grid-cols-3'}`}>
        {k.map(([et, v, cls, ayuda]) => (
          <div key={et} title={ayuda}><dt className="text-suave">{et}</dt><dd className={`tabular text-[13px] ${cls}`}>{v}</dd></div>
        ))}
      </dl>
      <p className="mt-1 text-[11px] text-suave">A 3 años{todos ? ', salvo indicado' : ''}; rentabilidades a 3{todos ? ' y 5' : ''} años, anuales.</p>
    </div>
  )
}
const PildoraSemana = ({ v }: { v: number | null }) => v == null ? null
  : <span className={`rounded-full px-2 text-[12px] tabular ${tono(v)} ${v >= 0 ? 'bg-sube/10' : 'bg-baja/10'}`}>{pct(v)} semana</span>
const colorLinea = (l: number[]) => (l.length > 1 && l.at(-1)! < l[0] ? 'baja' : 'acento')

/** Con una sola cartera, ocupa todo el ancho: cifras, el último año y el reparto de hoy frente al objetivo. */
function CarteraAncha({ c, r, cargando, senales }: { c: Cartera; r: ResumenCartera | null | undefined; cargando: boolean; senales?: Senales }) {
  if (cargando || !r) return <div className="rounded-lg border border-borde bg-panel p-5 text-suave">{cargando ? 'calculando…' : 'Sin fondos o sin datos suficientes.'}</div>
  // Alto casi fijo: como mucho 6 líneas de reparto. Si hay más fondos, 5 (primero los que tienen señal o se salen de la
  // banda, luego los de más peso) y una línea con el resto.
  const fuera = (f: ResumenCartera['fondos'][number]) => f.hoy != null && Math.abs(f.hoy - f.objetivo) * 100 >= c.banda
  const prioridad = (f: ResumenCartera['fondos'][number]) => Number(!!senales?.has(f.isin) || fuera(f))
  const vistos = r.fondos.length <= 6 ? r.fondos
    : [...r.fondos].sort((a, b) => prioridad(b) - prioridad(a) || b.objetivo - a.objetivo).slice(0, 5).sort((a, b) => b.objetivo - a.objetivo)
  const otros = r.fondos.filter((f) => !vistos.includes(f))
  const suma = (k: 'objetivo' | 'hoy') => otros.reduce((t, f) => t + (f[k] ?? 0), 0)
  return (
    <div className="grid gap-6 rounded-lg border border-borde bg-panel p-5 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1.1fr)]">
      <a href={`#/cartera/${c.id}`} className="flex flex-col gap-3 hover:text-acento">
        <div className="flex flex-wrap items-baseline gap-2"><span className="font-medium">{c.nombre}</span><PildoraSemana v={r.semana} /></div>
        <div><span className={`cifra text-6xl tabular ${tono(r.año)}`}>{pct(r.año)}</span><span className="ml-2 text-suave">en el año</span></div>
        <Cifras r={r} todos />
        <p className="mt-auto text-[12px] text-suave">Rebalanceo {c.rebalanceo}{r.ultimoRebalanceo ? `, el último el ${fecha(r.ultimoRebalanceo)}` : ''}{c.objetivo ? ` · ${c.objetivo}` : ''}</p>
      </a>
      <div className="flex flex-col gap-1">
        <span className="text-[12px] text-suave">Último año, simulada con su rebalanceo</span>
        <div className="relative min-h-44 flex-1"><Mini valores={r.linea} area color={colorLinea(r.linea)} className="absolute inset-0 h-full w-full" /></div>
      </div>
      <div className="md:col-span-2 lg:col-span-1">
        <div className="mb-2 flex justify-between text-[12px] text-suave"><span>Reparto</span><span>objetivo → hoy</span></div>
        <ul className="space-y-2">
          {vistos.map((f) => {
            const deriva = f.hoy == null ? 0 : (f.hoy - f.objetivo) * 100 // puntos
            return (
              <li key={f.isin}>
                <a href={`#/fondo/${f.isin}`} className="block hover:text-acento">
                  <span className="flex justify-between gap-2 text-[13px]">
                    <span className="truncate">{f.nombre}</span>
                    <span className="shrink-0 tabular text-suave">{pct(f.objetivo, 0, false)} → <span className={Math.abs(deriva) >= c.banda ? 'text-aviso' : 'text-texto'}>{pct(f.hoy, 1, false)}</span></span>
                  </span>
                  <span className="relative mt-1 block h-1.5 rounded-full bg-borde/60">
                    <span className="absolute inset-y-0 left-0 rounded-full bg-acento" style={{ width: `${Math.min((f.hoy ?? f.objetivo) * 100, 100)}%` }} />
                    <span className="absolute -inset-y-0.5 w-0.5 bg-texto" style={{ left: `${f.objetivo * 100}%` }} title="objetivo" />
                  </span>
                </a>
                {senales?.get(f.isin) && (
                  <a href="#/revision" title={senales.get(f.isin)!.map((x) => x.motivo).join(' · ')} className="mt-0.5 block text-[12px] text-aviso hover:underline">
                    ▲ {senales.get(f.isin)!.map((x) => x.tipo.toLowerCase()).join(', ')}
                  </a>
                )}
              </li>
            )
          })}
        </ul>
        {otros.length > 0 && (
          <a href={`#/cartera/${c.id}`} className="mt-2 flex justify-between gap-2 text-[13px] text-suave hover:text-acento">
            <span>+ {otros.length} fondos más</span><span className="tabular">{pct(suma('objetivo'), 0, false)} → {pct(suma('hoy'), 1, false)}</span>
          </a>
        )}
        <p className="mt-2 text-[12px] text-suave">La raya marca el peso objetivo; en arena, los que se salen de la banda de {c.banda} puntos.</p>
        <EstadoRevision senales={senales} />
      </div>
    </div>
  )
}

function TarjetaCartera({ c, r, cargando, senales }: { c: Cartera; r: ResumenCartera | null | undefined; cargando: boolean; senales?: Senales }) {
  return (
    <li>
      <a href={`#/cartera/${c.id}`} className="flex h-full flex-col gap-3 rounded-lg border border-borde bg-panel p-4 hover:border-acento">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-medium">{c.nombre}</span>
          {r && <PildoraSemana v={r.semana} />}
        </div>
        {cargando ? <p className="text-suave">calculando…</p> : !r ? <p className="text-suave">Sin fondos o sin datos suficientes.</p> : <>
          <div>
            <span className={`cifra text-5xl tabular ${tono(r.año)}`}>{pct(r.año)}</span>
            <span className="ml-2 text-suave">en el año</span>
          </div>
          <Mini valores={r.linea} area color={colorLinea(r.linea)} className="h-14 w-full" />
          <Cifras r={r} />
          <p className="text-[12px] text-suave">{r.fondos.length} fondos · rebalanceo {c.rebalanceo}{senales?.size ? <span className="text-aviso"> · ▲ {senales.size} a revisar</span> : ''}</p>
        </>}
      </a>
    </li>
  )
}

/** Los índices de referencia (a través de su fondo indexado en euros), en lista compacta con la línea del último año. */
function Mercados({ mercados }: { mercados: Mercado[] | null }) {
  const [periodo, setPeriodo] = useState<Periodo>('semana')
  const grupo = (titulo: string, ms: Mercado[]) => (
    <div>
      <h3 className="mb-1 text-[11px] uppercase tracking-widest text-suave">{titulo}</h3>
      <ul>
        {ms.map((m) => {
          const v = m.cambio[periodo]
          return (
            <li key={m.isin}>
              <a href={`#/fondo/${m.isin}`} title={`${m.indice} · 1 año ${pct(m.anual)}`} className="grid grid-cols-[minmax(0,1fr)_auto_4.5rem] items-center gap-3 py-0.5 text-[13px] hover:text-acento">
                <span className="truncate">{m.indice.replace(/^(MSCI|Bloomberg) /, '')}</span>
                <Mini valores={m.linea} color={m.anual != null && m.anual < 0 ? 'baja' : 'suave'} className="h-4 w-14" />
                <span className={`text-right tabular ${tono(v)}`}>{pct(v)}</span>
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
            className={`rounded-full px-2.5 py-0.5 ${periodo === p ? 'bg-panel text-texto shadow-sm' : 'text-suave hover:text-texto'}`}>{p}</button>
        ))}
      </div>
    }>
      {!mercados ? <p className="text-suave">Cargando índices…</p> : (
        <div className="space-y-3">
          {grupo('Bolsa', mercados.filter((m) => m.bolsa))}
          {grupo('Renta fija', mercados.filter((m) => !m.bolsa))}
          <p className="text-[12px] text-suave">Con su fondo indexado en euros. «Año»: desde el 31 de diciembre; la línea, el último año.</p>
        </div>
      )}
    </Seccion>
  )
}

/** Una línea: cuántos fondos de la cartera tienen señales de revisión (el detalle, en Revisión). */
function EstadoRevision({ senales }: { senales?: Senales }) {
  if (!senales) return null
  return senales.size
    ? <a href="#/revision" className="mt-2 block text-[12px] text-aviso hover:underline">▲ {senales.size === 1 ? 'Un fondo' : `${senales.size} fondos`} con señales de revisión · ver revisión</a>
    : <p className="mt-2 text-[12px] text-suave"><span className="text-sube" aria-hidden="true">● </span>Ningún fondo con señales de revisión.</p>
}

/** Seis fondos del seguimiento: primero los que se mueven (nuevos o ±2 puntos de nota en la semana), después los de mejor nota. */
function ListaSeguimiento({ seg }: { seg: Seguido[] | null }) {
  const vistos = (seg ?? []).slice(0, 6)
  // Valor del último año, solo de los fondos que se ven. La línea es accesoria: si una serie falla, ese fondo va sin ella.
  const [lineas, setLineas] = useState<Map<string, number[]>>(new Map())
  useEffect(() => {
    for (const f of vistos) serieEur(f.isin, f.divisa).then((s) => s.length && setLineas((m) => new Map(m).set(f.isin, muestra(s, haceAnos(s.at(-1)!.fecha, 1))))).catch(() => {})
  }, [vistos.map((f) => f.isin).join()]) // eslint-disable-line react-hooks/exhaustive-deps
  const nMueven = (seg ?? []).filter(seMueve).length
  return (
    <Seccion titulo="Seguimiento" extra={<a href="#/seguimiento" className="text-suave hover:text-texto">{seg?.length ? `ver los ${seg.length}` : 'ver lista'}</a>}>
      {!seg ? <p className="text-suave">Cargando…</p> : !seg.length ? <p className="text-suave">No sigues ningún fondo. Desde el screener o una ficha, «s» lo añade.</p>
        : (<>
        <p className="mb-1 text-[12px] text-suave">{nMueven ? `${nMueven === 1 ? 'Uno se mueve' : `${nMueven} se mueven`} esta semana (nuevos o ±2 puntos de nota); después, los de mejor nota.` : 'Ninguno se mueve esta semana: los de mejor nota.'} La línea es su valor en el último año.</p>
        <ul className="divide-y divide-borde">
          {vistos.map((f) => (
            <li key={f.isin}>
              <a href={`#/fondo/${f.isin}`} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 py-2 hover:text-acento">
                <span className="min-w-0">
                  <span className="block truncate">{f.nombre}</span>
                  <span className="block truncate text-[12px] text-suave">
                    {f.estado === 'candidato' ? <span className="text-acento">candidato</span> : f.estado}{f.myinvestor ? ' · MyInvestor' : ''}{f.categoria ? ` · ${f.categoria}` : ''}
                  </span>
                </span>
                <Mini valores={lineas.get(f.isin) ?? []} color={colorLinea(lineas.get(f.isin) ?? [])} className="h-6 w-16" />
                <span className="w-14 text-right">
                  <span className="cifra block text-2xl leading-none tabular text-texto">{Math.round(f.nota)}</span>
                  <span className={`block text-[12px] tabular ${f.nuevo ? 'text-acento' : seMueve(f) ? `font-medium ${tono(f.semana)}` : 'text-suave'}`}>
                    {f.nuevo ? 'nuevo' : f.semana == null ? '—' : `${f.semana > 0 ? '+' : ''}${Math.round(f.semana)}`}
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
