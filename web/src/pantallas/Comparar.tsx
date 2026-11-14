import { useEffect, useMemo, useState } from 'react'
import type { Composicion } from '../calculo/exposicion'
import { cifra, colorPercentil, millones, pct } from '../calculo/formato'
import { rendimientos, riesgo, semanal } from '../calculo/metricas'
import { base100, haceAnos, inicioComun, type Punto } from '../calculo/series'
import Buscador from '../componentes/Buscador'
import { MatrizCorrelacion, Solapes } from '../componentes/EstadisticasCartera'
import { Titulo } from '../componentes/Exposicion'
import Grafico from '../componentes/Grafico'
import * as q from '../datos/consultas'
import { FILAS } from './Ficha'
import { serieEur } from '../datos/series'

type Datos = { fondo: q.Fondo; serie: Punto[]; metricas: Map<string, q.Metrica>; comp: Composicion | null }

export const MAX_COMPARAR = 5
const COLORES = ['#4fd18b', '#e0b84f', '#6fa8ff', '#e0736f', '#c58cf0']
const RANGOS = [['1a', 1], ['3a', 3], ['5a', 5], ['10a', 10]] as const

async function cargar(isin: string): Promise<Datos | null> {
  const fondo = await q.fondo(isin)
  if (!fondo) return null
  const [serie, ms, comps] = await Promise.all([serieEur(isin, fondo.divisa), q.metricasDe([isin]), q.composiciones([isin])])
  return { fondo, serie, metricas: new Map(ms.map((m) => [`${m.ventana}|${m.nombre}`, m])), comp: comps[0]?.datos ?? null }
}

