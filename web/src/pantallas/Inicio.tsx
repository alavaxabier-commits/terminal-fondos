import { useEffect, useState } from 'react'
import { calcularCartera } from '../calculo/cartera'
import { fecha, hoy, pct } from '../calculo/formato'
import { simularCartera } from '../calculo/metricas'
import { haceAnos, haceDias, muestra, variacion, type Punto } from '../calculo/series'
import type { Tarea } from '../calculo/vigilancia'
import { evolucion, type NotaSemanal } from '../calculo/senales'
import type { Estado } from '../App'
import Mini from '../componentes/Mini'
import { cartera as leerCartera, crearCartera, carteras as leerCarteras, notasDe, seguidos, sustitutos, type Cartera } from '../datos/consultas'
import type { Revision } from '../datos/revision'
import { serieEur } from '../datos/series'

type Periodo = 'semana' | 'mes' | 'año'
const PERIODOS: Periodo[] = ['semana', 'mes', 'año']
/** Desde cuándo se mide cada periodo, a partir del último dato de la serie. */
const desde = (ultimo: string, p: Periodo) => (p === 'semana' ? haceDias(ultimo, 7) : p === 'mes' ? haceDias(ultimo, 30) : `${+ultimo.slice(0, 4) - 1}-12-31`)
const cambios = (s: Punto[]) => Object.fromEntries(PERIODOS.map((p) => [p, s.length ? variacion(s, desde(s.at(-1)!.fecha, p)) : null])) as Record<Periodo, number | null>

type ResumenCartera = { año: number | null; semana: number | null; r3?: number; vol3?: number; caida3?: number; fondos: number; linea: number[] }
type Mercado = { indice: string; isin: string; bolsa: boolean; cambio: Record<Periodo, number | null>; anual: number | null }
type Seguido = { isin: string; nombre: string; categoria: string | null; estado: string; myinvestor: boolean; nota: number; semana: number | null; nuevo: boolean; linea: number[] }

/** La cartera simulada con su rebalanceo: lo que enseña su pantalla, más la variación de la semana y la línea del último año. */
async function resumen(c: Cartera): Promise<ResumenCartera | null> {
  const d = await leerCartera(c.id)
  if (!d?.fondos.length) return null
  const fs = await Promise.all(d.fondos.map(async (l) => ({ isin: l.fondo.isin, peso: l.peso, serie: await serieEur(l.fondo.isin, l.fondo.divisa), ref: null, vol3: null })))
  const bandas = { banda: c.banda || 5, tipo: c.banda_tipo, revision: c.revision }
  const sim = simularCartera(fs, c.rebalanceo, bandas).valor
  const m = calcularCartera(fs, c.rebalanceo, new Map(), hoy(), bandas)?.metricas
  if (!m || !sim.length) return null
  const ultimo = sim.at(-1)!.fecha
  return {
    año: variacion(sim, desde(ultimo, 'año')), semana: variacion(sim, desde(ultimo, 'semana')),
    r3: m['3a']?.rentabilidad, vol3: m['3a']?.volatilidad, caida3: m['3a']?.max_caida,
    fondos: d.fondos.length, linea: muestra(sim, haceAnos(ultimo, 1)),
  }
}

