import { useEffect, useMemo, useState } from 'react'
import { cifra, colorPercentil, fecha, millones, pct } from '../calculo/formato'
import type { Composicion } from '../calculo/exposicion'
import { bloques, PESOS_TIPO_DEFECTO, tipoActivo } from '../calculo/nota'
import { evolucion, type NotaSemanal } from '../calculo/senales'
import { cubierta } from '../calculo/screener'
import { base100, combinar, haceAnos, inicioComun, variacion, type Punto } from '../calculo/series'
import Exposicion from '../componentes/Exposicion'
import Franja from '../componentes/Franja'
import Grafico from '../componentes/Grafico'
import TablaNota from '../componentes/TablaNota'
import Tarjeta from '../componentes/Tarjeta'
import { escribiendo } from '../componentes/teclas'
import { alternar, MAX_BANDEJA, useBandeja } from '../datos/bandeja'
import * as q from '../datos/consultas'
import { serieEur } from '../datos/series'
import Cargando from '../componentes/Cargando'

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
// Escala ordenada de un solo tono (dataviz): el primer cuartil, acento pleno; el cuarto, casi el fondo. El número va siempre escrito.
const FONDO_CUARTIL = ['var(--color-acento)', 'color-mix(in srgb, var(--color-acento) 45%, var(--color-panel))',
  'color-mix(in srgb, var(--color-acento) 20%, var(--color-panel))', 'color-mix(in srgb, var(--color-borde) 70%, var(--color-panel))']
function Cuartil({ p }: { p: number | null | undefined }) {
  if (p == null) return <span className="text-suave">—</span>
  const k = cuartil(p)
  return <span title={`Percentil ${Math.round(p)} en su categoría`} className="inline-grid h-5 w-full max-w-9 place-items-center rounded-sm text-[11px] font-medium"
    style={{ background: FONDO_CUARTIL[k - 1], color: k === 1 ? 'var(--color-sobre-acento)' : 'var(--color-texto)' }}>{k}</span>
}
/** Percentil como barra fina (100 = mejor dentro de la categoría). */
const BarraPercentil = ({ p }: { p: number }) => (
  <span className="flex items-center gap-2" title={`Percentil ${Math.round(p)} en su categoría (100 = mejor)`}>
    <span className="relative h-1 flex-1 rounded-sm bg-borde/70"><span className="absolute inset-y-0 left-0 rounded-sm bg-acento" style={{ width: `${p}%` }} /></span>
    <span className={`text-[11px] tabular ${colorPercentil(p)}`}>p{Math.round(p)}</span>
  </span>
)
export const Pastilla = ({ children, className = '' }: { children: React.ReactNode; className?: string }) =>
  <span className={`rounded-sm bg-borde/50 px-2.5 py-0.5 text-[12px] ${className}`}>{children}</span>

/** Métricas de la pestaña, agrupadas por lo que miden, con una línea que explica cada una (claves de FILAS). */
export const GRUPOS: [string, string, [string, string][]][] = [
  ['Rentabilidad', 'Lo que ha ganado.', [
    ['rentabilidad', 'De media al año.'],
    ['acumulada', 'En todo el periodo.'],
  ]],
  ['Riesgo', 'Cuánto se mueve y cuánto puede caer. Menos es mejor.', [
    ['volatilidad', 'Cuánto oscila su valor, en % al año.'],
    ['max_caida', 'La peor bajada desde un máximo.'],
    ['volatilidad_mensual', 'Igual, con datos mensuales (como Morningstar).'],
  ]],
  ['Rentabilidad por riesgo', 'Lo que gana por cada unidad de riesgo. Más es mejor.', [
    ['sharpe', 'Lo que gana por encima del €STR, dividido entre la volatilidad.'],
    ['sortino', 'Como el Sharpe, pero solo cuenta las bajadas.'],
    ['sharpe_mensual', 'Igual, con datos mensuales (como Morningstar).'],
  ]],
  ['Frente a su referencia', 'Cómo se comporta comparado con su índice.', [
    ['alfa', 'Lo que gana de más, descontando lo que se mueve con el índice.'],
    ['beta', 'Cuánto se mueve cuando se mueve el índice (1 = lo mismo).'],
    ['r2', 'Cuánto se parece su movimiento al del índice (100 = igual).'],
    ['tracking_error', 'Cuánto se separa del índice, en % al año.'],
    ['ratio_informacion', 'Lo que gana de más por cada unidad de separación.'],
    ['captura_alcista', 'Qué parte de las subidas del índice recoge (100 = todas).'],
    ['captura_bajista', 'Qué parte de las bajadas del índice sufre (menos es mejor).'],
  ]],
]

