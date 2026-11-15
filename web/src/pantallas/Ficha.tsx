import { useEffect, useMemo, useState } from 'react'
import { cifra, colorPercentil, fecha, millones, pct } from '../calculo/formato'
import type { Composicion } from '../calculo/exposicion'
import { bloques, PESOS_DEFECTO } from '../calculo/nota'
import { evolucion, type NotaSemanal } from '../calculo/senales'
import { cubierta } from '../calculo/screener'
import { base100, combinar, haceAnos, inicioComun, variacion, type Punto } from '../calculo/series'
import Exposicion from '../componentes/Exposicion'
import Grafico from '../componentes/Grafico'
import TablaNota from '../componentes/TablaNota'
import { escribiendo } from '../componentes/teclas'
import { alternar, MAX_BANDEJA, useBandeja } from '../datos/bandeja'
import * as q from '../datos/consultas'
import { serieEur } from '../datos/series'

type Datos = {
  fondo: q.Fondo
  ref: q.Referencia
  serie: Punto[]
  serieRef: Punto[]
  metricas: q.Metrica[]
  comp: { datos: Composicion; fecha_cartera: string | null } | null
  notas: NotaSemanal[]
  clases: q.Fondo[]
  myinvestor: Set<string>
  carteras: { id: number; nombre: string; peso: number }[]
  seguido: boolean
}

const RANGOS = [['1a', 1], ['3a', 3], ['5a', 5], ['10a', 10]] as const
const PESTANAS = ['resumen', 'métricas', 'exposición', 'clases'] as const
type Pestana = (typeof PESTANAS)[number]

/** Serie del índice de referencia: su sustituto o la combinación de sus componentes. */
async function serieIndice(ind: q.Indice | null): Promise<Punto[]> {
  if (!ind) return []
  if (ind.proxy_isin) return serieEur(ind.proxy_isin, (await q.fondo(ind.proxy_isin))?.divisa ?? null)
  if (ind.componentes?.length) {
    const comps = await q.indices(ind.componentes.map((c) => c.id))
    const series = await Promise.all(
      ind.componentes.map(async (c) => ({ serie: await serieIndice(comps.find((x) => x.id === c.id) ?? null), peso: c.peso })),
    )
    return combinar(series)
  }
  return []
}

async function cargar(isin: string): Promise<Datos | null> {
  const fondo = await q.fondo(isin)
  if (!fondo) return null
  const ref = await q.referencia(fondo)
  const [serie, serieRef, metricas, comps, notas, clases, carteras, seguidos] = await Promise.all([
    serieEur(isin, fondo.divisa), serieIndice(ref.indice), q.metricas(isin), q.composiciones([isin]), q.notasDe([isin]),
    fondo.fund_id ? q.clases(fondo.fund_id) : Promise.resolve([]), q.carterasDe(isin), q.seguimiento(),
  ])
  const myinvestor = await q.enMyinvestor([isin, ...clases.map((c) => c.isin)])
  return { fondo, ref, serie, serieRef, metricas, comp: comps[0] ?? null, notas, clases, myinvestor, carteras,
           seguido: seguidos.some((x) => x.isin === isin) }
}

export const FILAS: [string, string, (v: number) => string][] = [
  ['rentabilidad', 'Rentabilidad anualizada', (v) => pct(v)],
  ['volatilidad', 'Volatilidad', (v) => pct(v, 1, false)],
  ['max_caida', 'Máxima caída', (v) => pct(v)],
  ['sharpe', 'Sharpe', (v) => cifra(v)],
  ['sortino', 'Sortino', (v) => cifra(v)],
  ['alfa', 'Alfa', (v) => pct(v)],
  ['beta', 'Beta', (v) => cifra(v)],
  ['tracking_error', 'Tracking error', (v) => pct(v, 1, false)],
  ['ratio_informacion', 'Ratio de información', (v) => cifra(v)],
  ['volatilidad_mensual', 'Volatilidad (mensual)', (v) => pct(v, 1, false)],
  ['sharpe_mensual', 'Sharpe (mensual)', (v) => cifra(v)],
  ['captura_alcista', 'Captura alcista', (v) => cifra(v, 0)],
  ['captura_bajista', 'Captura bajista', (v) => cifra(v, 0)],
  ['r2', 'R²', (v) => cifra(v, 0)],
  ['acumulada', 'Rentabilidad acumulada', (v) => pct(v)],
]