/** Comparador: hasta 5 fondos con sus métricas en paralelo, gráfico base 100, correlaciones y posiciones en común. */
export default function Comparar({ isins }: { isins: string[] }) {
  const [datos, setDatos] = useState<Map<string, Datos | null>>(new Map())
  const [error, setError] = useState('')
  const [rango, setRango] = useState(3)

  useEffect(() => {
    const faltan = isins.filter((i) => !datos.has(i))
    if (!faltan.length) return
    Promise.all(faltan.map(async (i) => [i, await cargar(i)] as const))
      .then((nuevos) => setDatos((d) => new Map([...d, ...nuevos])))
      .catch((e: Error) => setError(e.message))
  }, [isins.join()]) // eslint-disable-line react-hooks/exhaustive-deps

  const ir = (lista: string[]) => (location.hash = lista.length ? `#/comparar/${lista.join(',')}` : '#/comparar')
  const fondos = isins.map((i) => datos.get(i)).filter((d): d is Datos => !!d)
  const listos = isins.every((i) => datos.has(i))

  const lineas = useMemo(() => {
    const conSerie = fondos.filter((d) => d.serie.length)
    if (!conSerie.length) return []
    const ultima = conSerie.map((d) => d.serie.at(-1)!.fecha).sort()[0]
    const desde = inicioComun(conSerie.map((d) => d.serie), haceAnos(ultima, rango))
    return conSerie.map((d) => ({ nombre: d.fondo.nombre, serie: base100(d.serie, desde), color: COLORES[isins.indexOf(d.fondo.isin)] }))
  }, [listos, rango, isins.join()]) // eslint-disable-line react-hooks/exhaustive-deps

  const corr = useMemo(() => (fondos.length > 1 ? riesgo(fondos.map((d) => rendimientos(semanal(d.serie))), fondos.map(() => 1)) : null),
    [listos, isins.join()]) // eslint-disable-line react-hooks/exhaustive-deps

  const celda = (d: Datos, ventana: string, nombre: string, fmt: (v: number) => string) => {
    const x = d.metricas.get(`${ventana}|${nombre}`)
    if (!x) return <span className="text-suave">—</span>
    return <>{fmt(x.valor)}{x.percentil != null && <span className={`ml-1 text-[10px] ${colorPercentil(x.percentil)}`}>p{Math.round(x.percentil)}</span>}</>
  }
  const ventana = RANGOS.find(([, n]) => n === rango)![0]

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-lg font-bold text-acento">Comparador</h1>
        <ul className="flex flex-wrap gap-2">
          {isins.map((i, k) => (
            <li key={i} className="flex items-center gap-2 border border-borde px-2 py-1">
              <span style={{ color: COLORES[k] }} aria-hidden="true">■</span>
              <a href={`#/fondo/${i}`} className="hover:text-acento">{datos.get(i)?.fondo.nombre ?? i}</a>
              <button onClick={() => ir(isins.filter((x) => x !== i))} aria-label={`Quitar ${datos.get(i)?.fondo.nombre ?? i}`} className="text-suave hover:text-baja">×</button>
            </li>
          ))}
        </ul>
        {isins.length < MAX_COMPARAR
          ? <Buscador texto={`añadir fondo (hasta ${MAX_COMPARAR}): nombre o ISIN`} onElegir={(f) => !isins.includes(f.isin) && ir([...isins, f.isin])} />
          : <p className="text-suave">Como mucho {MAX_COMPARAR} fondos: quita uno para añadir otro.</p>}
      </header>

      {error && <p className="text-baja">No se han podido leer los fondos: {error}</p>}
      {isins.some((i) => datos.get(i) === null) && <p className="text-aviso">No existe: {isins.filter((i) => datos.get(i) === null).join(', ')}.</p>}
      {!isins.length && <p className="text-suave">Añade fondos para compararlos (también desde la ficha de un fondo o desde Revisión).</p>}
      {isins.length > 0 && !listos && <p className="text-suave">Cargando…</p>}

      {listos && fondos.length > 0 && (
        <>
          <section>
            <div className="mb-1 flex items-center gap-1">
              {RANGOS.map(([etiqueta, n]) => (
                <button key={etiqueta} onClick={() => setRango(n)}
                  className={`border px-2 py-0.5 ${rango === n ? 'border-acento text-acento' : 'border-borde text-suave hover:text-texto'}`}>
                  {etiqueta.toUpperCase()}
                </button>
              ))}
              <span className="ml-auto text-[11px] text-suave">base 100 · EUR · desde el primer día común</span>
            </div>
            {lineas.length ? <Grafico lineas={lineas} /> : <p className="text-suave">Aún no hay valores descargados.</p>}
          </section>

          <section className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-right tabular [&_tr>*+*]:pl-3">
              <thead>
                <tr className="border-b border-borde text-[11px] uppercase tracking-widest text-suave">
                  <th className="py-1 text-left font-normal">{ventana.toUpperCase()}</th>
                  {fondos.map((d) => (
                    <th key={d.fondo.isin} className="max-w-48 py-1 font-normal normal-case tracking-normal" title={d.fondo.nombre}>
                      <span style={{ color: COLORES[isins.indexOf(d.fondo.isin)] }} aria-hidden="true">■ </span>{d.fondo.nombre.split(' ').slice(0, 4).join(' ')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {([
                  ['Categoría', (d: Datos) => <span className="text-suave">{d.fondo.categoria ?? '—'}</span>],
                  ['TER', (d: Datos) => celda(d, 'hoy', 'ter', (v) => pct(v / 100, 2, false))],
                  ['Patrimonio', (d: Datos) => millones(d.fondo.patrimonio_meur)],
                  ['Gestión', (d: Datos) => d.fondo.gestion ?? '—'],
                  ['Este año', (d: Datos) => celda(d, 'ytd', 'rentabilidad', (v) => pct(v))],
                ] as const).map(([n, f]) => (
                  <tr key={n} className="border-b border-borde/50">
                    <td className="py-1 text-left text-suave">{n}</td>
                    {fondos.map((d) => <td key={d.fondo.isin}>{f(d)}</td>)}
                  </tr>
                ))}
                {FILAS.map(([nombre, etiqueta, fmt]) => (
                  <tr key={nombre} className="border-b border-borde/50">
                    <td className="py-1 text-left text-suave">{etiqueta}</td>
                    {fondos.map((d) => <td key={d.fondo.isin}>{celda(d, ventana, nombre, fmt)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-[11px] text-suave">Métricas a {ventana.toUpperCase()} (cambia con el plazo del gráfico). pNN = percentil en su categoría (100 = mejor); cada fondo frente a su propia referencia.</p>
          </section>

          {fondos.length > 1 && (
            <section>
              <Titulo>Cómo se mueven juntos</Titulo>
              {corr ? (
                <>
                  <MatrizCorrelacion nombres={fondos.map((d) => d.fondo.nombre)} matriz={corr.matriz} />
                  <p className="mt-1 text-suave">Correlación de las rentabilidades semanales de las últimas {corr.semanas} semanas comunes (hasta 3 años): por encima de {cifra(0.9)} es casi el mismo fondo.</p>
                </>
              ) : <p className="text-suave">Menos de un año de historia común.</p>}
            </section>
          )}
          {fondos.length > 1 && <Solapes fondos={fondos.map((d) => ({ nombre: d.fondo.nombre, c: d.comp }))} />}
        </>
      )}
    </div>
  )
}
