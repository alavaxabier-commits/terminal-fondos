import { useEffect, useState } from 'react'
import { calcularCartera } from '../calculo/cartera'
import { fecha, hoy, pct } from '../calculo/formato'
import { estadoDescargas, type Tarea } from '../calculo/vigilancia'
import { evolucion, type NotaSemanal } from '../calculo/senales'
import { cartera as leerCartera, crearCartera, tamanoBase, carteras as leerCarteras, notasDe, seguidos, sustitutos, vigilancia, type Cartera } from '../datos/consultas'
import { revisar, type Revision } from '../datos/revision'
import { serieEur } from '../datos/series'

/** Rentabilidad simulada de la cartera este año y a 3 años (anual), con su rebalanceo: las cifras de su pantalla. */
async function resumen(c: Cartera): Promise<{ ytd?: number; r3?: number } | null> {
  const d = await leerCartera(c.id)
  if (!d?.fondos.length) return null
  const fs = await Promise.all(d.fondos.map(async (l) => ({ isin: l.fondo.isin, peso: l.peso, serie: await serieEur(l.fondo.isin, l.fondo.divisa), ref: null, vol3: null })))
  const m = calcularCartera(fs, c.rebalanceo, new Map(), hoy(), { banda: c.banda || 5, tipo: c.banda_tipo, revision: c.revision })?.metricas
  return m ? { ytd: m.ytd?.rentabilidad, r3: m['3a']?.rentabilidad } : null
}
const color = (v?: number) => (v == null ? 'text-suave' : v >= 0 ? 'text-sube' : 'text-baja')