/** Cuartil en la categoría a partir del percentil (100 = mejor): 1 es el mejor cuarto. */
export const cuartil = (p: number) => (p >= 75 ? 1 : p >= 50 ? 2 : p >= 25 ? 3 : 4)
const FONDO_CUARTIL = ['var(--color-acento)', 'color-mix(in srgb, var(--color-acento) 45%, var(--color-panel))',
  'color-mix(in srgb, var(--color-serie2) 50%, var(--color-panel))', 'color-mix(in srgb, var(--color-serie4) 70%, var(--color-panel))']
function Cuartil({ p }: { p: number | null | undefined }) {
  if (p == null) return <span className="text-suave">—</span>
  const k = cuartil(p)
  return <span title={`Percentil ${Math.round(p)} en su categoría`} className="inline-grid h-5 w-full max-w-9 place-items-center rounded-sm text-[11px] font-medium"
    style={{ background: FONDO_CUARTIL[k - 1], color: k === 1 ? 'var(--color-panel)' : 'var(--color-texto)' }}>{k}</span>
}
/** Percentil como barra fina (100 = mejor dentro de la categoría). */
const BarraPercentil = ({ p }: { p: number }) => (
  <span className="flex items-center gap-2" title={`Percentil ${Math.round(p)} en su categoría (100 = mejor)`}>
    <span className="relative h-1 flex-1 rounded-full bg-borde/70"><span className="absolute inset-y-0 left-0 rounded-full bg-acento" style={{ width: `${p}%` }} /></span>
    <span className={`text-[11px] tabular ${colorPercentil(p)}`}>p{Math.round(p)}</span>
  </span>
)
const Pastilla = ({ children, className = '' }: { children: React.ReactNode; className?: string }) =>
  <span className={`rounded-full bg-borde/50 px-2.5 py-0.5 text-[12px] ${className}`}>{children}</span>
const Tarjeta = ({ titulo, extra, children, className = '' }: { titulo?: string; extra?: React.ReactNode; children: React.ReactNode; className?: string }) => (
  <section className={`rounded-lg border border-borde bg-panel p-4 ${className}`}>
    {titulo && <div className="mb-3 flex items-baseline justify-between gap-3"><h2 className="font-serif text-xl">{titulo}</h2>{extra}</div>}
    {children}
  </section>
)

