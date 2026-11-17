import { Fragment, useEffect, useState } from 'react'
import { cifra, fecha, millones, pct } from '../calculo/formato'
import { TIPOS, tipoActivo } from '../calculo/screener'
import { encaje, type Diversificacion } from '../calculo/encaje'
import { evolucion, type NotaSemanal, type Senal } from '../calculo/senales'
import { variacion } from '../calculo/series'
import DetalleFondo from '../componentes/DetalleFondo'
import { useTeclasLista } from '../componentes/teclas'
import { alternar } from '../datos/bandeja'
import * as q from '../datos/consultas'
import { serieEur } from '../datos/series'
import { senalesSeguidos } from '../datos/revision'
import Cargando from '../componentes/Cargando'

type Fila = Awaited<ReturnType<typeof q.seguidos>>[number]
type ConFondos = NonNullable<Awaited<ReturnType<typeof q.cartera>>>
const control = 'border border-borde bg-panel px-1 py-1 text-texto outline-none focus:border-acento'
const MIRAR = 'Merecen mirarse'
const CLAVE_CARTERA = 'seguimiento.cartera'

const signo = (v: number) => (v > 0 ? 'text-sube' : v < 0 ? 'text-baja' : '')
const cambio = (v: number | null) =>
  v == null ? <span className="text-suave">—</span> : <span className={v >= 0.5 ? 'text-sube' : v <= -0.5 ? 'text-baja' : 'text-suave'}>{v > 0 ? '+' : ''}{Math.round(v)}</span>
/** Como en Inicio: la nota se mueve 2 puntos o más en la semana (redondeada, como se ve). */
const seMueve = (semana: number | null | undefined) => Math.abs(Math.round(semana ?? 0)) >= 2

type Cifra = [clave: string, titulo: string, formato: (v: number) => string, rentabilidad?: true]
const sinSigno = (v: number) => pct(v, 1, false)
const ter = (v: number) => `${cifra(v)} %`
const LISTA: Cifra[] = [['ytd|rentabilidad', 'Este año', pct, true], ['1a|rentabilidad', '1 año', pct, true], ['3a|rentabilidad', '3 años', pct, true],
  ['3a|volatilidad', 'Volat. 3a', sinSigno], ['3a|max_caida', 'Caída 3a', pct], ['hoy|ter', 'TER', ter]]

/** Una métrica: las rentabilidades, en verde o rojo según su signo; el resto, sin color. El percentil, al pasar el ratón. */
function Valor({ m, formato, rentabilidad }: { m: q.Metrica | undefined; formato: (v: number) => string; rentabilidad?: boolean }) {
  if (!m) return <span className="text-suave">—</span>
  return <span className={rentabilidad ? signo(m.valor) : ''} title={m.percentil == null ? undefined : `percentil ${Math.round(m.percentil)} en su categoría`}>{formato(m.valor)}</span>
}

const leerCartera = () => { try { return Number(localStorage.getItem(CLAVE_CARTERA)) || null } catch { return null } }

/** Seguimiento: una lista de fondos vigilados. Arriba, los que merecen mirarse (alguna señal o ±2 puntos de nota en la
 *  semana); después, el resto por tipo de activo. Su encaje con la cartera elegida, en la lista (correlación) y en el panel. */