const tono = (v?: number | null) => (v == null ? 'text-suave' : v >= 0 ? 'text-sube' : 'text-baja')
const sube = (v: number) => (v >= 0 ? 'sube' : 'baja')
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
    leerCarteras().then((cs) => {
      setCarteras(cs)
      for (const c of cs) resumen(c).then((r) => setResumenes((m) => new Map(m).set(c.id, r))).catch(falla)
    }).catch(falla)
    sustitutos().then((is) => Promise.all(is.map(async (i): Promise<Mercado> => {
      const s = await serieEur(i.isin, 'EUR') // los fondos que representan a los índices están todos en euros
      const ultimo = s.at(-1)?.fecha ?? hoy()
      return { indice: i.indice, isin: i.isin, bolsa: /^(MSCI|S&P)/.test(i.indice), cambio: cambios(s), anual: variacion(s, haceAnos(ultimo, 1)) }
    }))).then(setMercados).catch(falla)
    seguidos().then(async (fs) => {
      const activos = fs.filter((f) => f.estado !== 'descartado')
      const porIsin = new Map<string, NotaSemanal[]>()
      for (const n of await notasDe(activos.map((f) => f.isin))) porIsin.set(n.isin, [...(porIsin.get(n.isin) ?? []), n])
      const semana = Date.now() - 7 * 864e5
      setSeg(activos.flatMap((f) => {
        const notas = porIsin.get(f.isin) ?? []
        const e = evolucion(notas)
        return e ? [{ isin: f.isin, nombre: f.fondo.nombre, categoria: f.fondo.categoria, estado: f.estado, myinvestor: f.myinvestor, nota: e.nota, semana: e.semana, nuevo: Date.parse(f.alta) >= semana, linea: notas.map((n) => n.nota) }] : []
      }).sort((a, b) => Number(b.nuevo) - Number(a.nuevo) || Math.abs(b.semana ?? 0) - Math.abs(a.semana ?? 0)))
    }).catch(falla)
  }, [])

  const nueva = () => crearCartera({ nombre: 'Cartera nueva', objetivo: null, rebalanceo: 'anual', banda: 5, banda_tipo: 'puntos', revision: 'diaria' }).then((id) => (location.hash = `#/cartera/${id}`)).catch(falla)

  return (
    <div className="space-y-10">
      {(error || errorEstado) && <p className="text-baja">No se han podido leer los datos: {error || errorEstado}</p>}
      {descargas && <AlarmasDescargas tareas={descargas} />}

      <Seccion titulo="Carteras modelo" extra={<button onClick={nueva} className="text-suave hover:text-acento">+ nueva cartera</button>}>
        {carteras.length > 0 && (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {carteras.map((c) => <TarjetaCartera key={c.id} c={c} r={resumenes.get(c.id)} cargando={!resumenes.has(c.id)} />)}
          </ul>
        )}
      </Seccion>

      <div className="grid gap-10 lg:grid-cols-2">
        {revision && <FondosARevisar revision={revision} />}
        <ListaSeguimiento seg={seg} />
      </div>
      <Mercados mercados={mercados} />
    </div>
  )
}

function TarjetaCartera({ c, r, cargando }: { c: Cartera; r: ResumenCartera | null | undefined; cargando: boolean }) {
  return (
    <li>
      <a href={`#/cartera/${c.id}`} className="flex h-full flex-col gap-3 rounded-lg border border-borde bg-panel p-4 hover:border-acento">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-medium">{c.nombre}</span>
          {r?.semana != null && <span className={`rounded-full px-2 text-[12px] tabular ${tono(r.semana)} ${r.semana >= 0 ? 'bg-sube/10' : 'bg-baja/10'}`}>{pct(r.semana)} semana</span>}
        </div>
        {cargando ? <p className="text-suave">calculando…</p> : !r ? <p className="text-suave">Sin fondos o sin datos suficientes.</p> : <>
          <div>
            <span className={`cifra text-5xl tabular ${tono(r.año)}`}>{pct(r.año)}</span>
            <span className="ml-2 text-suave">en el año</span>
          </div>
          <Mini valores={r.linea} area color={r.linea.length > 1 && r.linea.at(-1)! < r.linea[0] ? 'baja' : 'acento'} className="h-14 w-full" />
          <dl className="grid grid-cols-3 gap-2 text-[12px]">
            <div><dt className="text-suave">3A anual</dt><dd className={`tabular ${tono(r.r3)}`}>{pct(r.r3)}</dd></div>
            <div><dt className="text-suave">Volatilidad 3A</dt><dd className="tabular">{pct(r.vol3, 1, false)}</dd></div>
            <div><dt className="text-suave">Caída máx. 3A</dt><dd className="tabular text-baja">{pct(r.caida3)}</dd></div>
          </dl>
          <p className="text-[12px] text-suave">{r.fondos} fondos · rebalanceo {c.rebalanceo}</p>
        </>}
      </a>
    </li>
  )
}