/** Tarjeta «Frente a su categoría» del resumen: cifra y percentil. */
const FRENTE: [string, string, (v: number) => string][] = [
  ['Rentabilidad 1 año', '1a|rentabilidad', (v) => pct(v)],
  ['Rentabilidad 3 años, anual', '3a|rentabilidad', (v) => pct(v)],
  ['Rentabilidad 5 años, anual', '5a|rentabilidad', (v) => pct(v)],
  ['Volatilidad 3 años', '3a|volatilidad', (v) => pct(v, 1, false)],
  ['Máxima caída 3 años', '3a|max_caida', (v) => pct(v)],
  ['Sharpe 3 años', '3a|sharpe', (v) => cifra(v)],
  ['Gastos (TER)', 'hoy|ter', (v) => `${cifra(v)} %`],
  ['Alfa 3 años', '3a|alfa', (v) => pct(v)],
  ['Consistencia', 'hist|consistencia', (v) => `${cifra(v, 0)} %`],
]

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
  if (datos === undefined) return <Cargando pagina texto={`Cargando ${isin}…`} />
  if (datos === null) return <p className="text-suave">No hay ningún fondo con ISIN {isin}.</p>

  const { fondo: f, ref } = datos
  const pctFondo = Object.fromEntries(datos.metricas.filter((x) => x.percentil != null).map((x) => [`${x.ventana}|${x.nombre}`, x.percentil!]))
  const b = bloques(pctFondo, f.gestion === 'indexada')
  const e = evolucion(datos.notas)
  const seguir = () => q.seguir(f.isin).then(() => setSeguido(true)).catch((x: Error) => setError(x.message))
  const anos = [...new Set((datos.metricas ?? []).filter((x) => /^\d{4}$/.test(x.ventana)).map((x) => x.ventana))].sort().reverse()
  const recup = m.get('10a|recuperacion_semanas')?.valor
  const textoRef = ref.metodo === 'indice' ? ref.indice?.nombre : ref.metodo === 'media_categoria' ? 'media de su categoría' : 'sin referencia'

  const enBandeja = bandeja.some((x) => x.isin === f.isin)
  const llena = !enBandeja && bandeja.length >= MAX_BANDEJA
  const ultimo = datos.serie.at(-1)
  const dia = datos.serie.length > 1 ? variacion(datos.serie, datos.serie.at(-2)!.fecha) : null
  const ytd = m.get('ytd|rentabilidad')?.valor ?? null
  const tono = (v: number | null) => (v == null ? 'text-suave' : v >= 0 ? 'text-sube' : 'text-baja')
  const ultimosAnos = [...anos].reverse().slice(-10) // los 10 últimos años naturales, del más antiguo al más reciente
  const pieP = (p: number | null | undefined, conCuartil = false) => (p == null ? 'sin percentil' : <span className={colorPercentil(p)}>p{Math.round(p)}{conCuartil && ` · cuartil ${cuartil(p)}`}</span>)

  return (
    <article className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
        <div className="min-w-0 space-y-2">
          <p className="rotulo text-acento!">{f.categoria ?? 'sin categoría'}</p>
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
        <div className="flex flex-wrap gap-2">
          <button onClick={() => alternar({ isin: f.isin, nombre: f.nombre })} disabled={llena} aria-pressed={enBandeja}
            title={llena ? `Como mucho ${MAX_BANDEJA} fondos en el comparador` : undefined}
            className={`boton ${enBandeja ? 'text-acento' : 'text-texto'}`}>{enBandeja ? '− Comparar' : '+ Comparar'}</button>
          <button onClick={seguir} disabled={seguido}
            className="boton-pri">{seguido ? '★ Siguiendo' : '★ Seguir'}</button>
        </div>
      </header>
      <Franja cifras={[
        { etiqueta: 'Nota', valor: e ? String(Math.round(e.nota)) : '—', pie: e ? <>
          {e.percentil != null && <>p{Math.round(e.percentil)}</>}
          {e.periodo != null && <span className={e.periodo >= 0 ? 'text-sube' : 'text-baja'}> · {e.periodo >= 0 ? '+' : ''}{cifra(e.periodo, 0)} en 12 meses</span>}
        </> : 'fuera del universo o < 3 años' },
        { etiqueta: 'Este año', valor: ytd == null ? '—' : pct(ytd), clase: ytd == null ? '' : tono(ytd), pie: pieP(m.get('ytd|rentabilidad')?.percentil, true) },
        ...([['3 años, anual', '3a|rentabilidad', (v: number) => pct(v), true], ['Volatilidad 3 años', '3a|volatilidad', (v: number) => pct(v, 1, false), false],
          ['Gastos (TER)', 'hoy|ter', (v: number) => `${cifra(v)} %`, false]] as const).map(([et, k, fmt, color]) => {
          const x = m.get(k)
          return { etiqueta: et, valor: x ? fmt(x.valor) : '—', clase: color && x ? tono(x.valor) : '', pie: pieP(x?.percentil) }
        }),
      ]} />
      <p className="text-[13px] text-suave">
        {datos.carteras.length ? <>En {datos.carteras.map((c, i) => <span key={c.id}>{i > 0 && ', '}<a href={`#/cartera/${c.id}`} className="text-texto hover:text-acento">{c.nombre}</a> ({cifra(c.peso, 0)} %)</span>)}</> : 'No está en ninguna cartera.'}
        {e && <> · nota de la semana del {fecha(e.fecha)}</>}
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
            {/* Arriba, lo que más se mira: el valor en el tiempo y, a su lado, cómo queda frente a su categoría. */}
            <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
              <Tarjeta>
                <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="cifra text-5xl">{ultimo ? `${cifra(ultimo.valor, ultimo.valor < 100 ? 4 : 2)} €` : '—'}</span>
                    {dia != null && <span className={`rounded-sm px-2 text-[12px] tabular ${tono(dia)} ${dia >= 0 ? 'bg-sube/10' : 'bg-baja/10'}`}>{pct(dia, 2)} último día</span>}
                    {ytd != null && <span className={`rounded-sm px-2 text-[12px] tabular ${tono(ytd)} ${ytd >= 0 ? 'bg-sube/10' : 'bg-baja/10'}`}>{pct(ytd)} este año</span>}
                    {ultimo && <span className="text-[12px] text-suave">valor en euros del {fecha(ultimo.fecha)}</span>}
                  </div>
                  <div role="group" aria-label="Periodo del gráfico" className="flex gap-0.5 rounded-sm bg-borde/50 p-0.5 text-[12px]">
                    {RANGOS.map(([etiqueta, n]) => (
                      <button key={etiqueta} onClick={() => setRango(n)} aria-pressed={rango === n}
                        className={`rounded-sm px-3 py-0.5 ${rango === n ? 'bg-panel text-texto ring-1 ring-borde' : 'text-suave hover:text-texto'}`}>{etiqueta.toUpperCase()}</button>
                    ))}
                  </div>
                </div>
                {lineas.length ? <Grafico lineas={lineas} /> : <p className="text-suave">Aún no hay valores descargados de este fondo.</p>}
                <p className="text-[11px] text-suave">Base 100 en euros, frente a {textoRef ?? 'su referencia'}.{ref.metodo === 'media_categoria' && ' La media de la categoría se usa en las métricas; no se dibuja.'}</p>
              </Tarjeta>
              <Tarjeta titulo="Frente a su categoría" extra={<span className="text-[12px] text-suave">percentil · 100 es el mejor</span>}>
                <dl className="divide-y divide-borde text-[13px]">
                  {FRENTE.filter(([, k]) => m.has(k)).slice(0, f.duracion_efectiva != null || f.calidad_media ? 9 : 7).map(([et, k, fmt]) => {
                    const x = m.get(k)!
                    return (
                      <div key={k} className="grid grid-cols-[minmax(0,1fr)_4.5rem_minmax(0,9rem)] items-center gap-3 py-1">
                        <dt className="truncate text-suave">{et}</dt>
                        <dd className="text-right tabular">{fmt(x.valor)}</dd>
                        <dd>{x.percentil != null ? <BarraPercentil p={x.percentil} /> : <span className="text-[11px] text-suave">sin percentil</span>}</dd>
                      </div>
                    )
                  })}
                </dl>
              </Tarjeta>
            </div>
              {ultimosAnos.length > 0 && (
                <Tarjeta titulo="Por año natural" extra={<span className="text-[12px] text-suave">cuartil en su categoría · 1 es el mejor</span>}>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[420px] table-fixed tabular">
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
            <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-3">
                <Tarjeta titulo="Datos del fondo">
                  <dl className="divide-y divide-borde text-[13px]">
                    {([
                      ['Gestora', f.gestora ?? '—'],
                      ['Equipo gestor', f.gestores?.length ? (
                        <span className="block text-right">{f.gestores.map((g) => (
                          <span key={g.nombre} className="block">{g.nombre}{g.desde && <span className="text-suave"> · desde {fecha(g.desde)}</span>}</span>
                        ))}</span>) : '—'],
                      ['Referencia', textoRef ?? '—'],
                      ['Patrimonio', millones(f.patrimonio_meur)],
                      ['Lanzamiento', fecha(f.fecha_lanzamiento)],
                      ['Riesgo (SRRI)', f.srri == null ? '—' : (
                        <span className="flex gap-0.5" aria-label={`${f.srri} de 7`}>
                          {[1, 2, 3, 4, 5, 6, 7].map((i) => <i key={i} className={`grid h-4 w-4 place-items-center rounded-sm text-[10px] not-italic ${i === Number(f.srri) ? 'bg-acento text-sobre-acento' : 'bg-borde/60 text-suave'}`}>{i}</i>)}
                        </span>)],
                      ['Inversión mínima', f.inversion_minima == null ? '—' : `${cifra(Number(f.inversion_minima), 0)} ${f.divisa ?? ''}`],
                      ['MyInvestor', datos.myinvestor.has(f.isin) ? 'se puede comprar' : 'no'],
                      ...(f.duracion_efectiva != null || f.calidad_media ? [
                        ['Duración efectiva', f.duracion_efectiva == null ? '—' : `${cifra(Number(f.duracion_efectiva), 1)} años`],
                        ['Calidad media', f.calidad_media ?? '—'],
                      ] : []),
                    ] as [string, React.ReactNode][]).map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between gap-4 py-1">
                        <dt className="text-suave">{k}</dt><dd className="text-right tabular">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </Tarjeta>
              <Tarjeta titulo={`Por qué la nota${b?.solo3a ? ' · con métricas a 3 años' : ''}`}>
                {b && e ? <TablaNota bloques={b.bloques} pesos={PESOS_TIPO_DEFECTO[tipoActivo(f.categoria)]} nota={e.nota} /> : <p className="text-suave">—</p>}
                <p className="mt-2 text-[11px] text-suave">Pesos por defecto de su tipo de activo, sin Diversificación (la nota de las señales). Bloques con las métricas de hoy.</p>
              </Tarjeta>
              <Tarjeta titulo="Nota por semana">
                {datos.notas.length > 1 ? <Grafico lineas={[{ nombre: 'Nota', serie: datos.notas.map((n) => ({ fecha: n.fecha, valor: n.nota })), color: 'acento' }]} alto="h-56" />
                  : <p className="text-suave">—</p>}
              </Tarjeta>
            </div>
          </>
        )}

        {pestana === 'métricas' && (
          <>
            <section className="grid grid-cols-[minmax(0,1fr)] gap-px overflow-hidden rounded-lg border border-borde bg-borde sm:grid-cols-3">
              {([
                ['Este año', 'ytd|rentabilidad', (v: number) => pct(v), 'Desde el 31 de diciembre.'],
                ['Consistencia', 'hist|consistencia', (v: number) => `${cifra(v, 0)} %`, 'Periodos de 3 años (uno por semana) en que bate a su referencia.'],
              ] as const).map(([k, clave, fmt, ayuda]) => {
                const x = m.get(clave)
                return (
                  <div key={k} className="flex flex-col gap-1 bg-panel px-4 py-3">
                    <span className="text-[12px] text-suave">{k}</span>
                    <span className="cifra text-3xl tabular">{x ? fmt(x.valor) : '—'}</span>
                    {x?.percentil != null && <BarraPercentil p={x.percentil} />}
                    <span className="text-[11px] text-suave">{ayuda}</span>
                  </div>
                )
              })}
              <div className="flex flex-col gap-1 bg-panel px-4 py-3">
                <span className="text-[12px] text-suave">Recuperación de la peor caída</span>
                <span className="cifra text-3xl tabular">{recup == null ? '—' : recup < 0 ? 'sin recuperar' : `${cifra(recup, 0)} semanas`}</span>
                <span className="mt-auto text-[11px] text-suave">Desde el máximo hasta volver a él, en la peor caída de 10 años.</span>
              </div>
            </section>

            {m.has('3m|rentabilidad') && (
              <Tarjeta titulo="Rendimiento reciente" extra={<span className="text-[12px] text-suave">monetario · anualizado, con la serie diaria y neto de gastos</span>}>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] tabular">
                    <thead><tr className="text-[12px] text-suave"><th />{['Último mes', '2 meses', '3 meses'].map((t) => <th key={t} className="w-[20%] pb-1.5 pl-4 text-right font-normal">{t}</th>)}</tr></thead>
                    <tbody>
                      {([['rentabilidad', 'Lo que rinde ahora, en % anual', 'Lo ganado en ese tiempo, pasado a un año.'], ['diferencial_estr', 'Frente al €STR', 'Lo que rinde de más sobre el €STR medio de esos meses.']] as const).map(([k, et, ayuda]) => (
                        <tr key={k} className="border-t border-borde/60">
                          <td className="py-2 pr-4 text-left"><span className="block">{et}</span><span className="block text-[12px] text-suave">{ayuda}</span></td>
                          {['1m', '2m', '3m'].map((v) => {
                            const x = m.get(`${v}|${k}`)
                            return <td key={v} className="py-2 pl-4 text-right align-top">{x ? <><span className="block">{pct(x.valor, 2, k !== 'rentabilidad')}</span>{x.percentil != null && <span className="mt-1 block"><BarraPercentil p={x.percentil} /></span>}</> : <span className="text-suave">—</span>}</td>
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <dl className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-x-8 border-t border-borde pt-3 text-[13px] sm:grid-cols-2">
                  {([['12m|meses_negativos', 'Meses negativos (12 meses)', (v: number) => cifra(v, 0)]] as const).map(([k, et, fmt]) => {
                    const x = m.get(k)
                    return (
                      <div key={k} className="grid grid-cols-[minmax(0,1fr)_5rem_minmax(0,8rem)] items-center gap-3 py-1">
                        <dt className="text-suave">{et}</dt><dd className="text-right">{x ? fmt(x.valor) : '—'}</dd>
                        <dd>{x?.percentil != null && <BarraPercentil p={x.percentil} />}</dd>
                      </div>
                    )
                  })}
                </dl>
                <p className="mt-2 text-[11px] text-suave">Un mes solo es ruidoso: mira los tres plazos juntos. En clases de distribución el cupón no entra y la cifra sale baja.</p>
              </Tarjeta>
            )}
            {GRUPOS.map(([grupo, ayudaGrupo, claves]) => (
              <Tarjeta key={grupo} titulo={grupo} extra={<span className="text-[12px] text-suave">{ayudaGrupo}</span>}>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px] tabular">
                    <thead>
                      <tr className="text-[12px] text-suave">
                        <th className="pb-1.5 text-left font-normal" />
                        {RANGOS.map(([v]) => <th key={v} className="w-[14%] pb-1.5 pl-4 text-right font-normal">{v === '1a' ? '1 año' : `${v.slice(0, -1)} años`}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {claves.map(([nombre, ayuda]) => {
                        const [, etiqueta, fmt] = FILAS.find(([k]) => k === nombre)!
                        return (
                          <tr key={nombre} className="border-t border-borde/60">
                            <td className="py-2 pr-4 text-left">
                              <span className="block">{etiqueta}</span>
                              <span className="block text-[12px] text-suave">{ayuda}</span>
                            </td>
                            {RANGOS.map(([v]) => {
                              const x = m.get(`${v}|${nombre}`)
                              return (
                                <td key={v} className="py-2 pl-4 text-right align-top">
                                  {x ? <>
                                    <span className="block">{fmt(x.valor)}</span>
                                    {x.percentil != null && <span className="mt-1 block"><BarraPercentil p={x.percentil} /></span>}
                                  </> : <span className="text-suave">—</span>}
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </Tarjeta>
            ))}
            <p className="text-[12px] text-suave">La barra es el percentil en su categoría: 100 es el mejor fondo (en riesgo, el que menos). Solo hay cifra cuando el fondo tiene la historia completa del periodo.</p>
          </>
        )}

        {pestana === 'exposición' && (
          <Exposicion fondos={[{ peso: 100, nombre: f.nombre, c: datos.comp?.datos ?? null, duracion: f.duracion_efectiva, fechaCartera: datos.comp?.fecha_cartera ?? null }]} />
        )}

        {pestana === 'clases' && (
          <Tarjeta titulo={`Clases del mismo fondo · ${datos.clases.length}`} extra={<span className="text-[12px] text-suave">de menor a mayor gasto</span>}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] tabular">
                <thead>
                  <tr className="border-b border-borde text-[12px] text-suave">
                    <th className="pb-1.5 text-left font-normal">Clase</th><th className="text-left font-normal">Divisa</th>
                    <th className="text-right font-normal">TER</th><th className="text-right font-normal">Mínimo</th><th className="text-right font-normal">MyInvestor</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.clases.map((c) => (
                    <tr key={c.isin} className={`border-b border-borde/60 ${c.isin === f.isin ? 'bg-acento/10' : ''}`}>
                      <td className="py-2 pl-2 text-left">
                        <a href={`#/fondo/${c.isin}`} className="hover:text-acento">{c.nombre}</a>
                        {c.isin === f.isin && <span className="ml-2 rounded-sm bg-acento/15 px-2 text-[11px] text-acento">esta</span>}
                        <span className="block text-[12px] text-suave"><span className="font-mono">{c.isin}</span>{c.en_universo ? '' : ' · fuera del universo'}</span>
                      </td>
                      <td>{c.divisa ?? '—'}{cubierta(c.nombre) && <span className="text-suave"> cubierta</span>}</td>
                      <td className="text-right">{c.ter == null ? '—' : `${cifra(Number(c.ter))} %`}</td>
                      <td className="text-right">{c.inversion_minima == null ? '—' : cifra(Number(c.inversion_minima), 0)}</td>
                      <td className="pr-2 text-right">{datos.myinvestor.has(c.isin) ? <span className="text-acento" title="Se puede comprar en MyInvestor">●</span> : <span className="text-suave">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Tarjeta>
        )}
      </div>
    </article>
  )
}
