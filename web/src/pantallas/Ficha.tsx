import { useEffect, useMemo, useState } from 'react'
import { cifra, colorPercentil, fecha, millones, pct } from '../calculo/formato'
import { aEur, base100, combinar, haceAnos, inicioComun, type Punto } from '../calculo/series'
import Grafico from '../componentes/Grafico'
import * as q from '../datos/consultas'

type Datos = {
  fondo: q.Fondo
  ref: q.Referencia
  serie: Punto[]
  serieRef: Punto[]
  metricas: q.Metrica[]
}

const RANGOS = [['1a', 1], ['3a', 3], ['5a', 5], ['10a', 10]] as const

/** Serie en EUR de un fondo (con tipos de cambio si cotiza en otra divisa). */
export async function serieEur(isin: string, divisa: string | null): Promise<Punto[]> {
  const v = await q.valores(isin)
  if (!divisa || divisa === 'EUR') return v
  return aEur(v, await q.tiposCambio(divisa))
}

/** Serie del índice de referencia: su sustituto o la combinación de sus componentes. */
async function serieIndice(ind: q.Indice | null): Promise<Punto[]> {
  if (!ind) return []
  if (ind.proxy_isin) return q.valores(ind.proxy_isin)
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
  const [serie, serieRef, metricas] = await Promise.all([serieEur(isin, fondo.divisa), serieIndice(ref.indice), q.metricas(isin)])
  return { fondo, ref, serie, serieRef, metricas }
}

const FILAS: [string, string, (v: number) => string][] = [
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
]

export default function Ficha({ isin }: { isin: string }) {
  const [datos, setDatos] = useState<Datos | null | undefined>(undefined)
  const [error, setError] = useState('')
  const [rango, setRango] = useState<number>(5)

  useEffect(() => {
    cargar(isin).then(setDatos).catch((e: Error) => setError(e.message))
  }, [isin])

  const m = useMemo(() => {
    const out = new Map<string, q.Metrica>()
    for (const x of datos?.metricas ?? []) out.set(`${x.ventana}|${x.nombre}`, x)
    return out
  }, [datos])

  const lineas = useMemo(() => {
    if (!datos?.serie.length) return []
    const ultima = datos.serie.at(-1)!.fecha
    const desde = inicioComun([datos.serie, datos.serieRef], haceAnos(ultima, rango))
    const out = [{ nombre: 'Fondo', serie: base100(datos.serie, desde), color: '#4fd18b' }]
    if (datos.serieRef.length) out.push({ nombre: datos.ref.indice?.nombre ?? 'Índice', serie: base100(datos.serieRef, desde), color: '#7d8f86' })
    return out
  }, [datos, rango])

  if (error) return <p className="text-baja">No se ha podido cargar el fondo: {error}</p>
  if (datos === undefined) return <p className="text-suave">Cargando {isin}…</p>
  if (datos === null) return <p className="text-suave">No hay ningún fondo con ISIN {isin}.</p>

  const { fondo: f, ref } = datos
  const celda = (ventana: string, nombre: string, fmt: (v: number) => string) => {
    const x = m.get(`${ventana}|${nombre}`)
    if (!x) return <span className="text-suave">—</span>
    return (
      <>
        {fmt(x.valor)}
        {x.percentil != null && <span className={`ml-1 text-[10px] ${colorPercentil(x.percentil)}`}>p{Math.round(x.percentil)}</span>}
      </>
    )
  }
  const anos = [...new Set((datos.metricas ?? []).filter((x) => /^\d{4}$/.test(x.ventana)).map((x) => x.ventana))].sort().reverse()
  const recup = m.get('10a|recuperacion_semanas')?.valor
  const textoRef = ref.metodo === 'indice' ? ref.indice?.nombre : ref.metodo === 'media_categoria' ? 'media de su categoría' : 'sin referencia'

  return (
    <article className="space-y-5">
      <header>
        <h1 className="text-base font-bold text-texto">{f.nombre}</h1>
        <p className="text-suave">
          {f.isin} · {f.categoria ?? 'sin categoría'} · {f.divisa}
          {!f.en_universo && <span className="text-aviso"> · fuera del universo</span>}
        </p>
      </header>

      <dl className="grid grid-cols-2 gap-px border border-borde bg-borde sm:grid-cols-5">
        {[
          ['TER', pct((f.ter ?? NaN) / 100, 2, false)],
          ['Patrimonio', millones(f.patrimonio_meur)],
          ['Lanzamiento', fecha(f.fecha_lanzamiento)],
          ['Referencia', textoRef ?? '—'],
          ['Último valor', datos.serie.length ? `${fecha(datos.serie.at(-1)!.fecha)}` : '—'],
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

      <section className="grid gap-px border border-borde bg-borde sm:grid-cols-4">
        {[
          ['Este año', celda('ytd', 'rentabilidad', (v) => pct(v))],
          ['Consistencia', celda('hist', 'consistencia', (v) => `${cifra(v, 0)} %`)],
          ['Captura alcista / bajista 5A', <>{celda('5a', 'captura_alcista', (v) => cifra(v, 0))} / {celda('5a', 'captura_bajista', (v) => cifra(v, 0))}</>],
          ['Recuperación de la peor caída', recup == null ? '—' : recup < 0 ? 'sin recuperar' : `${cifra(recup, 0)} semanas`],
        ].map(([k, v], i) => (
          <div key={i} className="bg-fondo px-3 py-2">
            <div className="text-[10px] uppercase tracking-widest text-suave">{k}</div>
            <div className="tabular">{v}</div>
          </div>
        ))}
      </section>

      {anos.length > 0 && (
        <section className="overflow-x-auto">
          <h2 className="mb-1 text-[11px] uppercase tracking-widest text-suave">Por año natural</h2>
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
    </article>
  )
}
