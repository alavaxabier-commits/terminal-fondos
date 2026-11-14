import { useEffect, useMemo, useState } from 'react'
import { cifra, colorPercentil, fecha, millones, pct } from '../calculo/formato'
import type { Composicion } from '../calculo/exposicion'
import { bloques, PESOS_DEFECTO } from '../calculo/nota'
import { evolucion, type NotaSemanal } from '../calculo/senales'
import { cubierta } from '../calculo/screener'
import { base100, combinar, haceAnos, inicioComun, type Punto } from '../calculo/series'
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
    const out = [{ nombre: 'Fondo', serie: base100(datos.serie, desde), color: '#5cc8e6' }]
    if (datos.serieRef.length) out.push({ nombre: datos.ref.indice?.nombre ?? 'Índice', serie: base100(datos.serieRef, desde), color: '#7d8f86' })
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

  return (
    <article className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-base font-bold text-texto">{f.nombre}</h1>
          <p className="text-suave">
            {f.isin} · {f.categoria ?? 'sin categoría'} · {f.divisa}{cubierta(f.nombre) && ' cubierta'}
            {!f.en_universo && <span className="text-aviso"> · fuera del universo</span>}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {e ? (
            <p className="text-right tabular" title="Nota del screener (pesos por defecto, sin Diversificación)">
              <span className="text-3xl text-acento">{Math.round(e.nota)}</span>
              <span className="block text-suave">
                {e.percentil != null && <>p{Math.round(e.percentil)} de su categoría</>}
                {e.periodo != null && <span className={e.periodo >= 0 ? 'text-sube' : 'text-baja'}> · {e.periodo >= 0 ? '+' : ''}{cifra(e.periodo, 0)} en 12 meses</span>}
                <> · semana del {fecha(e.fecha)}</>
              </span>
            </p>
          ) : <p className="text-right text-suave">Sin nota: fuera del universo<br />o menos de 3 años de historia.</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <button onClick={seguir} disabled={seguido}
              className="min-h-8 border border-acento px-3 text-acento disabled:border-borde disabled:text-suave">{seguido ? '★ en seguimiento' : '★ seguir'}</button>
            <button onClick={() => alternar({ isin: f.isin, nombre: f.nombre })} disabled={llena} aria-pressed={enBandeja}
              title={llena ? `Como mucho ${MAX_BANDEJA} fondos en la bandeja` : undefined}
              className={`min-h-8 border border-borde px-3 hover:text-texto disabled:text-suave ${enBandeja ? 'text-acento' : 'text-suave'}`}>{enBandeja ? '− de la bandeja' : '+ a la bandeja'}</button>
            <a href={`#/comparar/${f.isin}`} className="flex min-h-8 items-center border border-borde px-3 text-suave hover:text-texto">comparar</a>
          </div>
        </div>
      </header>
      <p className="text-suave">
        {datos.carteras.length ? <>En {datos.carteras.map((c, i) => <span key={c.id}>{i > 0 && ', '}<a href={`#/cartera/${c.id}`} className="text-texto hover:text-acento">{c.nombre}</a> ({cifra(c.peso, 0)} %)</span>)}</> : 'No está en ninguna cartera.'}
      </p>

      <div role="tablist" aria-label="Secciones de la ficha" className="flex flex-wrap gap-1 border-b border-borde">
        {pestanas.map((p) => (
          <button key={p} id={`pestana-${p}`} role="tab" aria-selected={pestana === p} aria-controls="panel-ficha" onClick={() => setPestana(p)}
            className={`-mb-px border px-3 py-1 ${pestana === p ? 'border-borde border-b-fondo bg-fondo text-acento' : 'border-transparent text-suave hover:text-texto'}`}>
            {p}{p === 'clases' ? ` · ${datos.clases.length}` : ''}
          </button>
        ))}
        <span className="ml-auto self-center text-[11px] text-suave">← → cambiar</span>
      </div>

      <div id="panel-ficha" role="tabpanel" aria-labelledby={`pestana-${pestana}`} className="space-y-5">
        {pestana === 'resumen' && (
          <>
            <dl className="grid grid-cols-2 gap-px border border-borde bg-borde sm:grid-cols-5">
              {[
                ['TER', pct((f.ter ?? NaN) / 100, 2, false)],
                ['Patrimonio', millones(f.patrimonio_meur)],
                ['Lanzamiento', fecha(f.fecha_lanzamiento)],
                ['Referencia', textoRef ?? '—'],
                ['Último valor', datos.serie.length ? `${fecha(datos.serie.at(-1)!.fecha)}` : '—'],
                ['Gestión', f.gestion ?? '—'],
                ['SRRI', f.srri ?? '—'],
                ['Inversión mínima', f.inversion_minima == null ? '—' : `${cifra(Number(f.inversion_minima), 0)} ${f.divisa ?? ''}`],
                ['MyInvestor', datos.myinvestor.has(f.isin) ? 'se puede comprar' : 'no'],
                ...(f.duracion_efectiva != null || f.calidad_media ? [
                  ['Duración efectiva', f.duracion_efectiva == null ? '—' : `${cifra(Number(f.duracion_efectiva), 1)} años`],
                  ['Calidad media', f.calidad_media ?? '—'],
                ] : []),
              ].map(([k, v]) => (
                <div key={k} className="bg-fondo px-3 py-2">
                  <dt className="text-[10px] uppercase tracking-widest text-suave">{k}</dt>
                  <dd className="tabular">{v}</dd>
                </div>
              ))}
            </dl>

            <section>
              <div className="mb-1 flex items-center gap-1">
                {RANGOS.map(([etiqueta, n]) => (
                  <button key={etiqueta} onClick={() => setRango(n)}
                          className={`border px-2 py-0.5 ${rango === n ? 'border-acento text-acento' : 'border-borde text-suave hover:text-texto'}`}>
                    {etiqueta.toUpperCase()}
                  </button>
                ))}
                <span className="ml-auto text-[11px] text-suave">base 100 · EUR</span>
              </div>
              {lineas.length ? <Grafico lineas={lineas} /> : <p className="text-suave">Aún no hay valores descargados de este fondo.</p>}
              {ref.metodo === 'media_categoria' && <p className="text-[11px] text-suave">La media de la categoría se usa en las métricas; no se dibuja.</p>}
            </section>

            <section className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <h2 className={titulo}>Por qué{b?.solo3a ? ' · con métricas a 3 años' : ''}</h2>
                {b && e ? <TablaNota bloques={b.bloques} pesos={PESOS_DEFECTO} nota={e.nota} /> : <p className="text-suave">—</p>}
                <p className="text-[11px] text-suave">Pesos por defecto, sin Diversificación (la nota de las señales). Bloques con las métricas de hoy.</p>
              </div>
              <div className="space-y-2">
                <h2 className={titulo}>Nota del screener por semana</h2>
                {datos.notas.length > 1 ? <Grafico lineas={[{ nombre: 'Nota', serie: datos.notas.map((n) => ({ fecha: n.fecha, valor: n.nota })), color: '#5cc8e6' }]} alto="h-48" />
                  : <p className="text-suave">—</p>}
              </div>
            </section>

            {anos.length > 0 && (
              <section className="overflow-x-auto">
                <h2 className={`mb-1 ${titulo}`}>Por año natural</h2>
                <div className="flex gap-px border border-borde bg-borde">
                  {anos.map((a) => (
                    <div key={a} className="min-w-[72px] flex-1 bg-fondo px-2 py-1 text-right tabular">
                      <div className="text-[10px] text-suave">{a}</div>
                      {celda(a, 'rentabilidad', (v) => pct(v))}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {pestana === 'métricas' && (
          <>
            <section className="overflow-x-auto">
              <table className="w-full min-w-[560px] tabular">
                <thead>
                  <tr className="border-b border-borde text-[11px] uppercase tracking-widest text-suave">
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

            <section className="grid gap-px border border-borde bg-borde sm:grid-cols-3">
              {[
                ['Este año', celda('ytd', 'rentabilidad', (v) => pct(v))],
                ['Consistencia', celda('hist', 'consistencia', (v) => `${cifra(v, 0)} %`)],
                ['Recuperación de la peor caída', recup == null ? '—' : recup < 0 ? 'sin recuperar' : `${cifra(recup, 0)} semanas`],
              ].map(([k, v], i) => (
                <div key={i} className="bg-fondo px-3 py-2">
                  <div className="text-[10px] uppercase tracking-widest text-suave">{k}</div>
                  <div className="tabular">{v}</div>
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
