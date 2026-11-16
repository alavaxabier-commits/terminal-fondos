import { Fragment, useEffect, useState } from 'react'
import { cifra, colorPercentil, fecha, millones, pct } from '../calculo/formato'
import { TIPOS, tipoActivo } from '../calculo/screener'
import { encaje, type Diversificacion } from '../calculo/encaje'
import { evolucion, mediana, type NotaSemanal, type Senal } from '../calculo/senales'
import { variacion } from '../calculo/series'
import Bandeja from '../componentes/Bandeja'
import DetalleFondo from '../componentes/DetalleFondo'
import { useTeclasLista } from '../componentes/teclas'
import { alternar } from '../datos/bandeja'
import * as q from '../datos/consultas'
import { serieEur } from '../datos/series'
import { senalesSeguidos } from '../datos/revision'

type Fila = Awaited<ReturnType<typeof q.seguidos>>[number]
type Vista = 'activos' | 'candidato' | 'descartado'
const control = 'border border-borde bg-panel px-1 py-1 text-texto outline-none focus:border-acento'

const cambio = (v: number | null) =>
  v == null ? <span className="text-suave">—</span> : <span className={v >= 0.5 ? 'text-sube' : v <= -0.5 ? 'text-baja' : 'text-suave'}>{v > 0 ? '+' : ''}{Math.round(v)}</span>

type Cifra = [clave: string, titulo: string, formato: (v: number) => string]
const sinSigno = (v: number) => pct(v, 1, false)
// En la lista: rentabilidad y riesgo (tabla metrica, como en la ficha). En la tarjeta: lo que no está en la lista.
const LISTA: Cifra[] = [['ytd|rentabilidad', 'Este año', pct], ['1a|rentabilidad', '1 año', pct], ['3a|rentabilidad', '3 años', pct],
  ['3a|volatilidad', 'Volat. 3a', sinSigno], ['3a|max_caida', 'Caída 3a', pct]]
const TARJETA: Cifra[] = [['5a|rentabilidad', 'Rentab. 5 años', pct], ['10a|rentabilidad', 'Rentab. 10 años', pct], ['5a|max_caida', 'Caída máx. 5a', pct],
  ['3a|sharpe', 'Sharpe 3a', cifra], ['3a|captura_alcista', 'Captura alcista 3a', (v) => cifra(v, 0)], ['3a|captura_bajista', 'Captura bajista 3a', (v) => cifra(v, 0)],
  ['hist|consistencia', 'Consistencia', (v) => `${cifra(v, 0)} %`], ['3a|beta', 'Beta 3a', cifra], ['3a|alfa', 'Alfa 3a', pct]]

/** Una métrica con el color de su percentil en la categoría (la beta no tiene). */
function Valor({ m, formato }: { m: q.Metrica | undefined; formato: (v: number) => string }) {
  if (!m) return <span className="text-suave">—</span>
  return <span className={colorPercentil(m.percentil)} title={m.percentil == null ? undefined : `percentil ${Math.round(m.percentil)} en su categoría`}>{formato(m.valor)}</span>
}

/** Seguimiento: cifras del conjunto, los fondos con alguna señal esta semana, la lista por tipo de activo con su
 *  rentabilidad y riesgo y, a la derecha, el fondo elegido con lo que no sale en la lista, su estado y su encaje. */
