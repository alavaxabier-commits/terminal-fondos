import { useEffect, useMemo, useState } from 'react'
import { calcularCartera, cambiosCartera, type RefSerie } from '../calculo/cartera'
import type { Composicion } from '../calculo/exposicion'
import { cifra, fecha, hoy, pct } from '../calculo/formato'
import { rendimientos, simularCartera, type Bandas } from '../calculo/metricas'
import { exposicion } from '../calculo/exposicion'
import { base100, haceAnos, lineasCartera, type Punto } from '../calculo/series'
import Buscador from '../componentes/Buscador'
import Reparto from '../componentes/Reparto'
import { Aportacion, AnoAno, costeCartera, Crisis, Juntos, MetricasCartera, Solapes } from '../componentes/EstadisticasCartera'
import Exposicion from '../componentes/Exposicion'
import Franja from '../componentes/Franja'
import Grafico from '../componentes/Grafico'
import Tarjeta from '../componentes/Tarjeta'
import { escribiendo } from '../componentes/teclas'
import * as q from '../datos/consultas'
import { revisar, type FondoRevisado } from '../datos/revision'
import { serieEur } from '../datos/series'
import { Pastilla } from './Ficha'
import Cargando from '../componentes/Cargando'

/** Lo que hace falta de cada fondo: precios en EUR, composición, métricas y serie de referencia. */
export type DatosFondo = { serie: Punto[]; comp: Composicion | null; fechaCartera: string | null; metricas: Map<string, number>; ref: RefSerie | null }
type Linea = { fondo: q.Fondo; peso: number }
type Borrador = q.CarteraEditable & { fondos: Linea[]; motivo: string }

