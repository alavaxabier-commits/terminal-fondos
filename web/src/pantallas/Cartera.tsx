import { useEffect, useMemo, useState } from 'react'
import { fecha, pct } from '../calculo/formato'
import type { Composicion } from '../calculo/exposicion'
import { simular, type Punto } from '../calculo/series'
import Exposicion from '../componentes/Exposicion'
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

      <Exposicion
        fondos={datos.fondos.map((f) => ({ peso: f.peso, nombre: f.fondo.nombre, c: f.comp, duracion: f.fondo.duracion_efectiva, fechaCartera: f.fechaCartera }))}
      />
    </div>
  )
}
