import { useEffect, useMemo, useState } from 'react'
import { calcularCartera, cambiosCartera, type RefSerie } from '../calculo/cartera'
import type { Composicion } from '../calculo/exposicion'
import { cifra, fecha, hoy, pct } from '../calculo/formato'
import { rendimientos, simularCartera, type Bandas } from '../calculo/metricas'
import { lineasCartera, type Punto } from '../calculo/series'
import Buscador from '../componentes/Buscador'
import EstadisticasCartera from '../componentes/EstadisticasCartera'
import Exposicion from '../componentes/Exposicion'
import Grafico from '../componentes/Grafico'
import * as q from '../datos/consultas'
import { revisar, type FondoRevisado } from '../datos/revision'
import { serieEur } from '../datos/series'

/** Lo que hace falta de cada fondo: precios en EUR, composición, métricas y serie de referencia. */
export type DatosFondo = { serie: Punto[]; comp: Composicion | null; fechaCartera: string | null; metricas: Map<string, number>; ref: RefSerie | null }
type Linea = { fondo: q.Fondo; peso: number }
type Borrador = q.CarteraEditable & { fondos: Linea[]; motivo: string }

const REVISION = { diaria: 'cada día', mensual: 'cada mes', trimestral: 'cada trimestre', semestral: 'cada semestre', anual: 'cada año' }
const textoBandas = (b: Bandas) =>
  `por bandas de ±${cifra(b.banda, 1)} ${b.tipo === 'relativa' ? '% del peso de cada fondo' : 'puntos'}, revisadas ${REVISION[b.revision]}`

export async function cargarFondo(f: q.Fondo, cats: Awaited<ReturnType<typeof q.categoriasReferencia>>): Promise<DatosFondo> {
  const clave = q.claveReferencia(f, cats)
  const [serie, ms, comps, refs] = await Promise.all([
    serieEur(f.isin, f.divisa),
    q.metricasDe([f.isin]),
    q.composiciones([f.isin]),
    q.referenciaSeries(clave ? [clave] : []),
  ])
  return {
    serie,
    comp: comps[0]?.datos ?? null,
    fechaCartera: comps[0]?.fecha_cartera ?? null,
    metricas: new Map(ms.map((m) => [`${m.ventana}|${m.nombre}`, Number(m.valor)])),
    ref: (clave && refs.get(clave)) || null,
  }
}

