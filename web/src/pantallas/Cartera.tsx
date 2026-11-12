import { useEffect, useMemo, useState } from 'react'
import { cifra, fecha, pct } from '../calculo/formato'
import { exposicion, type Composicion, type Fila } from '../calculo/exposicion'
import { simular, type Punto } from '../calculo/series'
import Grafico from '../componentes/Grafico'
import * as q from '../datos/consultas'
import { serieEur } from './Ficha'

type Datos = {
  cartera: q.Cartera
  fondos: (q.CarteraFondo & { serie: Punto[]; comp: Composicion | null; fechaCartera: string | null })[]
  metricas: Map<string, number>
}

async function cargar(id: number): Promise<Datos | null> {
  const c = await q.cartera(id)
  if (!c) return null
  const isins = c.fondos.map((f) => f.fondo.isin)
  const [series, ms, comps] = await Promise.all([
    Promise.all(c.fondos.map((f) => serieEur(f.fondo.isin, f.fondo.divisa))),
    q.metricasDe(isins),
    q.composiciones(isins),
  ])
  const metricas = new Map(ms.filter((m) => m.nombre === 'rentabilidad').map((m) => [`${m.isin}|${m.ventana}`, Number(m.valor)]))
  const comp = new Map(comps.map((x) => [x.isin, x]))
  return {
    cartera: c.cartera,
    fondos: c.fondos.map((f, i) => ({ ...f, serie: series[i], comp: comp.get(f.fondo.isin)?.datos ?? null, fechaCartera: comp.get(f.fondo.isin)?.fecha_cartera ?? null })),
    metricas,
  }
}