const PESTANAS = ['resumen', 'fondos', 'métricas', 'exposición', 'cambios'] as const
type Pestana = (typeof PESTANAS)[number]
const RANGOS = [['1A', 1], ['3A', 3], ['5A', 5], ['10A', 10], ['Todo', 0]] as const
const campo = 'rounded-md border border-borde bg-panel px-2 py-1 text-texto outline-none focus:border-acento'
const tono = (v: number | null | undefined) => (v == null ? 'text-suave' : v >= 0 ? 'text-sube' : 'text-baja')

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
  const [pestana, setPestana] = useState<Pestana>('resumen')
  const [rango, setRango] = useState(0)

  async function leer() {
    const [c, cs, estr, h] = await Promise.all([q.cartera(id), q.categoriasReferencia(), q.referenciaSeries(['indice:estr']), q.cambios(id)])
    setCats(cs)
    setRf(rendimientos(estr.get('indice:estr')?.semanal ?? new Map()))
    setHistorial(h)
    setGuardada(c)
    if (c?.fondos.length) q.baseDiversificacion(id).then((b) => setAvisoDiv(q.avisoDiversificacion(b, c.fondos.map((f) => f.fondo.isin)))).catch((e: Error) => setError(e.message))
    revisar([id]).then((r) => setRevision(new Map(r.carteras[0]?.fondos.map((f) => [f.fondo.isin, f])))).catch((e: Error) => setError(e.message))
    if (c && !c.fondos.length) { setBorrador({ ...c.cartera, fondos: [], motivo: '' }); setPestana('fondos') } // cartera nueva: directa a editar
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
  const grafica = useMemo(() => {
    if (sim.length < 2) return []
    const desde = rango ? haceAnos(sim.at(-1)!.fecha, rango) : sim[0].fecha
    return lineasCartera(cartera?.nombre ?? 'Cartera', base100(sim, desde < sim[0].fecha ? sim[0].fecha : desde), calc?.referenciaSerie ?? [])
  }, [sim, rango, calc, cartera?.nombre])

  // ← y → cambian de pestaña, como en la ficha
  const pestanas = PESTANAS.filter((p) => p !== 'cambios' || historial.length > 0)
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (escribiendo(e) || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return
      const i = pestanas.indexOf(pestana) + (e.key === 'ArrowRight' ? 1 : -1)
      if (pestanas[i]) setPestana(pestanas[i])
    }
    addEventListener('keydown', tecla)
    return () => removeEventListener('keydown', tecla)
  })

  if (error) return <p className="text-baja">No se ha podido leer o guardar la cartera: {error}</p>
  if (guardada === undefined) return <Cargando pagina />
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

  const ter = (f: q.Fondo) => (f.ter == null ? null : Number(f.ter))
  const fondosE = conPeso.map((l) => ({ isin: l.fondo.isin, nombre: l.fondo.nombre, peso: l.peso, ter: ter(l.fondo), c: datos.get(l.fondo.isin)?.comp ?? null }))
  const coste = costeCartera(fondosE)
  const expo = listos ? exposicion(fondosE.map((f) => ({ peso: f.peso, nombre: f.nombre, c: f.c }))) : null
  const nSenales = [...revision.values()].reduce((n, r) => n + r.senales.length, 0)
  const m = calc?.metricas
  const ref = calc?.referencia ?? {}
  const ytd = m?.ytd?.rentabilidad
  const pesoHoy = new Map(calc?.fondos.map((f) => [f.isin, f.pesoHoy]))
  const hayCalculo = listos && !sinDatos.length
  const porPeso = [...lineas].sort((x, y) => y.peso - x.peso).map((l) => ({ isin: l.fondo.isin as string | null, nombre: l.fondo.nombre, peso: l.peso, otros: 0 }))
  const principales = porPeso.length > 10
    ? [...porPeso.slice(0, 9), { isin: null, nombre: '', peso: porPeso.slice(9).reduce((t, l) => t + l.peso, 0), otros: porPeso.length - 9 }]
    : porPeso
  const sinCalculo = !lineas.length ? <p className="text-suave">La cartera no tiene fondos todavía: añádelos en «Fondos».</p>
    : !listos ? <p className="text-suave">Cargando precios…</p>
    : sinDatos.length ? <p className="text-suave">Sin precios todavía: {sinDatos.map((l) => l.fondo.nombre).join(', ')}. Se cargan en la próxima descarga (los fondos de una cartera se descargan cada día).</p>
    : <p className="text-suave">Sin historia común suficiente entre los fondos para calcular la cartera.</p>
  const rangos = RANGOS.filter(([, n]) => !n || (sim.length > 1 && haceAnos(sim.at(-1)!.fecha, n) >= sim[0].fecha))

  return (
    <article className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
        {borrador ? (
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <p className="rotulo text-acento!">Cartera modelo · editando</p>
            <input value={borrador.nombre} onChange={(e) => editar({ nombre: e.target.value })} aria-label="Nombre de la cartera"
              className={`${campo} text-3xl font-medium tracking-tight`} />
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <label className="flex items-center gap-2 text-suave">
                Rebalanceo
                <select value={borrador.rebalanceo} onChange={(e) => editar({ rebalanceo: e.target.value as q.Rebalanceo })} className={campo}>
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
                    onChange={(e) => editar({ banda: Number(e.target.value) })} className={`${campo} w-16 text-right`} />
                  <select value={borrador.banda_tipo} onChange={(e) => editar({ banda_tipo: e.target.value as Bandas['tipo'] })}
                    aria-label="Tipo de banda" className={campo}>
                    <option value="puntos">puntos</option>
                    <option value="relativa">% del peso de cada fondo</option>
                  </select>
                  revisada
                  <select value={borrador.revision} onChange={(e) => editar({ revision: e.target.value as Bandas['revision'] })}
                    aria-label="Revisión de la banda" className={campo}>
                    <option value="diaria">cada día</option>
                    <option value="mensual">al final de cada mes</option>
                    <option value="trimestral">al final de cada trimestre</option>
                    <option value="semestral">al final de cada semestre</option>
                    <option value="anual">al final de cada año</option>
                  </select>
                </label>
              )}
              <input value={borrador.objetivo ?? ''} onChange={(e) => editar({ objetivo: e.target.value })} placeholder="Objetivo (opcional)"
                aria-label="Objetivo" className={`${campo} min-w-0 flex-1`} />
            </div>
          </div>
        ) : (
          <div className="min-w-0 space-y-2">
            <p className="rotulo text-acento!">Cartera modelo{cartera.objetivo && ` · ${cartera.objetivo}`}</p>
            <h1 className="text-3xl! sm:text-4xl!">{cartera.nombre}</h1>
            <div className="flex flex-wrap gap-1.5 text-suave">
              <Pastilla>{lineas.length} {lineas.length === 1 ? 'fondo' : 'fondos'}</Pastilla>
              <Pastilla>Rebalanceo {cartera.rebalanceo === 'bandas' ? textoBandas(bandas) : cartera.rebalanceo}</Pastilla>
              {nSenales > 0 && <a href="#/revision"><Pastilla className="bg-aviso/15! text-aviso">{nSenales} {nSenales === 1 ? 'señal' : 'señales'} de revisión</Pastilla></a>}
            </div>
          </div>
        )}
        <div>
          <div className="flex flex-wrap justify-end gap-2">
            {borrador ? (
              <>
                {guardada.fondos.length > 0 && (
                  <button onClick={() => setBorrador(null)} disabled={ocupado} className="boton">Cancelar</button>
                )}
                <button onClick={() => hacer(guardar)} disabled={!puedeGuardar || ocupado}
                  className="boton-pri">Guardar</button>
              </>
            ) : (
              <>
                <a href={`#/simular/${id}`} title="Atajo: m" className="boton">Simular cambios</a>
                <button onClick={() => hacer(duplicar)} disabled={ocupado} className="boton">Duplicar</button>
                <button onClick={() => hacer(archivar)} disabled={ocupado} className="boton hover:text-baja">Archivar</button>
                <button onClick={() => { setBorrador({ ...guardada.cartera, fondos: guardada.fondos, motivo: '' }); setPestana('fondos') }}
                  className="boton-pri">Editar</button>
              </>
            )}
          </div>
        </div>
      </header>

      {calc && (
        <>
          <Franja cifras={[
            { etiqueta: 'Este año', valor: pct(ytd), clase: tono(ytd), pie: ref.ytd?.rentabilidad != null ? `referencia ${pct(ref.ytd.rentabilidad)}` : 'sin referencia' },
            ...([['3 años, anual', 'rentabilidad', (v: number) => pct(v), true], ['Volatilidad 3 años', 'volatilidad', (v: number) => pct(v, 1, false), false],
              ['Sharpe 3 años', 'sharpe', (v: number) => cifra(v), false]] as const).map(([et, k, fmt, color]) => {
              const v = m?.['3a']?.[k]
              const r = ref['3a']?.[k]
              return { etiqueta: et, valor: v == null ? '—' : fmt(v), clase: color ? tono(v) : '', pie: r == null ? 'sin referencia' : `referencia ${fmt(r)}` }
            }),
            { etiqueta: 'Coste anual', valor: coste == null ? '—' : pct(coste / 100, 2, false), pie: 'TER ponderado' },
          ]} />
          <p className="text-[13px] text-suave">
            Simulada desde el {fecha(calc.desde)} hasta el {fecha(calc.hasta)}{calc.ultimoRebalanceo && ` · último rebalanceo ${fecha(calc.ultimoRebalanceo)}`}
          </p>
        </>
      )}
      {borrador && (
        <p className="rounded-lg bg-aviso/10 px-3 py-2 text-[13px] text-aviso">
          Editando: las cifras ya reflejan los cambios, pero no se guardan hasta pulsar «Guardar».
          {Math.abs(suma - 100) >= 0.01 && <> Los pesos suman {cifra(suma, 1)} %; tienen que sumar 100 %.</>}
        </p>
      )}
      {!borrador && Math.abs(suma - 100) > 0.01 && <p className="text-baja">Los pesos suman {cifra(suma, 1)} %, no 100 %.</p>}
      {!borrador && avisoDiv && <p role="status" className="text-[13px] text-aviso">{avisoDiv}</p>}

      <div role="tablist" aria-label="Secciones de la cartera" className="flex flex-wrap gap-5 border-b border-borde">
        {pestanas.map((p) => (
          <button key={p} id={`pestana-${p}`} role="tab" aria-selected={pestana === p} aria-controls="panel-cartera" onClick={() => setPestana(p)}
            className={`-mb-px border-b-2 pb-1.5 capitalize ${pestana === p ? 'border-acento text-texto' : 'border-transparent text-suave hover:text-texto'}`}>
            {p}{p === 'fondos' ? ` · ${lineas.length}` : p === 'cambios' ? ` · ${historial.length}` : ''}
          </button>
        ))}
        <span className="ml-auto self-center text-[11px] text-suave">← → cambiar</span>
      </div>

      <div id="panel-cartera" role="tabpanel" aria-labelledby={`pestana-${pestana}`} className="space-y-5">
        {pestana === 'resumen' && (
          <>
            <Tarjeta>
              <div className={lineas.length ? 'grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]' : ''}>
                <div className="min-w-0">
                  {hayCalculo && sim.length > 1 ? (
                    <>
                      <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                          <span className="cifra text-5xl tabular">{cifra(grafica[0]?.serie.at(-1)?.valor, 1)}</span>
                          {ytd != null && <span className={`rounded-sm px-2 text-[12px] tabular ${tono(ytd)} ${ytd >= 0 ? 'bg-sube/10' : 'bg-baja/10'}`}>{pct(ytd)} este año</span>}
                          <span className="text-[12px] text-suave">valor simulado, base 100 al inicio del periodo</span>
                        </div>
                        <div role="group" aria-label="Periodo del gráfico" className="flex gap-0.5 rounded-sm bg-borde/50 p-0.5 text-[12px]">
                          {rangos.map(([etiqueta, n]) => (
                            <button key={etiqueta} onClick={() => setRango(n)} aria-pressed={rango === n}
                              className={`rounded-sm px-3 py-0.5 ${rango === n ? 'bg-panel text-texto ring-1 ring-borde' : 'text-suave hover:text-texto'}`}>{etiqueta}</button>
                          ))}
                        </div>
                      </div>
                      <Grafico lineas={grafica} />
                      <p className="text-[11px] text-suave">
                        Desde el {fecha(sim[0]?.fecha)}, limitada por {limita && nombreDe(limita.isin)} · {simulacion.rebalanceos} rebalanceos
                        {calc?.referenciaSerie.length ? <> · referencia: la de cada fondo combinada con sus pesos{calc.referenciaSerie[0].fecha > sim[0].fecha && `, desde el ${fecha(calc.referenciaSerie[0].fecha)}`}</> : null}.
                      </p>
                    </>
                  ) : sinCalculo}
                </div>
                {lineas.length > 0 && (
                  <div className="flex min-w-0 flex-col border-borde lg:border-l lg:pl-6">
                    <div className="mb-3 flex items-baseline justify-between gap-3">
                      <h2 className="text-[15px] font-semibold tracking-tight">Fondos</h2>
                      <button onClick={() => setPestana('fondos')} className="text-[12px] text-suave hover:text-acento">Ver todos →</button>
                    </div>
                    <ul className="space-y-2">
                      {principales.map(({ isin, nombre, peso, otros }) => {
                        const r = isin ? revision.get(isin) : undefined
                        const hoyP = isin ? pesoHoy.get(isin) : undefined
                        return (
                          <li key={isin ?? 'otros'} className="text-[13px]">
                            <div className="flex items-baseline justify-between gap-3">
                              <span className="flex min-w-0 items-baseline gap-1.5">
                                {r?.senales.length ? <span className="shrink-0 text-[10px] text-aviso" title={r.senales.map((x) => `${x.tipo}: ${x.motivo}`).join(' · ')} aria-label="Con señales de revisión">●</span> : null}
                                {isin ? <a href={`#/fondo/${isin}`} className="min-w-0 truncate hover:text-acento">{nombre}</a>
                                  : <span className="text-suave">Otros {otros} fondos</span>}
                              </span>
                              <span className="shrink-0 tabular">{pct(peso / 100, 0, false)}</span>
                            </div>
                            <div className="relative mt-1 h-1 rounded-sm bg-borde/60" title={hoyP != null ? `Hoy ${pct(hoyP, 1, false)}` : undefined}>
                              <span className={`absolute inset-y-0 left-0 rounded-sm ${isin ? 'bg-acento' : 'bg-suave'}`} style={{ width: `${Math.min(peso, 100)}%` }} />
                              {hoyP != null && Math.abs(hoyP * 100 - peso) >= 0.5 && <span className="absolute -top-0.5 h-2 w-0.5 rounded-sm bg-texto" style={{ left: `${Math.min(hoyP * 100, 100)}%` }} />}
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                    {calc && <p className="mt-auto pt-3 text-[11px] text-suave">Barra: peso objetivo · marca: peso de hoy.</p>}
                  </div>
                )}
              </div>
            </Tarjeta>


            {calc && <AnoAno calc={calc} />}
            <div className="grid gap-4 lg:grid-cols-2">
              {calc && <Crisis calc={calc} />}
              <Tarjeta titulo="Tipo de activo">
                {expo ? <Reparto activos={expo.activos} cobertura={expo.cobertura} /> : <Cargando alto="h-14" />}
              </Tarjeta>
            </div>
          </>
        )}

        {pestana === 'fondos' && (
          <>
            <Tarjeta titulo={borrador ? 'Fondos y pesos' : 'Fondos'} extra={<span className={`text-[12px] tabular ${Math.abs(suma - 100) >= 0.01 ? 'text-baja' : 'text-suave'}`}>suman {cifra(suma, 1)} %</span>}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[60rem] whitespace-nowrap text-right tabular text-[13px]">
                  <thead>
                    <tr className="text-[12px] text-suave">
                      <th className="pb-1.5 text-left font-normal">Fondo</th>
                      <th className="pl-3 font-normal">Peso</th>
                      <th className="pl-3 font-normal">TER</th>
                      <th className="pl-3 font-normal" title="Rentabilidad anualizada a 3 años">Rent. 3a</th>
                      <th className="pl-3 font-normal" title="Volatilidad a 3 años">Volat. 3a</th>
                      <th className="pl-3 font-normal" title="Máxima caída a 3 años">Caída 3a</th>
                      <th className="pl-3 font-normal" title="Sharpe a 3 años">Sharpe 3a</th>
                      <th className="pl-3 font-normal" title="Rentabilidad anualizada a 5 años">Rent. 5a</th>
                      <th className="pl-3 font-normal">Nota</th>
                      <th className="pl-3 text-left font-normal">Señales</th>
                      {borrador && <th />}
                    </tr>
                  </thead>
                  <tbody>
                    {lineas.map(({ fondo: f, peso }, k) => {
                      const mf = datos.get(f.isin)?.metricas
                      const r = revision.get(f.isin)
                      return (
                        <tr key={f.isin} className={`border-t border-borde/60 ${r?.senales.length ? 'bg-aviso/5' : ''}`}>
                          <td className="whitespace-normal py-2 text-left">
                            <a href={`#/fondo/${f.isin}`} className="hover:text-acento">{f.nombre}</a>
                            <span className="block text-[12px] text-suave"><span className="font-mono">{f.isin}</span>{f.categoria && ` · ${f.categoria}`}</span>
                          </td>
                          <td className="pl-3">
                            {borrador ? (
                              <input type="number" min={0} max={100} step={0.5} value={peso} aria-label={`Peso de ${f.nombre}`}
                                onChange={(e) => editar({ fondos: lineas.map((l, j) => (j === k ? { ...l, peso: Number(e.target.value) } : l)) })}
                                className={`${campo} w-20 text-right`} />
                            ) : pct(peso / 100, 0, false)}
                          </td>
                          <td className="pl-3">{pct((ter(f) ?? NaN) / 100, 2, false)}</td>
                          <td className={`pl-3 ${tono(mf?.get('3a|rentabilidad'))}`}>{pct(mf?.get('3a|rentabilidad'))}</td>
                          <td className="pl-3">{pct(mf?.get('3a|volatilidad'), 1, false)}</td>
                          <td className="pl-3">{pct(mf?.get('3a|max_caida'))}</td>
                          <td className="pl-3">{cifra(mf?.get('3a|sharpe'))}</td>
                          <td className={`pl-3 ${tono(mf?.get('5a|rentabilidad'))}`}>{pct(mf?.get('5a|rentabilidad'))}</td>
                          <td className="pl-3">{r?.nota ? <>{Math.round(r.nota.nota)}{r.nota.percentil != null && <span className="text-suave"> p{Math.round(r.nota.percentil)}</span>}</> : <span className="text-suave">—</span>}</td>
                          <td className="whitespace-normal pl-3 text-left">
                            {r?.senales.map((s) => <a key={s.tipo} href="#/revision" title={s.motivo} className="mr-1 inline-block rounded-sm bg-aviso/15 px-2 text-[11px] text-aviso">{s.tipo}</a>)}
                          </td>
                          {borrador && (
                            <td className="pl-3">
                              <button onClick={() => editar({ fondos: lineas.filter((_, j) => j !== k) })} aria-label={`Quitar ${f.nombre}`}
                                className="min-h-8 rounded-sm px-3 text-suave hover:bg-baja/10 hover:text-baja">Quitar</button>
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {borrador && (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <Buscador texto="Añadir fondo: nombre o ISIN" onElegir={(f) => !lineas.some((l) => l.fondo.isin === f.isin) && editar({ fondos: [...lineas, { fondo: f, peso: 0 }] })} />
                  <input value={borrador.motivo} onChange={(e) => editar({ motivo: e.target.value })} placeholder="Motivo del cambio (opcional, va al historial)"
                    aria-label="Motivo del cambio" className={`${campo} flex-1`} />
                </div>
              )}
            </Tarjeta>
            {hayCalculo && calc ? (
              <>
                <Aportacion calc={calc} fondos={fondosE} />
                <div className={`grid gap-4 [&>*]:min-w-0 ${fondosE.length <= 5 ? 'lg:grid-cols-2' : ''}`}>
                  <Juntos calc={calc} fondos={fondosE} />
                  <Tarjeta titulo="Posiciones en común"><Solapes fondos={fondosE} titulo={false} /></Tarjeta>
                </div>
              </>
            ) : lineas.length > 0 && sinCalculo}
          </>
        )}

        {pestana === 'métricas' && (hayCalculo && calc ? <MetricasCartera calc={calc} /> : sinCalculo)}

        {pestana === 'exposición' && (listos ? (
          <Exposicion
            fondos={conPeso.map((l) => {
              const d = datos.get(l.fondo.isin)!
              return { peso: l.peso, nombre: l.fondo.nombre, c: d.comp, duracion: l.fondo.duracion_efectiva, fechaCartera: d.fechaCartera }
            })}
          />
        ) : sinCalculo)}

        {pestana === 'cambios' && (
          <Tarjeta titulo="Historial de cambios" extra={<span className="text-[12px] text-suave">del más reciente al más antiguo</span>}>
            <ol className="relative ml-1 space-y-3 border-l border-borde pl-4 text-[13px]">
              {historial.map((c, i) => (
                <li key={i} className="relative">
                  <span aria-hidden="true" className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-sm bg-acento" />
                  <span className="block text-[12px] text-suave">{fecha(c.fecha)}</span>
                  {c.sale && <span className="mr-2 text-baja">Sale {nombreDe(c.sale)}</span>}
                  {c.entra && <span className="mr-2 text-sube">Entra {nombreDe(c.entra)}</span>}
                  {c.motivo && <span className="text-suave">{c.motivo}</span>}
                </li>
              ))}
            </ol>
          </Tarjeta>
        )}
      </div>
    </article>
  )
}