/** Inicio: estado de las descargas, mis carteras modelo, fondos a revisar, cambios del seguimiento e índices. */
export default function Inicio() {
  const [indices, setIndices] = useState<{ indice: string; isin: string }[]>([])
  const [carteras, setCarteras] = useState<Cartera[]>([])
  const [resumenes, setResumenes] = useState<Map<number, Awaited<ReturnType<typeof resumen>>>>(new Map())
  const [error, setError] = useState('')
  const [descargas, setDescargas] = useState<Tarea[] | null>(null)
  const [base, setBase] = useState<Awaited<ReturnType<typeof tamanoBase>>>(null)
  const [revision, setRevision] = useState<Revision | null>(null)
  const [cambiosSeg, setCambiosSeg] = useState<{ isin: string; nombre: string; estado: string; nota: number; semana: number | null }[]>([])
  useEffect(() => {
    revisar().then(setRevision).catch((e: Error) => setError(e.message))
    seguidos().then(async (fs) => {
      const activos = fs.filter((f) => f.estado !== 'descartado')
      const porIsin = new Map<string, NotaSemanal[]>()
      for (const n of await notasDe(activos.map((f) => f.isin))) porIsin.set(n.isin, [...(porIsin.get(n.isin) ?? []), n])
      const semana = Date.now() - 7 * 864e5
      setCambiosSeg(activos.flatMap((f) => {
        const e = evolucion(porIsin.get(f.isin) ?? [])
        const nuevo = Date.parse(f.alta) >= semana
        return e && (nuevo || Math.abs(e.semana ?? 0) >= 2) ? [{ isin: f.isin, nombre: f.fondo.nombre, estado: f.estado, nota: e.nota, semana: nuevo ? null : e.semana }] : []
      }))
    }).catch((e: Error) => setError(e.message))
    tamanoBase().then(setBase).catch((e: Error) => setError(e.message))
    vigilancia().then((l) => setDescargas(estadoDescargas(l, new Date()))).catch((e: Error) => setError(e.message))
    sustitutos().then(setIndices).catch((e: Error) => setError(e.message))
    leerCarteras().then((cs) => {
      setCarteras(cs)
      for (const c of cs) resumen(c).then((r) => setResumenes((m) => new Map(m).set(c.id, r))).catch((e: Error) => setError(e.message))
    }).catch((e: Error) => setError(e.message))
  }, [])

  return (
    <div className="space-y-6">
      <p className="text-suave">Busca un fondo por nombre o ISIN (tecla «/»), o abre uno de los índices de referencia.</p>
      {error && <p className="text-baja">No se han podido leer los datos: {error}</p>}
      {descargas && <EstadoDescargas tareas={descargas} />}
      {base && <TamanoBase {...base} />}
      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-[11px] uppercase tracking-widest text-suave">Carteras modelo</h2>
          <button
            onClick={() => crearCartera({ nombre: 'Cartera nueva', objetivo: null, rebalanceo: 'anual', banda: 5, banda_tipo: 'puntos', revision: 'diaria' }).then((id) => (location.hash = `#/cartera/${id}`)).catch((e: Error) => setError(e.message))}
            className="min-h-8 border border-borde px-3 text-suave hover:text-texto"
          >
            nueva cartera
          </button>
        </div>
        {carteras.length > 0 && (
          <ul className="grid gap-px border border-borde bg-borde sm:grid-cols-2">
            {carteras.map((c) => (
              <li key={c.id} className="bg-fondo">
                <a href={`#/cartera/${c.id}`} className="flex flex-wrap items-baseline justify-between gap-x-3 px-3 py-2 hover:bg-panel">
                  <span>{c.nombre} <span className="text-suave">· rebalanceo {c.rebalanceo}</span></span>
                  {resumenes.has(c.id) ? (
                    <span className="tabular">
                      <span className="text-suave">año </span><span className={color(resumenes.get(c.id)?.ytd)}>{pct(resumenes.get(c.id)?.ytd)}</span>
                      <span className="text-suave"> · 3A anual </span><span className={color(resumenes.get(c.id)?.r3)}>{pct(resumenes.get(c.id)?.r3)}</span>
                    </span>
                  ) : <span className="text-suave">…</span>}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
      {revision && <FondosARevisar revision={revision} />}
      {cambiosSeg.length > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-[11px] uppercase tracking-widest text-suave">Seguimiento · cambios de la semana</h2>
            <a href="#/seguimiento" className="text-suave hover:text-texto">ver lista</a>
          </div>
          <table className="w-full text-right tabular [&_tr>*+*]:pl-3">
            <thead className="text-[11px] uppercase tracking-widest text-suave">
              <tr className="border-b border-borde"><th className="py-1 text-left font-normal">Fondo</th><th className="font-normal">Nota</th><th className="font-normal">Semana</th><th className="text-left font-normal">Estado</th></tr>
            </thead>
            <tbody>
              {cambiosSeg.map((f) => (
                <tr key={f.isin} className="border-b border-borde/50">
                  <td className="py-1 text-left"><a href={`#/fondo/${f.isin}`} className="hover:text-acento">{f.nombre}</a></td>
                  <td className="text-acento">{Math.round(f.nota)}</td>
                  <td className={f.semana == null ? 'text-suave' : f.semana > 0 ? 'text-sube' : 'text-baja'}>{f.semana == null ? 'nuevo' : `${f.semana > 0 ? '+' : ''}${Math.round(f.semana)}`}</td>
                  <td className={`text-left ${f.estado === 'candidato' ? 'text-acento' : ''}`}>{f.estado}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-suave">Solo los que cambian 2 puntos o más, o entraron esta semana.</p>
        </section>
      )}
      <section>
        <h2 className="mb-2 text-[11px] uppercase tracking-widest text-suave">Índices de referencia</h2>
        <ul className="grid gap-px border border-borde bg-borde sm:grid-cols-2">
          {indices.map((i) => (
            <li key={i.isin} className="bg-fondo">
              <a href={`#/fondo/${i.isin}`} className="block px-3 py-2 hover:bg-panel">
                {i.indice} <span className="text-suave">· {i.isin}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

/** Fondos de mis carteras con alguna señal, con la primera razón. */
function FondosARevisar({ revision }: { revision: Revision }) {
  const marcados = revision.carteras.flatMap((c) => c.fondos.filter((f) => f.senales.length).map((f) => ({ ...f, cartera: c.cartera })))
  if (!marcados.length) return <p className="text-suave"><span className="text-sube" aria-hidden="true">● </span>Ningún fondo de las carteras tiene señales de revisión.</p>
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-[11px] uppercase tracking-widest text-aviso">Fondos a revisar</h2>
        <a href="#/revision" className="text-suave hover:text-texto">ver todos</a>
      </div>
      <ul className="border border-borde">
        {marcados.map((m) => (
          <li key={`${m.cartera.id}-${m.fondo.isin}`} className="border-b border-borde/50 px-3 py-2 last:border-0">
            <span className="text-aviso">▲ </span>{m.cartera.nombre} · <a href="#/revision" className="hover:text-acento">{m.fondo.nombre}</a>
            <span className="text-suave">: {m.senales.map((s) => s.tipo.toLowerCase()).join(', ')}{m.alternativas.length ? ` · ${m.alternativas.length} alternativas` : ''}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

const hora = (ts: string) => `${fecha(ts)} ${new Date(ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`

/** Una línea con el estado de las descargas; en rojo, las alarmas y las tareas que no han pasado cuando tocaba. */
function EstadoDescargas({ tareas }: { tareas: Tarea[] }) {
  const mal = tareas.filter((t) => t.alarmas.length || t.atrasada)
  if (!tareas.length) return null
  if (!mal.length)
    return (
      <p className="text-suave">
        <span className="text-sube" aria-hidden="true">● </span>
        Descargas en orden · {tareas.map((t) => `${t.tarea} ${hora(t.ts)}`).join(' · ')}
      </p>
    )
  return (
    <section role="alert" className="border border-baja/60 p-3">
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

const LIMITE_MB = 500 // plan gratuito de Supabase
const mb = (bytes: number) => Math.round(bytes / 2 ** 20)

/** Cuánto ocupa la base frente al límite del plan gratuito, y qué tablas pesan más. Ámbar desde el 80 %, rojo desde el 90 %. */
function TamanoBase({ total, tablas }: { total: number; tablas: { tabla: string; bytes: number }[] }) {
  const uso = mb(total) / LIMITE_MB
  const tono = uso >= 0.9 ? 'text-baja' : uso >= 0.8 ? 'text-aviso' : 'text-sube'
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-suave">
      <span>Base de datos</span>
      <span className="inline-block h-2 w-24 border border-borde" role="meter" aria-valuemin={0} aria-valuemax={LIMITE_MB} aria-valuenow={mb(total)} aria-label="Espacio usado en la base">
        <span className={`block h-full bg-current ${tono}`} style={{ width: `${Math.min(100, uso * 100)}%` }} />
      </span>
      <span><span className={tono}>{mb(total)} MB</span> de {LIMITE_MB} MB ({Math.round(uso * 100)} %)</span>
      <span>· {tablas.map((t) => `${t.tabla} ${mb(t.bytes)}`).join(', ')} MB</span>
    </p>
  )
}