/** Una cartera modelo: fondos y pesos, valor simulado, estadísticas y X-Ray. Se edita aquí y todo se recalcula al momento. */
export default function Cartera({ id }: { id: number }) {
  const [guardada, setGuardada] = useState<{ cartera: q.Cartera; fondos: Linea[] } | null | undefined>(undefined)
  const [cats, setCats] = useState<Awaited<ReturnType<typeof q.categoriasReferencia>> | null>(null)
  const [rf, setRf] = useState<Map<string, number>>(new Map())
  const [datos, setDatos] = useState<Map<string, DatosFondo>>(new Map())
  const [historial, setHistorial] = useState<q.Cambio[]>([])
  const [borrador, setBorrador] = useState<Borrador | null>(null)
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [revision, setRevision] = useState<Map<string, FondoRevisado>>(new Map())
  const [avisoDiv, setAvisoDiv] = useState<string | null>(null)

  async function leer() {
    const [c, cs, estr, h] = await Promise.all([q.cartera(id), q.categoriasReferencia(), q.referenciaSeries(['indice:estr']), q.cambios(id)])
    setCats(cs)
    setRf(rendimientos(estr.get('indice:estr')?.semanal ?? new Map()))
    setHistorial(h)
    setGuardada(c)
    if (c?.fondos.length) q.baseDiversificacion(id).then((b) => setAvisoDiv(q.avisoDiversificacion(b, c.fondos.map((f) => f.fondo.isin)))).catch((e: Error) => setError(e.message))
    revisar([id]).then((r) => setRevision(new Map(r.carteras[0]?.fondos.map((f) => [f.fondo.isin, f])))).catch((e: Error) => setError(e.message))
    if (c && !c.fondos.length) setBorrador({ ...c.cartera, fondos: [], motivo: '' }) // cartera nueva: directa a editar
  }
  useEffect(() => {
    leer().catch((e: Error) => setError(e.message))
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const cartera = borrador ?? (guardada ? { ...guardada.cartera, fondos: guardada.fondos } : null)
  const lineas = cartera?.fondos ?? []

  // Carga lo que falte de cada fondo (también los que se añaden al editar)
  const faltan = lineas.filter((l) => !datos.has(l.fondo.isin)).map((l) => l.fondo)
  useEffect(() => {
    if (!cats || !faltan.length) return
    let vigente = true
    Promise.all(faltan.map(async (f) => [f.isin, await cargarFondo(f, cats)] as const))
      .then((nuevos) => vigente && setDatos((d) => new Map([...d, ...nuevos])))
      .catch((e: Error) => setError(e.message))
    return () => { vigente = false }
  }, [cats, faltan.map((f) => f.isin).join()]) // eslint-disable-line react-hooks/exhaustive-deps

  const listos = lineas.length > 0 && lineas.every((l) => datos.has(l.fondo.isin))
  const conPeso = lineas.filter((l) => l.peso > 0)
  const fondosCalc = useMemo(
    () => (listos ? conPeso.map((l) => ({ isin: l.fondo.isin, peso: l.peso, ...datos.get(l.fondo.isin)!, vol3: datos.get(l.fondo.isin)!.metricas.get('3a|volatilidad') ?? null })) : []),
    [listos, datos, JSON.stringify(conPeso.map((l) => [l.fondo.isin, l.peso]))], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const reb = cartera?.rebalanceo ?? 'anual'
  const bandas = useMemo<Bandas>(() => ({ banda: cartera?.banda || 5, tipo: cartera?.banda_tipo ?? 'puntos', revision: cartera?.revision ?? 'diaria' }),
    [cartera?.banda, cartera?.banda_tipo, cartera?.revision])
  const simulacion = useMemo(() => simularCartera(fondosCalc, reb, bandas), [fondosCalc, reb, bandas])
  const sim = simulacion.valor
  const calc = useMemo(() => (fondosCalc.length ? calcularCartera(fondosCalc, reb, rf, hoy(), bandas) : null), [fondosCalc, reb, rf, bandas])

  if (error) return <p className="text-baja">No se ha podido leer o guardar la cartera: {error}</p>
  if (guardada === undefined) return <p className="text-suave">Cargando…</p>
  if (!guardada || !cartera) return <p className="text-suave">No existe esa cartera.</p>

  const suma = lineas.reduce((s, l) => s + l.peso, 0)
  const sinDatos = conPeso.filter((l) => datos.get(l.fondo.isin)?.serie.length === 0)
  const limita = [...fondosCalc].filter((f) => f.serie.length).sort((a, b) => b.serie[0].fecha.localeCompare(a.serie[0].fecha))[0]
  const nombreDe = (isin: string) => lineas.find((l) => l.fondo.isin === isin)?.fondo.nombre ?? guardada.fondos.find((l) => l.fondo.isin === isin)?.fondo.nombre ?? isin
  const editar = (cambio: Partial<Borrador>) => setBorrador((b) => (b ? { ...b, ...cambio } : b))
  const puedeGuardar = borrador && borrador.nombre.trim() && borrador.banda > 0 && borrador.banda <= 100 && lineas.length > 0 && Math.abs(suma - 100) < 0.01 && lineas.every((l) => l.peso > 0)

  async function hacer(accion: () => Promise<void>) {
    setOcupado(true)
    try { await accion() } catch (e) { setError((e as Error).message) } finally { setOcupado(false) }
  }

  async function guardar() {
    if (!borrador) return
    const cambios = cambiosCartera(new Map(guardada!.fondos.map((l) => [l.fondo.isin, l.peso])), new Map(borrador.fondos.map((l) => [l.fondo.isin, l.peso])),
      borrador.motivo, nombreDe)
    await q.guardarCartera(id, { nombre: borrador.nombre.trim(), objetivo: borrador.objetivo?.trim() || null, rebalanceo: borrador.rebalanceo, banda: borrador.banda, banda_tipo: borrador.banda_tipo, revision: borrador.revision },
      borrador.fondos.map((l) => ({ isin: l.fondo.isin, peso: l.peso })), cambios)
    setBorrador(null)
    await leer()
  }

  async function duplicar() {
    const { id: _, nombre, ...resto } = guardada!.cartera
    const nuevo = await q.crearCartera({ ...resto, nombre: `${nombre} (copia)` },
      guardada!.fondos.map((l) => ({ isin: l.fondo.isin, peso: l.peso })))
    location.hash = `#/cartera/${nuevo}`
  }

  async function archivar() {
    if (!confirm(`¿Archivar «${guardada!.cartera.nombre}»? Deja de verse y de actualizarse a diario.`)) return
    await q.archivarCartera(id)
    location.hash = '#/'
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        {borrador ? (
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <input value={borrador.nombre} onChange={(e) => editar({ nombre: e.target.value })} aria-label="Nombre de la cartera"
              className="border border-borde bg-panel px-2 py-1 text-lg font-bold text-acento outline-none focus:border-acento" />
            <div className="flex flex-wrap gap-2">
              <label className="flex items-center gap-2 text-suave">
                rebalanceo
                <select value={borrador.rebalanceo} onChange={(e) => editar({ rebalanceo: e.target.value as q.Rebalanceo })}
                  className="border border-borde bg-panel px-2 py-1 text-texto">
                  <option value="mensual">mensual</option>
                  <option value="trimestral">trimestral</option>
                  <option value="semestral">semestral</option>
                  <option value="anual">anual</option>
                  <option value="bandas">por bandas</option>
                  <option value="ninguno">ninguno (los pesos derivan)</option>
                </select>
              </label>
              {borrador.rebalanceo === 'bandas' && (
                <label className="flex flex-wrap items-center gap-2 text-suave">
                  ±
                  <input type="number" min={0.5} max={100} step={0.5} value={borrador.banda} aria-label="Banda"
                    onChange={(e) => editar({ banda: Number(e.target.value) })}
                    className="w-16 border border-borde bg-panel px-1 py-1 text-right text-texto outline-none focus:border-acento" />
                  <select value={borrador.banda_tipo} onChange={(e) => editar({ banda_tipo: e.target.value as Bandas['tipo'] })}
                    aria-label="Tipo de banda" className="border border-borde bg-panel px-2 py-1 text-texto">
                    <option value="puntos">puntos</option>
                    <option value="relativa">% del peso de cada fondo</option>
                  </select>
                  revisada
                  <select value={borrador.revision} onChange={(e) => editar({ revision: e.target.value as Bandas['revision'] })}
                    aria-label="Revisión de la banda" className="border border-borde bg-panel px-2 py-1 text-texto">
                    <option value="diaria">cada día</option>
                    <option value="mensual">al final de cada mes</option>
                    <option value="trimestral">al final de cada trimestre</option>
                    <option value="semestral">al final de cada semestre</option>
                    <option value="anual">al final de cada año</option>
                  </select>
                </label>
              )}
              <input value={borrador.objetivo ?? ''} onChange={(e) => editar({ objetivo: e.target.value })} placeholder="objetivo (opcional)"
                aria-label="Objetivo" className="min-w-0 flex-1 border border-borde bg-panel px-2 py-1 outline-none focus:border-acento" />
            </div>
          </div>
        ) : (
          <div>
            <h1 className="text-lg font-bold text-acento">{cartera.nombre}</h1>
            <p className="text-suave">
              {lineas.length} fondos · rebalanceo {cartera.rebalanceo === 'bandas' ? textoBandas(bandas) : cartera.rebalanceo}
              {cartera.objetivo && ` · ${cartera.objetivo}`}
            </p>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {borrador ? (
            <>
              <button onClick={() => hacer(guardar)} disabled={!puedeGuardar || ocupado}
                className="min-h-9 border border-acento px-3 text-acento disabled:border-borde disabled:text-suave">guardar</button>
              {guardada.fondos.length > 0 && (
                <button onClick={() => setBorrador(null)} disabled={ocupado} className="min-h-9 border border-borde px-3 text-suave hover:text-texto">cancelar</button>
              )}
            </>
          ) : (
            <>
              <button onClick={() => setBorrador({ ...guardada.cartera, fondos: guardada.fondos, motivo: '' })}
                className="min-h-9 border border-borde px-3 text-suave hover:text-texto">editar</button>
              <a href={`#/simular/${id}`} title="Atajo: m" className="min-h-9 border border-borde px-3 py-1.5 text-suave hover:text-texto">simular cambios</a>
              <button onClick={() => hacer(duplicar)} disabled={ocupado} className="min-h-9 border border-borde px-3 text-suave hover:text-texto">duplicar</button>
              <button onClick={() => hacer(archivar)} disabled={ocupado} className="min-h-9 border border-borde px-3 text-suave hover:text-baja">archivar</button>
            </>
          )}
        </div>
      </header>

      {borrador && (
        <p className="text-aviso">
          Editando: las cifras de abajo ya reflejan los cambios, pero no se guardan hasta pulsar «guardar».
          {Math.abs(suma - 100) >= 0.01 && <> Los pesos suman {suma} %; tienen que sumar 100 %.</>}
        </p>
      )}
      {!borrador && Math.abs(suma - 100) > 0.01 && <p className="text-baja">Los pesos suman {suma} %, no 100 %.</p>}
      {!borrador && avisoDiv && <p role="status" className="text-aviso">{avisoDiv}</p>}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[48rem] whitespace-nowrap text-right [&_tr>*+*]:pl-3">
          <thead className="text-[11px] uppercase tracking-widest text-suave">
            <tr className="border-b border-borde">
              <th className="py-1 text-left font-normal">Fondo</th>
              <th className="font-normal">Peso</th>
              <th className="font-normal">TER</th>
              <th className="font-normal">3A anual</th>
              <th className="font-normal">5A anual</th>
              <th className="font-normal">Nota</th>
              <th className="text-left font-normal">Señales</th>
              {borrador && <th />}
            </tr>
          </thead>
          <tbody>
            {lineas.map(({ fondo: f, peso }, k) => {
              const m = datos.get(f.isin)?.metricas
              const r = revision.get(f.isin)
              return (
                <tr key={f.isin} className={`border-b border-borde/50 ${r?.senales.length ? 'bg-aviso/5' : ''}`}>
                  <td className="whitespace-normal py-1 text-left">
                    <a href={`#/fondo/${f.isin}`} className="hover:text-acento">{f.nombre}</a>
                    <span className="text-suave"> · {f.isin}</span>
                  </td>
                  <td>
                    {borrador ? (
                      <input type="number" min={0} max={100} step={0.5} value={peso} aria-label={`Peso de ${f.nombre}`}
                        onChange={(e) => editar({ fondos: lineas.map((l, j) => (j === k ? { ...l, peso: Number(e.target.value) } : l)) })}
                        className="w-16 border border-borde bg-panel px-1 py-0.5 text-right outline-none focus:border-acento" />
                    ) : pct(peso / 100, 0, false)}
                  </td>
                  <td>{pct((f.ter ?? NaN) / 100, 2, false)}</td>
                  <td>{pct(m?.get('3a|rentabilidad'))}</td>
                  <td>{pct(m?.get('5a|rentabilidad'))}</td>
                  <td>{r?.nota ? <>{Math.round(r.nota.nota)}{r.nota.percentil != null && <span className="text-suave"> p{Math.round(r.nota.percentil)}</span>}</> : <span className="text-suave">—</span>}</td>
                  <td className="whitespace-normal text-left">
                    {r?.senales.map((s) => <a key={s.tipo} href="#/revision" title={s.motivo} className="mr-1 inline-block border border-aviso px-1.5 text-aviso">{s.tipo}</a>)}
                  </td>
                  {borrador && (
                    <td>
                      <button onClick={() => editar({ fondos: lineas.filter((_, j) => j !== k) })} aria-label={`Quitar ${f.nombre}`}
                        className="min-h-8 px-2 text-suave hover:text-baja">quitar</button>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {borrador && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Buscador texto="añadir fondo: nombre o ISIN" onElegir={(f) => !lineas.some((l) => l.fondo.isin === f.isin) && editar({ fondos: [...lineas, { fondo: f, peso: 0 }] })} />
          <input value={borrador.motivo} onChange={(e) => editar({ motivo: e.target.value })} placeholder="motivo del cambio (opcional, va al historial)"
            aria-label="Motivo del cambio" className="flex-1 border border-borde bg-panel px-2 py-1 outline-none focus:border-acento" />
        </div>
      )}

      {lineas.length > 0 && (
        <section>
          <h2 className="mb-2 text-[11px] uppercase tracking-widest text-suave">Valor simulado (base 100)</h2>
          {!listos ? (
            <p className="text-suave">Cargando precios…</p>
          ) : sinDatos.length ? (
            <p className="text-suave">Sin precios todavía: {sinDatos.map((l) => l.fondo.nombre).join(', ')}. Se cargan en la próxima descarga (los fondos de una cartera se descargan cada día).</p>
          ) : (
            <>
              <p className="mb-2 text-suave">Desde {fecha(sim[0]?.fecha)}, limitada por {limita && nombreDe(limita.isin)} · {simulacion.rebalanceos} rebalanceos.</p>
              <Grafico lineas={lineasCartera(cartera.nombre, sim, calc?.referenciaSerie ?? [])} />
              {calc?.referenciaSerie.length ? (
                <p className="mt-1 text-suave">
                  Referencia: la de cada fondo combinada con sus pesos{calc.referenciaSerie[0].fecha > sim[0].fecha && `; empieza el ${fecha(calc.referenciaSerie[0].fecha)}, desde el nivel de la cartera ese día`}.
                </p>
              ) : null}
            </>
          )}
        </section>
      )}

      {listos && !sinDatos.length && (
        <EstadisticasCartera
          calc={calc}
          fondos={conPeso.map((l) => ({ isin: l.fondo.isin, nombre: l.fondo.nombre, peso: l.peso, ter: l.fondo.ter, c: datos.get(l.fondo.isin)!.comp }))}
        />
      )}

      {listos && (
        <Exposicion
          fondos={conPeso.map((l) => {
            const d = datos.get(l.fondo.isin)!
            return { peso: l.peso, nombre: l.fondo.nombre, c: d.comp, duracion: l.fondo.duracion_efectiva, fechaCartera: d.fechaCartera }
          })}
        />
      )}

      {historial.length > 0 && (
        <section>
          <h2 className="mb-2 text-[11px] uppercase tracking-widest text-suave">Cambios</h2>
          <ul className="space-y-1">
            {historial.map((c, i) => (
              <li key={i}>
                <span className="text-suave">{fecha(c.fecha)} · </span>
                {c.sale && <span className="text-baja">sale {nombreDe(c.sale)} </span>}
                {c.entra && <span className="text-sube">entra {nombreDe(c.entra)} </span>}
                {c.motivo && <span className="text-suave">{c.sale || c.entra ? '· ' : ''}{c.motivo}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