export default function Seguimiento() {
  const [filas, setFilas] = useState<Fila[] | null>(null)
  const [notas, setNotas] = useState<Map<string, NotaSemanal[]>>(new Map())
  const [senales, setSenales] = useState<Map<string, Senal[]>>(new Map())
  const [met, setMet] = useState<Map<string, q.Metrica>>(new Map())
  const [vista, setVista] = useState<Vista>('activos')
  const [sel, setSel] = useState<string | null>(null)
  const [carteras, setCarteras] = useState<NonNullable<Awaited<ReturnType<typeof q.cartera>>>[]>([])
  const [div, setDiv] = useState<Diversificacion[]>([])
  const [desdeAlta, setDesdeAlta] = useState<Map<string, number | null>>(new Map())
  const [error, setError] = useState('')
  const falla = (e: Error) => setError(e.message)

  useEffect(() => {
    q.seguidos().then(async (f) => {
      setFilas(f)
      const todas = await q.notasDe(f.map((x) => x.isin))
      const m = new Map<string, NotaSemanal[]>()
      for (const n of todas) m.set(n.isin, [...(m.get(n.isin) ?? []), n])
      setNotas(m)
      setVista((v) => (v === 'activos' && f.some((x) => x.estado === 'candidato') ? 'candidato' : v)) // lo primero que se mira: los candidatos
      senalesSeguidos(f.map((x) => ({ isin: x.isin, ...x.fondo, fund_id: x.fondo.fund_id ?? null })), todas).then(setSenales).catch(falla)
      q.diversificacionDe(f.map((x) => x.isin)).then(setDiv).catch(falla)
      q.metricasDe(f.map((x) => x.isin)).then((ms) => setMet(new Map(ms.map((x) => [`${x.isin}|${x.ventana}|${x.nombre}`, x])))).catch(falla)
      // La rentabilidad desde el alta es accesoria: si una serie falla, ese fondo va sin ella.
      for (const x of f) serieEur(x.isin, x.fondo.divisa).then((s) => setDesdeAlta((d) => new Map(d).set(x.isin, variacion(s, x.alta.slice(0, 10))))).catch(() => {})
    }).catch(falla)
    q.carteras().then((cs) => Promise.all(cs.map((c) => q.cartera(c.id)))).then((d) => setCarteras(d.filter((x) => x != null))).catch(falla)
  }, [])

  const cambiar = (isin: string, c: Partial<Pick<Fila, 'estado' | 'nota'>>) => {
    setFilas((fs) => fs!.map((f) => (f.isin === isin ? { ...f, ...c } : f)))
    q.cambiarSeguimiento(isin, c).catch(falla)
  }
  const quitar = (isin: string) => {
    setFilas((fs) => fs!.filter((f) => f.isin !== isin))
    q.dejarDeSeguir(isin).catch(falla)
  }

  const categoria = (f: Fila) => f.fondo.categoria ?? 'Sin categoría'
  const tipo = (f: Fila) => tipoActivo(f.fondo.categoria)
  const visibles = (filas ?? []).filter((f) => (vista === 'activos' ? f.estado !== 'descartado' : f.estado === vista))
    .sort((a, b) => TIPOS.indexOf(tipo(a)) - TIPOS.indexOf(tipo(b)) || categoria(a).localeCompare(categoria(b), 'es') || a.fondo.nombre.localeCompare(b.fondo.nombre, 'es'))
  // sin selección (o si deja de verse), la primera fila
  const primera = visibles[0]?.isin
  const sigue = visibles.some((f) => f.isin === sel)
  useEffect(() => { if (primera && !sigue) setSel(primera) }, [primera, sigue])
  useTeclasLista(visibles.map((f) => f.isin), sel, setSel, {
    Enter: (i) => { location.hash = `#/fondo/${i}` },
    b: (i) => { const f = visibles.find((x) => x.isin === i); if (f) alternar({ isin: i, nombre: f.fondo.nombre }) },
  })

  if (!filas) return <p className="text-suave">{error || 'Cargando…'}</p>
  const cuenta = (v: Vista) => filas.filter((f) => (v === 'activos' ? f.estado !== 'descartado' : f.estado === v)).length
  const elegido = visibles.find((f) => f.isin === sel)
  const ev = elegido && evolucion(notas.get(elegido.isin) ?? [])
  const porTipo = (t: string) => visibles.filter((f) => tipo(f) === t).length
  const ultimaFecha = [...notas.values()].flat().reduce((m, n) => (n.fecha > m ? n.fecha : m), '')
  const activos = filas.filter((f) => f.estado !== 'descartado')
  const m = (isin: string, clave: string) => met.get(`${isin}|${clave}`)
  const ytd = activos.flatMap((f) => { const v = m(f.isin, 'ytd|rentabilidad')?.valor; return v == null ? [] : [{ f, v }] }).sort((a, b) => b.v - a.v)
  const conSenal = vista === 'descartado' ? [] : visibles.filter((f) => senales.get(f.isin)?.length)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-lg font-bold text-acento">Seguimiento</h1>
        <div role="group" aria-label="Estado" className="flex border border-borde">
          {([['activos', 'activos'], ['candidato', 'candidatos'], ['descartado', 'descartados']] as [Vista, string][]).map(([v, t]) => (
            <button key={v} aria-pressed={vista === v} onClick={() => setVista(v)}
              className={`min-h-8 px-3 ${vista === v ? 'bg-panel text-acento' : 'text-suave hover:text-texto'} [&+&]:border-l [&+&]:border-borde`}>{t} {cuenta(v)}</button>
          ))}
        </div>
      </div>
      {error && <p className="text-baja">{error}</p>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi titulo="Seguidos" valor={activos.length} pie={`${cuenta('candidato')} candidatos · ${cuenta('descartado')} descartados`} />
        <Kpi titulo="Con señal" valor={activos.filter((f) => senales.get(f.isin)?.length).length} aviso
          pie={ultimaFecha ? `nota de la semana del ${fecha(ultimaFecha)}` : 'aún sin nota semanal'} />
        <Kpi titulo="En MyInvestor" valor={`${activos.filter((f) => f.myinvestor).length} de ${activos.length}`} pie="se pueden comprar hoy" />
        <Kpi titulo="Este año · mediana" valor={pct(mediana(ytd.map((x) => x.v)))}
          pie={ytd.length ? `mejor ${ytd[0].f.fondo.nombre} (${pct(ytd[0].v)}) · peor ${ytd.at(-1)!.f.fondo.nombre} (${pct(ytd.at(-1)!.v)})` : 'sin datos'} />
      </div>
      {conSenal.length > 0 && (
        <section aria-label="Señales de esta semana" className="border border-aviso/60">
          <p className="border-b border-aviso/60 px-3 py-1 text-[11px] uppercase tracking-widest text-aviso">Señales de esta semana</p>
          <ul className="divide-y divide-borde/50">
            {conSenal.map((f) => (
              <li key={f.isin} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-1.5">
                <button onClick={() => setSel(f.isin)} className={`text-left hover:text-acento ${sel === f.isin ? 'text-acento' : ''}`}>{f.fondo.nombre}</button>
                {senales.get(f.isin)!.map((s) => <span key={s.tipo} title={s.motivo} className="border border-aviso px-1.5 text-[12px] text-aviso">▲ {s.tipo}</span>)}
              </li>
            ))}
          </ul>
        </section>
      )}
      {visibles.length === 0 ? (
        <p className="text-suave">Nada aquí. Se añaden fondos desde el screener (+).</p>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[42rem] text-right [&_tr>*+*]:pl-3">
            <thead className="text-[11px] uppercase tracking-widest text-suave">
              <tr className="border-b border-borde">
                <th className="py-1 text-left font-normal">Fondo</th>
                <th className="font-normal" title="Nota y su cambio en 12 meses">Nota</th>
                {LISTA.map(([k, t]) => <th key={k} className="font-normal">{t}</th>)}
                <th className="font-normal">TER</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {visibles.map((f, i) => {
                const e = evolucion(notas.get(f.isin) ?? [])
                const nuevo = i === 0 || tipo(visibles[i - 1]) !== tipo(f)
                return (
                  <Fragment key={f.isin}>
                  {nuevo && (
                    <tr className="border-b border-borde">
                      <th colSpan={LISTA.length + 3} scope="colgroup" className="pt-4 pb-1 text-left text-[11px] font-normal uppercase tracking-widest text-acento">
                        {tipo(f)} <span className="text-suave">· {porTipo(tipo(f))}</span>
                      </th>
                    </tr>
                  )}
                  <tr data-isin={f.isin} aria-selected={sel === f.isin} onClick={() => setSel(f.isin)}
                    className={`cursor-pointer border-b border-borde/50 align-top ${sel === f.isin ? 'bg-panel' : 'hover:bg-panel/50'}`}>
                    <td className="py-1 text-left">
                      {sel === f.isin && <span className="text-acento" aria-hidden>▸ </span>}
                      <a href={`#/fondo/${f.isin}`} className="hover:text-acento">{f.fondo.nombre}</a>
                      {senales.get(f.isin)?.length ? <span className="text-aviso" title="Tiene alguna señal"> ▲</span> : null}
                      {f.estado === 'candidato' && vista !== 'candidato' && <span className="text-acento"> · candidato</span>}
                      <span className="block text-suave">{categoria(f)}{f.myinvestor && <span className="text-sube"> · MyInvestor</span>}</span>
                    </td>
                    <td>{e ? <><span className="text-acento">{Math.round(e.nota)}</span> <small>{cambio(e.periodo)}</small></> : <span className="text-suave">—</span>}</td>
                    {LISTA.map(([k, , formato]) => <td key={k}><Valor m={m(f.isin, k)} formato={formato} /></td>)}
                    <td><Valor m={m(f.isin, 'hoy|ter')} formato={(v) => `${cifra(v)} %`} /></td>
                  </tr>
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
        {elegido && (
          <aside className="lg:sticky lg:top-16 lg:max-h-[calc(100dvh-6.5rem)] lg:overflow-y-auto lg:overscroll-contain">
            <DetalleFondo isin={elegido.isin} nombre={elegido.fondo.nombre} divisa={elegido.fondo.divisa} seguido seguir={() => {}} categoria={categoria(elegido)}
              linea={`${elegido.isin} · ${elegido.fondo.gestion ?? 'gestión sin dato'} · SRRI ${elegido.fondo.srri ?? '—'} · ${millones(elegido.fondo.patrimonio_meur)} · en seguimiento desde ${fecha(elegido.alta)}${desdeAlta.get(elegido.isin) == null ? '' : ` (${pct(desdeAlta.get(elegido.isin))})`}`}
              nota={ev
                ? <p className="tabular"><span className="text-suave">nota </span><span className="text-acento">{Math.round(ev.nota)}</span>{ev.percentil != null && <span className="text-suave"> · p{Math.round(ev.percentil)} de su categoría</span>}
                    <span className="text-suave"> · semana </span>{cambio(ev.semana)}<span className="text-suave"> · 12 meses </span>{cambio(ev.periodo)}</p>
                : <p className="text-suave">Sin nota: fuera del universo o menos de 3 años de historia.</p>}>
              {senales.get(elegido.isin)?.length ? (
                <ul className="space-y-1">
                  {senales.get(elegido.isin)!.map((s) => <li key={s.tipo}><span className="text-aviso">▲ {s.tipo}</span> <span className="text-suave">{s.motivo}</span></li>)}
                </ul>
              ) : null}
              <dl className="grid grid-cols-3 gap-x-3 gap-y-2 tabular">
                {TARJETA.map(([k, t, formato]) => <div key={k}><dt className="text-[11px] text-suave">{t}</dt><dd><Valor m={m(elegido.isin, k)} formato={formato} /></dd></div>)}
              </dl>
              <Anos m={(k) => m(elegido.isin, k)} anos={[...met.keys()].map((k) => k.split('|')).filter(([i, v, n]) => i === elegido.isin && n === 'rentabilidad' && /^\d{4}$/.test(v)).map(([, v]) => v).sort().slice(-5)} />
              <Gestion key={elegido.isin} f={elegido} cambiar={(c) => cambiar(elegido.isin, c)} quitar={() => quitar(elegido.isin)} />
              <Encajes e={encaje({ isin: elegido.isin, categoria: elegido.fondo.categoria }, carteras, div)} isin={elegido.isin} />
            </DetalleFondo>
          </aside>
        )}
        </div>
      )}
      <Bandeja />
      <p className="text-suave">Las cifras salen de las métricas del fondo (en euros; «3 años», anualizada) y su color, del percentil en su categoría: verde, el mejor cuarto; rojo, el peor (pasa el ratón para verlo). El estado y tu nota se guardan al momento (la nota, al salir del campo). Las señales son las de Revisión con sus umbrales, salvo «Redundante», que solo tiene sentido dentro de una cartera. MyInvestor sale de su catálogo, que se renueva cada semana. Los fondos en seguimiento que no estén descartados tienen precios diarios desde la siguiente descarga.</p>
    </div>
  )
}

/** Estado, mi nota y dejar de seguir. Descartar pide el motivo (va a la nota) y quitar, confirmación. */
function Gestion({ f, cambiar, quitar }: { f: Fila; cambiar: (c: Partial<Pick<Fila, 'estado' | 'nota'>>) => void; quitar: () => void }) {
  const [pide, setPide] = useState<'descartar' | 'quitar' | null>(null)
  const [motivo, setMotivo] = useState(f.nota ?? '')
  const boton = 'min-h-8 px-3 [&+&]:border-l [&+&]:border-borde'
  return (
    <div className="space-y-2">
      <div role="group" aria-label="Estado" className="flex w-fit border border-borde">
        {(['vigilando', 'candidato', 'descartado'] as const).map((e) => (
          <button key={e} aria-pressed={f.estado === e} onClick={() => (e === 'descartado' && f.estado !== e ? setPide('descartar') : cambiar({ estado: e }))}
            className={`${boton} ${f.estado === e ? 'bg-fondo text-acento' : 'text-suave hover:text-texto'}`}>{e}</button>
        ))}
      </div>
      {pide === 'descartar' ? (
        <form className="space-y-1" onSubmit={(x) => { x.preventDefault(); cambiar({ estado: 'descartado', nota: motivo.trim() || null }); setPide(null) }}>
          <textarea autoFocus value={motivo} onChange={(x) => setMotivo(x.target.value)} rows={2} placeholder="por qué lo descarto" aria-label="Motivo del descarte" className={`${control} w-full`} />
          <div className="flex gap-3"><button className="text-acento hover:underline">Descartar</button><button type="button" onClick={() => setPide(null)} className="text-suave hover:text-texto">cancelar</button></div>
        </form>
      ) : (
        <textarea key={f.nota} defaultValue={f.nota ?? ''} rows={2} placeholder="por qué lo sigo" aria-label="Mi nota"
          onBlur={(x) => x.target.value !== (f.nota ?? '') && cambiar({ nota: x.target.value || null })} className={`${control} w-full`} />
      )}
      {pide === 'quitar'
        ? <p>¿Dejar de seguirlo? Se borra también tu nota. <button onClick={quitar} className="text-baja hover:underline">Sí, dejar de seguir</button> <button onClick={() => setPide(null)} className="text-suave hover:text-texto">cancelar</button></p>
        : <button onClick={() => setPide('quitar')} className="text-suave hover:text-baja">Dejar de seguir</button>}
    </div>
  )
}

/** Qué aportaría el fondo a cada cartera: su correlación con ella, el fondo de su categoría al que sustituiría y el simulador. */
function Encajes({ e, isin }: { e: ReturnType<typeof encaje>; isin: string }) {
  if (!e.length) return null
  return (
    <div>
      <p className="text-[11px] uppercase tracking-widest text-suave">Encaje en tus carteras</p>
      <ul className="divide-y divide-borde/50">
        {e.map((x) => (
          <li key={x.cartera.id} className="py-1">
            <a href={`#/cartera/${x.cartera.id}`} className="hover:text-acento">{x.cartera.nombre}</a>
            {x.dentro ? <span className="text-suave"> · ya está en ella</span> : (
              <>
                <span className="block text-suave">
                  {x.correlacion == null ? 'sin correlación calculada (fuera del universo o cartera nueva)' : `correlación ${cifra(x.correlacion)}${x.percentil == null ? '' : ` · diversifica más que el ${Math.round(x.percentil)} % de su categoría`}`}
                </span>
                {x.sustituye
                  ? <a href={`#/simular/${x.cartera.id}/${x.sustituye.isin}/${isin}`} className="block hover:text-acento">probar en lugar de {x.sustituye.nombre} ({cifra(x.sustituye.peso, 0)} %) →</a>
                  : <span className="block text-suave">ningún fondo de su categoría al que sustituir</span>}
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Una cifra del conjunto de fondos seguidos. */
function Kpi({ titulo, valor, pie, aviso }: { titulo: string; valor: string | number; pie: string; aviso?: boolean }) {
  return (
    <div className="min-w-0 rounded-lg border border-borde bg-panel p-3">
      <p className="text-[11px] uppercase tracking-widest text-suave">{titulo}</p>
      <p className={`cifra text-2xl tabular ${aviso && valor ? 'text-aviso' : ''}`}>{valor}</p>
      <p className="truncate text-[12px] text-suave" title={pie}>{pie}</p>
    </div>
  )
}

/** Rentabilidad de los últimos años naturales completos, con el color de su percentil (el año en curso está en la lista). */
function Anos({ anos, m }: { anos: string[]; m: (clave: string) => q.Metrica | undefined }) {
  if (!anos.length) return null
  return (
    <div>
      <p className="text-[11px] text-suave">Por año natural</p>
      <div className="grid tabular" style={{ gridTemplateColumns: `repeat(${anos.length}, minmax(0, 1fr))` }}>
        {anos.map((a) => <span key={a} className="text-[11px] text-suave">{a}</span>)}
        {anos.map((a) => <Valor key={a} m={m(`${a}|rentabilidad`)} formato={sinSigno} />)}
      </div>
    </div>
  )
}