export default function Seguimiento() {
  const [filas, setFilas] = useState<Fila[] | null>(null)
  const [notas, setNotas] = useState<Map<string, NotaSemanal[]>>(new Map())
  const [senales, setSenales] = useState<Map<string, Senal[]>>(new Map())
  const [met, setMet] = useState<Map<string, q.Metrica>>(new Map())
  const [sel, setSel] = useState<string | null>(null)
  const [quitando, setQuitando] = useState<string | null>(null)
  const [carteras, setCarteras] = useState<ConFondos[]>([])
  const [carteraId, setCarteraId] = useState<number | null>(leerCartera)
  const [div, setDiv] = useState<Diversificacion[]>([])
  const [desdeAlta, setDesdeAlta] = useState<Map<string, number | null>>(new Map())
  const [error, setError] = useState('')
  const falla = (e: Error) => setError(e.message)

  useEffect(() => {
    const cs = q.carteras().then((cs) => Promise.all(cs.map((c) => q.cartera(c.id)))).then((d) => d.filter((x) => x != null))
    q.seguidos().then(async (f) => {
      setFilas(f)
      cs.then(setCarteras).catch(falla)
      // Notas y métricas también de los fondos de las carteras, para compararlos con el que sustituirían.
      const isins = [...new Set([...f.map((x) => x.isin), ...(await cs.catch(() => [])).flatMap((c) => c.fondos.map((x) => x.fondo.isin))])]
      const todas = await q.notasDe(isins)
      const m = new Map<string, NotaSemanal[]>()
      for (const n of todas) m.set(n.isin, [...(m.get(n.isin) ?? []), n])
      setNotas(m)
      senalesSeguidos(f.map((x) => ({ isin: x.isin, ...x.fondo, fund_id: x.fondo.fund_id ?? null })), todas).then(setSenales).catch(falla)
      q.diversificacionDe(f.map((x) => x.isin)).then(setDiv).catch(falla)
      q.metricasDe(isins).then((ms) => setMet(new Map(ms.map((x) => [`${x.isin}|${x.ventana}|${x.nombre}`, x])))).catch(falla)
      // La rentabilidad desde el alta es accesoria: si una serie falla, ese fondo va sin ella.
      for (const x of f) serieEur(x.isin, x.fondo.divisa).then((s) => setDesdeAlta((d) => new Map(d).set(x.isin, variacion(s, x.alta.slice(0, 10))))).catch(() => {})
    }).catch(falla)
  }, [])

  const cambiarNota = (isin: string, nota: string | null) => {
    setFilas((fs) => fs!.map((f) => (f.isin === isin ? { ...f, nota } : f)))
    q.cambiarNotaSeguimiento(isin, nota).catch(falla)
  }
  const quitar = (isin: string) => {
    setFilas((fs) => fs!.filter((f) => f.isin !== isin))
    setQuitando(null)
    q.dejarDeSeguir(isin).catch(falla)
  }
  const elegirCartera = (id: number) => {
    setCarteraId(id)
    try { localStorage.setItem(CLAVE_CARTERA, String(id)) } catch { /* sin almacenamiento, no se recuerda */ }
  }

  const categoria = (f: Fila) => f.fondo.categoria ?? 'Sin categoría'
  const evo = (isin: string) => evolucion(notas.get(isin) ?? [])
  const grupo = (f: Fila) => (senales.get(f.isin)?.length || seMueve(evo(f.isin)?.semana) ? MIRAR : tipoActivo(f.fondo.categoria))
  const orden = (g: string) => (g === MIRAR ? -1 : (TIPOS as readonly string[]).indexOf(g))
  const visibles = [...(filas ?? [])].sort((a, b) => orden(grupo(a)) - orden(grupo(b)) || categoria(a).localeCompare(categoria(b), 'es') || a.fondo.nombre.localeCompare(b.fondo.nombre, 'es'))
  // sin selección (o si deja de verse), la primera fila
  const primera = visibles[0]?.isin
  const sigue = visibles.some((f) => f.isin === sel)
  useEffect(() => { if (primera && !sigue) setSel(primera) }, [primera, sigue])
  useTeclasLista(visibles.map((f) => f.isin), sel, setSel, {
    Enter: (i) => { location.hash = `#/fondo/${i}` },
    b: (i) => { const f = visibles.find((x) => x.isin === i); if (f) alternar({ isin: i, nombre: f.fondo.nombre }) },
    x: setQuitando,
  })

  if (!filas) return error ? <p className="text-baja">{error}</p> : <Cargando pagina />
  const m = (isin: string, clave: string) => met.get(`${isin}|${clave}`)
  const cartera = carteras.find((c) => c.cartera.id === carteraId) ?? carteras[0]
  const correlacion = (f: Fila) => {
    if (cartera.fondos.some((x) => x.fondo.isin === f.isin)) return <span className="text-suave">en ella</span>
    const c = div.find((d) => d.cartera_id === cartera.cartera.id && d.isin === f.isin)
    return c ? <span title={c.percentil == null ? undefined : `diversifica más que el ${Math.round(c.percentil)} % de su categoría`}>{cifra(c.correlacion)}</span> : <span className="text-suave">—</span>
  }
  const elegido = visibles.find((f) => f.isin === sel)
  const ev = elegido && evo(elegido.isin)
  const nMirar = visibles.filter((f) => grupo(f) === MIRAR).length
  const columnas = 4 + LISTA.length + (cartera ? 1 : 0) + 1

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-3xl! sm:text-4xl!">Seguimiento <span className="text-suave">· {filas.length} {filas.length === 1 ? 'fondo' : 'fondos'}</span></h1>
        <p className="text-suave">{nMirar ? <span className="text-aviso">{nMirar === 1 ? 'Uno merece' : `${nMirar} merecen`} mirarse esta semana</span> : 'Nada que mirar esta semana'}</p>
        {cartera && (
          <label className="flex items-baseline gap-2 text-suave">Encajar con
            <select value={cartera.cartera.id} onChange={(e) => elegirCartera(Number(e.target.value))} className={control}>
              {carteras.map((c) => <option key={c.cartera.id} value={c.cartera.id}>{c.cartera.nombre}</option>)}
            </select>
          </label>
        )}
      </div>
      {error && <p className="text-baja">{error}</p>}
      {visibles.length === 0 ? (
        <p className="text-suave">No sigues ningún fondo. Se añaden desde el screener o desde una ficha («s»).</p>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] text-right [&_tr>*+*]:pl-3">
            <thead className="rotulo">
              <tr className="border-b border-borde">
                <th className="py-1 text-left font-normal">Fondo</th>
                <th className="font-normal" title="Nota semanal; su color, la posición en su categoría (verde, el mejor cuarto; rojo, el peor)">Nota</th>
                <th className="font-normal" title="Cambio de la nota en la semana">Sem.</th>
                <th className="font-normal" title="Cambio de la nota en 12 meses">12 m</th>
                {cartera && <th className="font-normal" title={`Correlación media con ${cartera.cartera.nombre} (3 años, semanal): cuanto más baja, más diversifica`}>Correl.</th>}
                {LISTA.map(([k, t]) => <th key={k} className="font-normal">{t}</th>)}
                <th className="font-normal" title="Rentabilidad desde que lo sigues">Desde alta</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {visibles.map((f, i) => {
                const e = evo(f.isin)
                const g = grupo(f)
                const nuevo = i === 0 || grupo(visibles[i - 1]) !== g
                const alta = desdeAlta.get(f.isin)
                return (
                  <Fragment key={f.isin}>
                  {nuevo && (
                    <tr className="border-b border-borde">
                      <th colSpan={columnas} scope="colgroup" className={`pt-4 pb-1 text-left text-[11px] font-normal uppercase tracking-widest ${g === MIRAR ? 'text-aviso' : 'text-acento'}`}>
                        {g} <span className="text-suave">· {visibles.filter((x) => grupo(x) === g).length}</span>
                      </th>
                    </tr>
                  )}
                  <tr data-isin={f.isin} aria-selected={sel === f.isin} onClick={() => setSel(f.isin)}
                    className={`cursor-pointer border-b border-borde/50 align-top ${sel === f.isin ? 'bg-panel' : 'hover:bg-panel/50'}`}>
                    <td className="py-1 text-left">
                      {sel === f.isin && <span className="text-acento" aria-hidden>▸ </span>}
                      <a href={`#/fondo/${f.isin}`} className="hover:text-acento">{f.fondo.nombre}</a>
                      {senales.get(f.isin)?.map((s) => <span key={s.tipo} title={s.motivo} className="ml-2 text-[12px] text-aviso">▲ {s.tipo}</span>)}
                      <span className="block text-suave">{categoria(f)}{f.myinvestor && <span className="text-sube"> · MyInvestor</span>}</span>
                    </td>
                    <td>{e ? <span className={colorNota(e.percentil)} title={e.percentil == null ? undefined : `percentil ${Math.round(e.percentil)} en su categoría`}>{Math.round(e.nota)}</span> : <span className="text-suave">—</span>}</td>
                    <td>{cambio(e?.semana ?? null)}</td>
                    <td>{cambio(e?.periodo ?? null)}</td>
                    {cartera && <td>{correlacion(f)}</td>}
                    {LISTA.map(([k, , formato, r]) => <td key={k}><Valor m={m(f.isin, k)} formato={formato} rentabilidad={r} /></td>)}
                    <td>{alta == null ? <span className="text-suave">—</span> : <span className={signo(alta)}>{pct(alta)}</span>}</td>
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
              linea={`${elegido.isin} · ${elegido.fondo.gestion ?? 'gestión sin dato'} · SRRI ${elegido.fondo.srri ?? '—'} · ${millones(elegido.fondo.patrimonio_meur)} · en seguimiento desde ${fecha(elegido.alta)}`}
              nota={ev
                ? <p className="tabular"><span className="text-suave">nota </span><span className="text-acento">{Math.round(ev.nota)}</span>{ev.percentil != null && <span className="text-suave"> · p{Math.round(ev.percentil)} de su categoría</span>}
                    <span className="text-suave"> · semana </span>{cambio(ev.semana)}<span className="text-suave"> · 12 meses </span>{cambio(ev.periodo)}</p>
                : <p className="text-suave">Sin nota: fuera del universo o menos de 3 años de historia.</p>}>
              {senales.get(elegido.isin)?.length ? (
                <ul className="space-y-1">
                  {senales.get(elegido.isin)!.map((s) => <li key={s.tipo}><span className="text-aviso">▲ {s.tipo}</span> <span className="text-suave">{s.motivo}</span></li>)}
                </ul>
              ) : null}
              {cartera && <Encaje f={elegido} cartera={cartera} div={div} m={m} nota={(i) => evo(i)?.nota} />}
              <textarea key={elegido.isin + (elegido.nota ?? '')} defaultValue={elegido.nota ?? ''} rows={2} placeholder="por qué lo sigo" aria-label="Mi nota"
                onBlur={(x) => x.target.value !== (elegido.nota ?? '') && cambiarNota(elegido.isin, x.target.value || null)} className={`${control} w-full`} />
              {quitando === elegido.isin
                ? <p>¿Dejar de seguirlo? Se borra también tu nota. <button onClick={() => quitar(elegido.isin)} className="text-baja hover:underline">Sí, dejar de seguir</button> <button onClick={() => setQuitando(null)} className="text-suave hover:text-texto">cancelar</button></p>
                : <button onClick={() => setQuitando(elegido.isin)} className="w-fit text-suave hover:text-baja">Dejar de seguir <span className="text-[11px]">(x)</span></button>}
            </DetalleFondo>
          </aside>
        )}
        </div>
      )}
      <p className="text-suave">Cifras de las métricas del fondo, en euros («3 años», anualizada). Rentabilidades en verde o rojo según su signo; la posición frente a su categoría, en el color de la nota y al pasar el ratón. Merecen mirarse los fondos con alguna señal de Revisión (salvo «Redundante») o con la nota 2 puntos arriba o abajo en la semana. Tu nota se guarda al salir del campo.</p>
    </div>
  )
}