export default function Ficha({ isin }: { isin: string }) {
  const [datos, setDatos] = useState<Datos | null | undefined>(undefined)
  const [error, setError] = useState('')
  const [rango, setRango] = useState<number>(5)
  const [seguido, setSeguido] = useState(false)
  const [pestana, setPestana] = useState<Pestana>('resumen')
  const bandeja = useBandeja()

  useEffect(() => {
    cargar(isin).then((d) => { setDatos(d); setSeguido(d?.seguido ?? false) }).catch((e: Error) => setError(e.message))
  }, [isin])

  // la pestaña de clases solo si hay más de una; ← y → cambian de pestaña (los números ya son atajos de pantalla)
  const pestanas = PESTANAS.filter((p) => p !== 'clases' || (datos?.clases.length ?? 0) > 1)
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (escribiendo(e) || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return
      const i = pestanas.indexOf(pestana) + (e.key === 'ArrowRight' ? 1 : -1)
      if (pestanas[i]) setPestana(pestanas[i])
    }
    addEventListener('keydown', tecla)
    return () => removeEventListener('keydown', tecla)
  })

  const m = useMemo(() => {
    const out = new Map<string, q.Metrica>()
    for (const x of datos?.metricas ?? []) out.set(`${x.ventana}|${x.nombre}`, x)
    return out
  }, [datos])

  const lineas = useMemo(() => {
    if (!datos?.serie.length) return []
    const ultima = datos.serie.at(-1)!.fecha
    const desde = inicioComun([datos.serie, datos.serieRef], haceAnos(ultima, rango))
    const out = [{ nombre: 'Fondo', serie: base100(datos.serie, desde), color: 'acento' }]
    if (datos.serieRef.length) out.push({ nombre: datos.ref.indice?.nombre ?? 'Índice', serie: base100(datos.serieRef, desde), color: 'suave' })
    return out
  }, [datos, rango])

  if (error) return <p className="text-baja">No se ha podido cargar el fondo: {error}</p>
  if (datos === undefined) return <p className="text-suave">Cargando {isin}…</p>
  if (datos === null) return <p className="text-suave">No hay ningún fondo con ISIN {isin}.</p>

  const { fondo: f, ref } = datos
  const pctFondo = Object.fromEntries(datos.metricas.filter((x) => x.percentil != null).map((x) => [`${x.ventana}|${x.nombre}`, x.percentil!]))
  const b = bloques(pctFondo, f.gestion === 'indexada')
  const e = evolucion(datos.notas)
  const seguir = () => q.seguir(f.isin).then(() => setSeguido(true)).catch((x: Error) => setError(x.message))
  const celda = (ventana: string, nombre: string, fmt: (v: number) => string) => {
    const x = m.get(`${ventana}|${nombre}`)
    if (!x) return <span className="text-suave">—</span>
    return (
      <>
        {fmt(x.valor)}
        {x.percentil != null && <span className={`ml-1 text-[11px] ${colorPercentil(x.percentil)}`}>p{Math.round(x.percentil)}</span>}
      </>
    )
  }
  const anos = [...new Set((datos.metricas ?? []).filter((x) => /^\d{4}$/.test(x.ventana)).map((x) => x.ventana))].sort().reverse()
  const recup = m.get('10a|recuperacion_semanas')?.valor
  const textoRef = ref.metodo === 'indice' ? ref.indice?.nombre : ref.metodo === 'media_categoria' ? 'media de su categoría' : 'sin referencia'

  const enBandeja = bandeja.some((x) => x.isin === f.isin)
  const llena = !enBandeja && bandeja.length >= MAX_BANDEJA
  const titulo = 'text-[11px] uppercase tracking-widest text-suave'
  const ultimo = datos.serie.at(-1)
  const dia = datos.serie.length > 1 ? variacion(datos.serie, datos.serie.at(-2)!.fecha) : null
  const ytd = m.get('ytd|rentabilidad')?.valor ?? null
  const tono = (v: number | null) => (v == null ? 'text-suave' : v >= 0 ? 'text-sube' : 'text-baja')
  const ultimosAnos = [...anos].reverse().slice(-10) // los 10 últimos años naturales, del más antiguo al más reciente
  const kpi = (et: string, clave: string, fmt: (v: number) => string, color = false) => {
    const x = m.get(clave)
    return (
      <div key={clave} className="flex flex-col gap-1 bg-panel px-4 py-3">
        <span className="text-[12px] text-suave">{et}</span>
        <span className={`cifra text-3xl tabular ${color && x ? tono(x.valor) : ''}`}>{x ? fmt(x.valor) : '—'}</span>
        {x?.percentil != null ? <BarraPercentil p={x.percentil} /> : <span className="text-[11px] text-suave">sin percentil</span>}
      </div>
    )
  }

  return (
    <article className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="min-w-0 space-y-2">
          <p className="text-[11px] uppercase tracking-widest text-acento">{f.categoria ?? 'sin categoría'}</p>
          <h1 className="text-3xl! sm:text-4xl!">{f.nombre}</h1>
          <div className="flex flex-wrap gap-1.5 text-suave">
            <Pastilla className="font-mono">{f.isin}</Pastilla>
            <Pastilla>{f.divisa}{cubierta(f.nombre) && ' cubierta'}</Pastilla>
            {f.gestion && <Pastilla>{f.gestion === 'indexada' ? 'Indexado' : 'Gestión activa'}</Pastilla>}
            {datos.myinvestor.has(f.isin) && <Pastilla className="bg-acento/15! text-acento">En MyInvestor</Pastilla>}
            {seguido && <Pastilla className="text-acento">★ en seguimiento</Pastilla>}
            {!f.en_universo && <Pastilla className="text-aviso">fuera del universo</Pastilla>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-3">
          {e ? (
            <p className="text-right tabular" title="Nota del screener (pesos por defecto, sin Diversificación)">
              <span className="text-[12px] text-suave">Nota </span><span className="cifra text-6xl leading-none">{Math.round(e.nota)}</span>
              <span className="block text-[12px] text-suave">
                {e.percentil != null && <>p{Math.round(e.percentil)} de su categoría</>}
                {e.periodo != null && <span className={e.periodo >= 0 ? 'text-sube' : 'text-baja'}> · {e.periodo >= 0 ? '+' : ''}{cifra(e.periodo, 0)} en 12 meses</span>}
                <> · semana del {fecha(e.fecha)}</>
              </span>
            </p>
          ) : <p className="text-right text-suave">Sin nota: fuera del universo<br />o menos de 3 años de historia.</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <a href={`#/comparar/${f.isin}`} className="flex min-h-8 items-center rounded-full bg-borde/50 px-4 text-texto hover:bg-borde">Comparar</a>
            <button onClick={() => alternar({ isin: f.isin, nombre: f.nombre })} disabled={llena} aria-pressed={enBandeja}
              title={llena ? `Como mucho ${MAX_BANDEJA} fondos en la bandeja` : undefined}
              className={`min-h-8 rounded-full bg-borde/50 px-4 hover:bg-borde disabled:text-suave ${enBandeja ? 'text-acento' : 'text-texto'}`}>{enBandeja ? '− Bandeja' : '+ Bandeja'}</button>
            <button onClick={seguir} disabled={seguido}
              className="min-h-8 rounded-full bg-acento px-4 text-panel disabled:bg-borde/50 disabled:text-suave">{seguido ? '★ Siguiendo' : '★ Seguir'}</button>
          </div>
        </div>
      </header>
      <p className="text-[13px] text-suave">
        {datos.carteras.length ? <>En {datos.carteras.map((c, i) => <span key={c.id}>{i > 0 && ', '}<a href={`#/cartera/${c.id}`} className="text-texto hover:text-acento">{c.nombre}</a> ({cifra(c.peso, 0)} %)</span>)}</> : 'No está en ninguna cartera.'}
      </p>

      <div role="tablist" aria-label="Secciones de la ficha" className="flex flex-wrap gap-5 border-b border-borde">
        {pestanas.map((p) => (
          <button key={p} id={`pestana-${p}`} role="tab" aria-selected={pestana === p} aria-controls="panel-ficha" onClick={() => setPestana(p)}
            className={`-mb-px border-b-2 pb-1.5 capitalize ${pestana === p ? 'border-acento text-texto' : 'border-transparent text-suave hover:text-texto'}`}>
            {p}{p === 'clases' ? ` · ${datos.clases.length}` : ''}
          </button>
        ))}
        <span className="ml-auto self-center text-[11px] text-suave">← → cambiar</span>
      </div>

      <div id="panel-ficha" role="tabpanel" aria-labelledby={`pestana-${pestana}`} className="space-y-5">
        {pestana === 'resumen' && (
          <>
            <Tarjeta>
              <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="cifra text-5xl tabular">{ultimo ? `${cifra(ultimo.valor, ultimo.valor < 100 ? 4 : 2)} €` : '—'}</span>
                  {dia != null && <span className={`rounded-full px-2 text-[12px] tabular ${tono(dia)} ${dia >= 0 ? 'bg-sube/10' : 'bg-baja/10'}`}>{pct(dia, 2)} último día</span>}
                  {ytd != null && <span className={`rounded-full px-2 text-[12px] tabular ${tono(ytd)} ${ytd >= 0 ? 'bg-sube/10' : 'bg-baja/10'}`}>{pct(ytd)} este año</span>}
                  {ultimo && <span className="text-[12px] text-suave">valor en euros del {fecha(ultimo.fecha)}</span>}
                </div>
                <div role="group" aria-label="Periodo del gráfico" className="flex gap-0.5 rounded-full bg-borde/50 p-0.5 text-[12px]">
                  {RANGOS.map(([etiqueta, n]) => (
                    <button key={etiqueta} onClick={() => setRango(n)} aria-pressed={rango === n}
                      className={`rounded-full px-3 py-0.5 ${rango === n ? 'bg-panel text-texto shadow-sm' : 'text-suave hover:text-texto'}`}>{etiqueta.toUpperCase()}</button>
                  ))}
                </div>
              </div>
              {lineas.length ? <Grafico lineas={lineas} /> : <p className="text-suave">Aún no hay valores descargados de este fondo.</p>}
              <p className="text-[11px] text-suave">Base 100 en euros, frente a {textoRef ?? 'su referencia'}.{ref.metodo === 'media_categoria' && ' La media de la categoría se usa en las métricas; no se dibuja.'}</p>
            </Tarjeta>

            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-borde bg-borde lg:grid-cols-4">
              {kpi('Rentabilidad 3 años, anual', '3a|rentabilidad', (v) => pct(v), true)}
              {kpi('Volatilidad 3 años', '3a|volatilidad', (v) => pct(v, 1, false))}
              {kpi('Sharpe 3 años', '3a|sharpe', (v) => cifra(v))}
              {kpi('Gastos corrientes (TER)', 'hoy|ter', (v) => `${cifra(v)} %`)}
            </dl>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-4">
                {ultimosAnos.length > 0 && (
                  <Tarjeta titulo="Por año natural" extra={<span className="text-[12px] text-suave">cuartil en su categoría · 1 es el mejor</span>}>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[420px] tabular">
                        <thead><tr className="text-[11px] text-suave">{ultimosAnos.map((a) => <th key={a} className="pb-1 text-right font-normal">{a}</th>)}{ytd != null && <th className="pb-1 text-right font-normal">Este año</th>}</tr></thead>
                        <tbody>
                          <tr className="text-[13px]">
                            {ultimosAnos.map((a) => { const v = m.get(`${a}|rentabilidad`)?.valor ?? null; return <td key={a} className={`py-1 text-right ${tono(v)}`}>{v == null ? '—' : pct(v, 1, false).replace(' %', '')}</td> })}
                            {ytd != null && <td className={`py-1 text-right ${tono(ytd)}`}>{pct(ytd, 1, false).replace(' %', '')}</td>}
                          </tr>
                          <tr>
                            {ultimosAnos.map((a) => <td key={a} className="pl-1 text-right"><Cuartil p={m.get(`${a}|rentabilidad`)?.percentil} /></td>)}
                            {ytd != null && <td className="pl-1 text-right"><Cuartil p={m.get('ytd|rentabilidad')?.percentil} /></td>}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <p className="mt-2 text-[11px] text-suave">Rentabilidad en %, en euros.</p>
                  </Tarjeta>
                )}
                <Tarjeta titulo="Datos del fondo">
                  <dl className="divide-y divide-borde text-[13px]">
                    {([
                      ['Gestora', f.gestora ?? '—'],
                      ['Referencia', textoRef ?? '—'],
                      ['Patrimonio', millones(f.patrimonio_meur)],
                      ['Lanzamiento', fecha(f.fecha_lanzamiento)],
                      ['Riesgo (SRRI)', f.srri == null ? '—' : (
                        <span className="flex gap-0.5" aria-label={`${f.srri} de 7`}>
                          {[1, 2, 3, 4, 5, 6, 7].map((i) => <i key={i} className={`grid h-4 w-4 place-items-center rounded-sm text-[10px] not-italic ${i === Number(f.srri) ? 'bg-acento text-panel' : 'bg-borde/60 text-suave'}`}>{i}</i>)}
                        </span>)],
                      ['Inversión mínima', f.inversion_minima == null ? '—' : `${cifra(Number(f.inversion_minima), 0)} ${f.divisa ?? ''}`],
                      ['MyInvestor', datos.myinvestor.has(f.isin) ? 'se puede comprar' : 'no'],
                      ...(f.duracion_efectiva != null || f.calidad_media ? [
                        ['Duración efectiva', f.duracion_efectiva == null ? '—' : `${cifra(Number(f.duracion_efectiva), 1)} años`],
                        ['Calidad media', f.calidad_media ?? '—'],
                      ] : []),
                    ] as [string, React.ReactNode][]).map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between gap-4 py-1.5">
                        <dt className="text-suave">{k}</dt><dd className="text-right tabular">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </Tarjeta>
              </div>
              <div className="space-y-4">
                <Tarjeta titulo={`Por qué la nota${b?.solo3a ? ' · con métricas a 3 años' : ''}`}>
                  {b && e ? <TablaNota bloques={b.bloques} pesos={PESOS_DEFECTO} nota={e.nota} /> : <p className="text-suave">—</p>}
                  <p className="mt-2 text-[11px] text-suave">Pesos por defecto, sin Diversificación (la nota de las señales). Bloques con las métricas de hoy.</p>
                </Tarjeta>
                <Tarjeta titulo="Nota por semana">
                  {datos.notas.length > 1 ? <Grafico lineas={[{ nombre: 'Nota', serie: datos.notas.map((n) => ({ fecha: n.fecha, valor: n.nota })), color: 'acento' }]} alto="h-48" />
                    : <p className="text-suave">—</p>}
                </Tarjeta>
              </div>
            </div>
          </>
        )}

        {pestana === 'métricas' && (
          <>
            <section className="overflow-x-auto rounded-lg border border-borde bg-panel p-4">
              <table className="w-full min-w-[560px] tabular">
                <thead>
                  <tr className="border-b border-borde text-[12px] text-suave">
                    <th className="py-1 text-left font-normal">Métrica</th>
                    {RANGOS.map(([v]) => <th key={v} className="py-1 text-right font-normal">{v.toUpperCase()}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {FILAS.map(([nombre, etiqueta, fmt]) => (
                    <tr key={nombre} className="border-b border-borde/50">
                      <td className="py-1 text-suave">{etiqueta}</td>
                      {RANGOS.map(([v]) => <td key={v} className="py-1 text-right">{celda(v, nombre, fmt)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-1 text-[11px] text-suave">pNN = percentil en su categoría (100 = mejor). Ventanas solo con historia completa.</p>
            </section>

            <section className="grid gap-px overflow-hidden rounded-lg border border-borde bg-borde sm:grid-cols-3">
              {[
                ['Este año', celda('ytd', 'rentabilidad', (v) => pct(v))],
                ['Consistencia', celda('hist', 'consistencia', (v) => `${cifra(v, 0)} %`)],
                ['Recuperación de la peor caída', recup == null ? '—' : recup < 0 ? 'sin recuperar' : `${cifra(recup, 0)} semanas`],
              ].map(([k, v], i) => (
                <div key={i} className="bg-panel px-4 py-3">
                  <div className="text-[12px] text-suave">{k}</div>
                  <div className="cifra text-2xl tabular">{v}</div>
                </div>
              ))}
            </section>
          </>
        )}

        {pestana === 'exposición' && (
          <Exposicion fondos={[{ peso: 100, nombre: f.nombre, c: datos.comp?.datos ?? null, duracion: f.duracion_efectiva, fechaCartera: datos.comp?.fecha_cartera ?? null }]} />
        )}

        {pestana === 'clases' && (
          <section className="overflow-x-auto">
            <h2 className={`mb-1 ${titulo}`}>Clases del mismo fondo · {datos.clases.length}</h2>
            <table className="w-full min-w-[560px] tabular">
              <thead>
                <tr className="border-b border-borde text-[11px] uppercase tracking-widest text-suave">
                  <th className="py-1 text-left font-normal">Clase</th><th className="text-left font-normal">Divisa</th>
                  <th className="text-right font-normal">TER</th><th className="text-right font-normal">Mínimo</th><th className="text-right font-normal">MyInvestor</th>
                </tr>
              </thead>
              <tbody>
                {datos.clases.map((c) => (
                  <tr key={c.isin} className={`border-b border-borde/50 ${c.isin === f.isin ? 'text-acento' : ''}`}>
                    <td className="py-1"><a href={`#/fondo/${c.isin}`} className="hover:text-acento">{c.nombre}</a> <span className="text-suave">{c.isin}{c.en_universo ? '' : ' · fuera del universo'}</span></td>
                    <td>{c.divisa ?? '—'}{cubierta(c.nombre) && <span className="text-suave"> cubierta</span>}</td>
                    <td className="text-right">{c.ter == null ? '—' : `${cifra(Number(c.ter))} %`}</td>
                    <td className="text-right">{c.inversion_minima == null ? '—' : cifra(Number(c.inversion_minima), 0)}</td>
                    <td className="text-right">{datos.myinvestor.has(c.isin) ? 'sí' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </article>
  )
}