/** Los índices de referencia (a través de su fondo indexado en euros), en una franja de pastillas teñidas: verde si suben, rojo si bajan. */
function Mercados({ mercados }: { mercados: Mercado[] | null }) {
  const [periodo, setPeriodo] = useState<Periodo>('semana')
  const escala = { semana: 0.03, mes: 0.06, año: 0.2 }[periodo] // a partir de aquí, color pleno
  const grupo = (titulo: string, ms: Mercado[]) => (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-20 shrink-0 text-[11px] uppercase tracking-widest text-suave">{titulo}</span>
      {ms.map((m) => {
        const v = m.cambio[periodo]
        const fuerza = v == null ? 0 : Math.min(Math.abs(v) / escala, 1) * 22
        return (
          <a key={m.isin} href={`#/fondo/${m.isin}`} title={`${m.indice} · 1 año ${pct(m.anual)}`}
            className="rounded-full border border-borde px-2.5 py-0.5 text-[12px] hover:border-acento"
            style={{ background: v == null ? undefined : `color-mix(in srgb, var(--color-${sube(v)}) ${fuerza}%, var(--color-panel))` }}>
            <span className="text-suave">{m.indice.replace(/^(MSCI|Bloomberg) /, '')}</span> <span className={`tabular ${tono(v)}`}>{pct(v)}</span>
          </a>
        )
      })}
    </div>
  )
  return (
    <Seccion titulo="Mercados" extra={
      <div role="group" aria-label="Periodo" className="flex gap-0.5 rounded-full bg-borde/50 p-0.5 text-[12px]">
        {PERIODOS.map((p) => (
          <button key={p} onClick={() => setPeriodo(p)} aria-pressed={periodo === p}
            className={`rounded-full px-3 py-0.5 ${periodo === p ? 'bg-panel text-texto shadow-sm' : 'text-suave hover:text-texto'}`}>{p}</button>
        ))}
      </div>
    }>
      {!mercados ? <p className="text-suave">Cargando índices…</p> : (
        <div className="space-y-2">
          {grupo('Bolsa', mercados.filter((m) => m.bolsa))}
          {grupo('Renta fija', mercados.filter((m) => !m.bolsa))}
          <p className="pt-1 text-[12px] text-suave">Cada índice, con su fondo indexado en euros. «Año»: desde el 31 de diciembre.</p>
        </div>
      )}
    </Seccion>
  )
}

/** Fondos de mis carteras con alguna señal, con sus motivos. */
function FondosARevisar({ revision }: { revision: Revision }) {
  const marcados = revision.carteras.flatMap((c) => c.fondos.filter((f) => f.senales.length).map((f) => ({ ...f, cartera: c.cartera })))
  return (
    <Seccion titulo="A revisar" extra={<a href="#/revision" className="text-suave hover:text-texto">ver todos</a>}>
      {!marcados.length ? <p className="text-suave"><span className="text-sube" aria-hidden="true">● </span>Ningún fondo de las carteras tiene señales de revisión.</p> : (
        <ul className="space-y-3">
          {marcados.map((m) => (
            <li key={`${m.cartera.id}-${m.fondo.isin}`} className="rounded-lg border border-aviso/40 bg-aviso/5 p-3">
              <a href="#/revision" className="font-medium hover:text-acento">{m.fondo.nombre}</a>
              <p className="text-[12px] text-suave">{m.cartera.nombre} · peso {Math.round(m.peso)} %{m.alternativas.length ? ` · ${m.alternativas.length} alternativas` : ''}</p>
              <ul className="mt-1 space-y-0.5">
                {m.senales.map((s) => <li key={s.tipo}><span className="text-aviso">▲ {s.tipo}.</span> <span className="text-suave">{s.motivo}</span></li>)}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </Seccion>
  )
}

/** Lo que se ha movido en el seguimiento: fondos nuevos de la semana y cambios de nota de 2 puntos o más (6 como mucho). */
function ListaSeguimiento({ seg }: { seg: Seguido[] | null }) {
  const movidos = (seg ?? []).filter((f) => f.nuevo || Math.abs(f.semana ?? 0) >= 2).slice(0, 6)
  return (
    <Seccion titulo="Seguimiento" extra={<a href="#/seguimiento" className="text-suave hover:text-texto">{seg?.length ? `ver los ${seg.length}` : 'ver lista'}</a>}>
      {!seg ? <p className="text-suave">Cargando…</p> : !seg.length ? <p className="text-suave">No sigues ningún fondo. Desde el screener o una ficha, «s» lo añade.</p>
        : !movidos.length ? <p className="text-suave">Sin cambios de nota de 2 puntos o más esta semana.</p> : (
        <ul className="divide-y divide-borde">
          {movidos.map((f) => (
            <li key={f.isin}>
              <a href={`#/fondo/${f.isin}`} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 py-2 hover:text-acento">
                <span className="min-w-0">
                  <span className="block truncate">{f.nombre}</span>
                  <span className="block truncate text-[12px] text-suave">
                    {f.estado === 'candidato' ? <span className="text-acento">candidato</span> : f.estado}{f.myinvestor ? ' · MyInvestor' : ''}{f.categoria ? ` · ${f.categoria}` : ''}
                  </span>
                </span>
                <Mini valores={f.linea} className="h-6 w-16" />
                <span className="w-14 text-right">
                  <span className="cifra block text-2xl leading-none tabular text-texto">{Math.round(f.nota)}</span>
                  <span className={`block text-[12px] tabular ${f.nuevo ? 'text-acento' : `font-medium ${tono(f.semana)}`}`}>
                    {f.nuevo ? 'nuevo' : f.semana == null ? '—' : `${f.semana > 0 ? '+' : ''}${Math.round(f.semana)}`}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
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