/** El color de la nota: su posición en la categoría (verde, el mejor cuarto; rojo, el peor). */
const colorNota = (p: number | null) => (p == null ? 'text-acento' : p >= 75 ? 'text-sube' : p <= 25 ? 'text-baja' : 'text-acento')

/** El fondo frente a la cartera elegida: su correlación con ella y, cara a cara, el de su categoría al que sustituiría. */
function Encaje({ f, cartera, div, m, nota }: {
  f: Fila; cartera: ConFondos; div: Diversificacion[]; m: (isin: string, clave: string) => q.Metrica | undefined; nota: (isin: string) => number | undefined
}) {
  const [e] = encaje({ isin: f.isin, categoria: f.fondo.categoria }, [cartera], div)
  const titulo = <p className="rotulo">Encaje con {cartera.cartera.nombre}</p>
  if (e.dentro) return <div>{titulo}<p className="text-suave">Ya está en ella ({cifra(cartera.fondos.find((x) => x.fondo.isin === f.isin)!.peso, 0)} %).</p></div>
  const s = e.sustituye
  const filas: [string, (i: string) => number | undefined, (v: number) => string, (d: number) => string][] = [
    ['Nota', nota, (v) => String(Math.round(v)), (d) => `${d > 0 ? '+' : ''}${Math.round(d)}`],
    ['TER', (i) => m(i, 'hoy|ter')?.valor, ter, (d) => `${d > 0 ? '+' : ''}${cifra(d)}`],
    ['Rentab. 3 años', (i) => m(i, '3a|rentabilidad')?.valor, pct, (d) => pct(d)],
    ['Volat. 3a', (i) => m(i, '3a|volatilidad')?.valor, sinSigno, (d) => pct(d)],
    ['Caída máx. 3a', (i) => m(i, '3a|max_caida')?.valor, pct, (d) => pct(d)],
  ]
  return (
    <div className="space-y-1">
      {titulo}
      <p className="text-suave">{e.correlacion == null ? 'Correlación sin calcular (fuera del universo o cartera cambiada desde el último cálculo).'
        : <>Correlación <span className="text-texto">{cifra(e.correlacion)}</span>{e.percentil != null && ` · diversifica más que el ${Math.round(e.percentil)} % de su categoría`}</>}</p>
      {s ? (
        <>
          <table className="w-full text-right tabular [&_tr>*+*]:pl-2">
            <thead className="text-[11px] text-suave">
              <tr><th /><th className="font-normal">Este</th><th className="font-normal" title={s.nombre}>Sustituido ({cifra(s.peso, 0)} %)</th><th className="font-normal">Dif.</th></tr>
            </thead>
            <tbody>
              {filas.map(([t, valor, formato, dif]) => {
                const a = valor(f.isin), b = valor(s.isin)
                return <tr key={t}><th className="text-left font-normal text-suave">{t}</th><td>{a == null ? '—' : formato(a)}</td><td>{b == null ? '—' : formato(b)}</td><td>{a == null || b == null ? '—' : dif(a - b)}</td></tr>
              })}
            </tbody>
          </table>
          <p className="text-suave">en lugar de <a href={`#/fondo/${s.isin}`} className="text-texto hover:text-acento">{s.nombre}</a></p>
          <a href={`#/simular/${cartera.cartera.id}/${s.isin}/${f.isin}`} className="block text-acento hover:underline">Probar en el simulador →</a>
        </>
      ) : <p className="text-suave">Ningún fondo de su categoría al que sustituir.</p>}
    </div>
  )
}