/** Fondos y pesos de una cartera modelo y su valor simulado en base 100. */
export default function Cartera({ id }: { id: number }) {
  const [datos, setDatos] = useState<Datos | null | undefined>(undefined)
  const [error, setError] = useState('')

  useEffect(() => {
    cargar(id).then(setDatos).catch((e: Error) => setError(e.message))
  }, [id])

  const sim = useMemo(() => (datos ? simular(datos.fondos, datos.cartera.rebalanceo) : []), [datos])
  // El fondo con el histórico más corto marca el inicio de la simulación.
  const limita = useMemo(
    () => datos?.fondos.filter((f) => f.serie.length).sort((a, b) => b.serie[0].fecha.localeCompare(a.serie[0].fecha))[0],
    [datos],
  )

  if (error) return <p className="text-baja">No se ha podido leer la cartera: {error}</p>
  if (datos === undefined) return <p className="text-suave">Cargando…</p>
  if (!datos) return <p className="text-suave">No existe esa cartera.</p>

  const sinDatos = datos.fondos.filter((f) => !f.serie.length)
  const x = exposicion(datos.fondos.map((f) => ({ peso: f.peso, nombre: f.fondo.nombre, c: f.comp, duracion: f.fondo.duracion_efectiva })))
  // Cartera publicada hace más de 6 meses: Morningstar da lo último que le ha enviado el fondo
  const antiguas = datos.fondos.filter((f) => f.fechaCartera && f.fechaCartera < haceMeses(6))
  const suma = datos.fondos.reduce((s, f) => s + f.peso, 0)

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-lg font-bold text-acento">{datos.cartera.nombre}</h1>
        <p className="text-suave">
          {datos.fondos.length} fondos · rebalanceo {datos.cartera.rebalanceo}
          {datos.cartera.objetivo && ` · ${datos.cartera.objetivo}`}
        </p>
        {Math.abs(suma - 100) > 0.01 && <p className="text-baja">Los pesos suman {suma} %, no 100 %.</p>}
      </header>

      <div className="overflow-x-auto">
        <table className="w-full text-right">
          <thead className="text-[11px] uppercase tracking-widest text-suave">
            <tr className="border-b border-borde">
              <th className="py-1 text-left font-normal">Fondo</th>
              <th className="font-normal">Peso</th>
              <th className="font-normal">TER</th>
              <th className="font-normal">3A anual</th>
              <th className="font-normal">5A anual</th>
            </tr>
          </thead>
          <tbody>
            {datos.fondos.map(({ fondo: f, peso }) => (
              <tr key={f.isin} className="border-b border-borde/50">
                <td className="py-1 text-left">
                  <a href={`#/fondo/${f.isin}`} className="hover:text-acento">{f.nombre}</a>
                  <span className="text-suave"> · {f.isin}</span>
                </td>
                <td>{pct(peso / 100, 0, false)}</td>
                <td>{pct((f.ter ?? NaN) / 100, 2, false)}</td>
                <td>{pct(datos.metricas.get(`${f.isin}|3a`))}</td>
                <td>{pct(datos.metricas.get(`${f.isin}|5a`))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section>
        <h2 className="mb-2 text-[11px] uppercase tracking-widest text-suave">Valor simulado (base 100)</h2>
        {sinDatos.length ? (
          <p className="text-suave">Sin precios todavía: {sinDatos.map((f) => f.fondo.nombre).join(', ')}. Se cargan en la próxima descarga.</p>
        ) : (
          <>
            <p className="mb-2 text-suave">
              Desde {fecha(sim[0]?.fecha)}, limitada por {limita?.fondo.nombre}.
            </p>
            <Grafico lineas={[{ nombre: datos.cartera.nombre, serie: sim, color: '#4fd18b' }]} />
          </>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-[11px] uppercase tracking-widest text-suave">Exposición (X-Ray)</h2>
        {x.cobertura === 0 ? (
          <p className="text-suave">Sin composición todavía: se descarga los domingos.</p>
        ) : (
          <>
            <p className="text-suave">
              Cartera de cada fondo según Morningstar, ponderada por su peso
              {x.cobertura < 99.5 && <span className="text-aviso"> · solo el {pct(x.cobertura / 100, 0, false)} de la cartera tiene datos</span>}
              {x.cortos.length > 0 && <> · cifras netas: {x.cortos.join(', ')} tiene posiciones cortas</>}
              {antiguas.length > 0 && (
                <span className="text-aviso"> · cartera antigua: {antiguas.map((f) => `${f.fondo.nombre} (${fecha(f.fechaCartera)})`).join(', ')}</span>
              )}
            </p>
            <div className="grid gap-x-8 gap-y-6 md:grid-cols-2">
              <Barras titulo="Tipo de activo" filas={x.activos} />
              <Barras titulo="Mercados (de la renta variable)" filas={x.mercados} />
              <Barras titulo="Regiones (de la renta variable)" filas={x.regiones} />
              <Barras titulo="Sectores (de la renta variable)" filas={x.sectores} />
              <Barras titulo="Renta fija por sector" filas={x.sectoresRf} />
              <div>
                <Barras titulo="Calidad crediticia (de los bonos)" filas={x.calidad} />
                <p className="mt-2 text-suave">
                  TIR media {x.tir == null ? '—' : pct(x.tir / 100, 2, false)} · duración efectiva {x.duracion == null ? '—' : `${cifra(x.duracion, 1)} años`}
                </p>
              </div>
            </div>
            <div>
              <h3 className="mb-1 text-[11px] uppercase tracking-widest text-suave">Mayores posiciones de la cartera</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-right tabular">
                  <tbody>
                    {x.posiciones.slice(0, 15).map((p) => (
                      <tr key={p.isin || p.nombre} className="border-b border-borde/50">
                        <td className="py-1 text-left">
                          {p.nombre}
                          {p.isin && <span className="text-suave"> · {p.isin}</span>}
                        </td>
                        <td className="text-suave">{p.fondos > 1 ? `en ${p.fondos} fondos` : ''}</td>
                        <td className="w-20">{pct(p.peso / 100, 2, false)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {x.incompletas.length > 0 && (
                <p className="mt-2 text-suave">Morningstar solo da las mayores posiciones de: {x.incompletas.join(', ')}.</p>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  )
}

function haceMeses(n: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - n)
  return d.toISOString().slice(0, 10)
}

/** Reparto en barras de texto: nombre, barra proporcional y %. */
function Barras({ titulo, filas }: { titulo: string; filas: Fila[] }) {
  if (!filas.length) return null
  const max = Math.max(...filas.map(([, v]) => Math.abs(v)), 1)
  return (
    <div>
      <h3 className="mb-1 text-[11px] uppercase tracking-widest text-suave">{titulo}</h3>
      <ul className="space-y-0.5">
        {filas.map(([nombre, v]) => (
          <li key={nombre} className="grid grid-cols-[minmax(0,10rem)_1fr_4rem] items-center gap-2">
            <span className="truncate">{nombre}</span>
            <span className="h-2 bg-panel" aria-hidden="true">
              <span className={`block h-2 ${v < 0 ? 'bg-baja' : 'bg-acento'}`} style={{ width: `${(Math.abs(v) / max) * 100}%` }} />
            </span>
            <span className="text-right tabular">{pct(v / 100, 1, false)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
