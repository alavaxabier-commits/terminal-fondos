import { useEffect, useMemo, useState } from 'react'
import { calcularCartera, cambiosCartera, type CalculoCartera } from '../calculo/cartera'
import { cifra, fecha, hoy, pct } from '../calculo/formato'
import { rendimientos, simularCartera, type Bandas } from '../calculo/metricas'
import { base100 } from '../calculo/series'
import Buscador from '../componentes/Buscador'
import { Titulo } from '../componentes/Exposicion'
import Grafico from '../componentes/Grafico'
import * as q from '../datos/consultas'
import { cargarFondo, type DatosFondo } from './Cartera'
import Cargando from '../componentes/Cargando'

type Pesos = Map<string, number> // ISIN → %

const VENTANAS = [['3a', '3A'], ['5a', '5A'], ['10a', '10A']] as const
// [nombre, clave, formato, 1 si más es mejor / -1 si menos es mejor]
const CIFRAS: [string, string, (v: number | undefined) => string, 1 | -1][] = [
  ['Rentabilidad anual', 'rentabilidad', (v) => pct(v), 1],
  ['Volatilidad', 'volatilidad', (v) => pct(v, 1, false), -1],
  ['Caída máxima', 'max_caida', (v) => pct(v), 1],
  ['Sharpe', 'sharpe', (v) => cifra(v), 1],
]

const suma = (p: Pesos) => [...p.values()].reduce((s, x) => s + x, 0)
const correlacionMedia = (c: CalculoCartera | null) => {
  const xs = c?.correlacion?.matriz.flatMap((fila, i) => fila.filter((v, j) => j > i && v != null) as number[]) ?? []
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null
}

/** Simulador: la cartera guardada frente a una propuesta (pesos, fondos que entran o salen), con el mismo rebalanceo.
 *  `sale`/`entra`: propuesta inicial que cambia un fondo por otro con el mismo peso (desde Revisión). */
export default function Simular({ id, sale, entra }: { id: number; sale?: string; entra?: string }) {
  const [guardada, setGuardada] = useState<{ cartera: q.Cartera; fondos: q.CarteraFondo[] } | null | undefined>(undefined)
  const [fondos, setFondos] = useState<q.Fondo[]>([]) // los de la cartera y los añadidos, en orden
  const [propuesta, setPropuesta] = useState<Pesos>(new Map())
  const [cats, setCats] = useState<Awaited<ReturnType<typeof q.categoriasReferencia>> | null>(null)
  const [rf, setRf] = useState<Map<string, number>>(new Map())
  const [datos, setDatos] = useState<Map<string, DatosFondo>>(new Map())
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    Promise.all([q.cartera(id), q.categoriasReferencia(), q.referenciaSeries(['indice:estr']), entra ? q.fondo(entra) : null])
      .then(([c, cs, estr, nuevo]) => {
        setCats(cs)
        setRf(rendimientos(estr.get('indice:estr')?.semanal ?? new Map()))
        setGuardada(c)
        if (!c) return
        const p: Pesos = new Map(c.fondos.map((l) => [l.fondo.isin, l.peso]))
        const fs = c.fondos.map((l) => l.fondo)
        if (sale && nuevo && p.has(sale) && !p.has(nuevo.isin)) {
          p.set(nuevo.isin, p.get(sale)!)
          p.set(sale, 0)
          fs.push(nuevo)
          setMotivo(`Cambio de ${fs.find((f) => f.isin === sale)?.nombre} por ${nuevo.nombre}`)
        }
        setFondos(fs)
        setPropuesta(p)
      })
      .catch((e: Error) => setError(e.message))
  }, [id, sale, entra])

  const faltan = fondos.filter((f) => !datos.has(f.isin))
  useEffect(() => {
    if (!cats || !faltan.length) return
    let vigente = true
    Promise.all(faltan.map(async (f) => [f.isin, await cargarFondo(f, cats)] as const))
      .then((nuevos) => vigente && setDatos((d) => new Map([...d, ...nuevos])))
      .catch((e: Error) => setError(e.message))
    return () => { vigente = false }
  }, [cats, faltan.map((f) => f.isin).join()]) // eslint-disable-line react-hooks/exhaustive-deps

  const actual: Pesos = useMemo(() => new Map(guardada?.fondos.map((l) => [l.fondo.isin, l.peso])), [guardada])
  const listos = fondos.length > 0 && fondos.every((f) => datos.has(f.isin))
  const c = guardada?.cartera
  const reb = c?.rebalanceo ?? 'anual'
  const bandas = useMemo<Bandas>(() => ({ banda: c?.banda || 5, tipo: c?.banda_tipo ?? 'puntos', revision: c?.revision ?? 'diaria' }), [c])

  const simular = (p: Pesos) => {
    const fs = [...p].filter(([, x]) => x > 0).map(([isin, peso]) => {
      const d = datos.get(isin)!
      return { isin, peso, ...d, vol3: d.metricas.get('3a|volatilidad') ?? null }
    })
    if (!fs.length || fs.some((f) => f.serie.length < 2)) return null
    return { sim: simularCartera(fs, reb, bandas).valor, calc: calcularCartera(fs, reb, rf, hoy(), bandas) }
  }
  const clave = (p: Pesos) => JSON.stringify([...p])
  const a = useMemo(() => (listos ? simular(actual) : null), [listos, clave(actual), rf, bandas]) // eslint-disable-line react-hooks/exhaustive-deps
  const b = useMemo(() => (listos ? simular(propuesta) : null), [listos, clave(propuesta), rf, bandas]) // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <p className="text-baja">No se ha podido simular: {error}</p>
  if (guardada === undefined) return <Cargando pagina />
  if (!guardada || !c) return <p className="text-suave">No existe esa cartera.</p>

  const nombreDe = (isin: string) => fondos.find((f) => f.isin === isin)?.nombre ?? isin
  const ter = (p: Pesos) => {
    const fs = [...p].filter(([, x]) => x > 0)
    return fs.every(([i]) => fondos.find((f) => f.isin === i)?.ter != null)
      ? fs.reduce((s, [i, x]) => s + x * Number(fondos.find((f) => f.isin === i)!.ter), 0) / (suma(p) || 1) : null
  }
  const cambia = (isin: string, peso: number) => setPropuesta((p) => new Map(p).set(isin, peso))
  const total = suma(propuesta)
  const igual = clave(new Map([...propuesta].filter(([, x]) => x > 0))) === clave(actual)
  const desde = a?.sim[0] && b?.sim[0] ? [a.sim[0].fecha, b.sim[0].fecha].sort()[1] : null
  const lineas = desde ? [
    { nombre: 'Actual', serie: base100(a!.sim, desde), color: 'suave' },
    { nombre: 'Propuesta', serie: base100(b!.sim, desde), color: 'acento' },
  ] : []

  async function aplicar() {
    if (!confirm(`¿Guardar la propuesta como la nueva composición de «${c!.nombre}»? El cambio queda en su historial.`)) return
    setOcupado(true)
    try {
      const ahora = new Map([...propuesta].filter(([, x]) => x > 0))
      const { id: _, ...datosCartera } = c!
      await q.guardarCartera(id, datosCartera, [...ahora].map(([isin, peso]) => ({ isin, peso })), cambiosCartera(actual, ahora, motivo, nombreDe))
      location.hash = `#/cartera/${id}`
    } catch (e) { setError((e as Error).message) } finally { setOcupado(false) }
  }

  const fila = (n: string, va: string, vb: string, mejor: boolean | null) => (
    <tr key={n} className="border-b border-borde/50">
      <td className="py-1 text-left">{n}</td>
      <td className="text-suave">{va}</td>
      <td className={mejor == null ? '' : mejor ? 'text-sube' : 'text-baja'}>{vb}</td>
    </tr>
  )
  const compara = (x: number | null | undefined, y: number | null | undefined, signo: 1 | -1) =>
    x == null || y == null || Math.abs(x - y) < 1e-9 ? null : (y - x) * signo > 0

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-lg font-bold text-acento">Simulador · <a href={`#/cartera/${id}`} className="hover:underline">{c.nombre}</a></h1>
        <p className="text-suave">La cartera guardada frente a la propuesta, las dos con rebalanceo {reb === 'bandas' ? 'por bandas' : reb}. Nada se guarda hasta pulsar «aplicar».</p>
      </header>

      <section className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-right tabular [&_tr>*+*]:pl-3">
          <thead className="rotulo">
            <tr className="border-b border-borde">
              <th className="py-1 text-left font-normal">Fondo</th><th className="font-normal">Actual</th><th className="font-normal">Propuesta</th><th />
            </tr>
          </thead>
          <tbody>
            {fondos.map((f) => {
              const pa = actual.get(f.isin) ?? 0, pb = propuesta.get(f.isin) ?? 0
              return (
                <tr key={f.isin} className={`border-b border-borde/50 ${pa !== pb ? 'bg-aviso/5' : ''}`}>
                  <td className="py-1 text-left"><a href={`#/fondo/${f.isin}`} className="hover:text-acento">{f.nombre}</a></td>
                  <td className="text-suave">{pa ? pct(pa / 100, 1, false) : '—'}</td>
                  <td>
                    <input type="number" min={0} max={100} step={0.5} value={pb} aria-label={`Peso propuesto de ${f.nombre}`}
                      onChange={(e) => cambia(f.isin, Number(e.target.value))}
                      className="w-16 border border-borde bg-panel px-1 py-0.5 text-right outline-none focus:border-acento" />
                  </td>
                  <td>
                    {pb > 0 ? <button onClick={() => cambia(f.isin, 0)} className="min-h-8 px-2 text-suave hover:text-baja">quitar</button>
                      : pa > 0 && <button onClick={() => cambia(f.isin, pa)} className="min-h-8 px-2 text-suave hover:text-texto">volver</button>}
                  </td>
                </tr>
              )
            })}
            <tr className="text-suave">
              <td className="py-1 text-left">Suma</td><td>{pct(suma(actual) / 100, 1, false)}</td>
              <td className={Math.abs(total - 100) >= 0.01 ? 'text-baja' : ''}>{pct(total / 100, 1, false)}</td><td />
            </tr>
          </tbody>
        </table>
      </section>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Buscador texto="añadir fondo a la propuesta: nombre o ISIN"
          onElegir={(f) => { if (!fondos.some((x) => x.isin === f.isin)) { setFondos((fs) => [...fs, f]); cambia(f.isin, 0) } }} />
        <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="motivo (va al historial si se aplica)"
          aria-label="Motivo del cambio" className="flex-1 border border-borde bg-panel px-2 py-1 outline-none focus:border-acento" />
        <button onClick={aplicar} disabled={ocupado || igual || Math.abs(total - 100) >= 0.01 || [...propuesta.values()].some((x) => x < 0)}
          className="min-h-9 border border-acento px-3 text-acento disabled:border-borde disabled:text-suave">aplicar</button>
      </div>
      {Math.abs(total - 100) >= 0.01 && <p className="text-aviso">Los pesos de la propuesta suman {cifra(total, 1)} %: se simula igual (repartidos en proporción), pero para aplicarla tienen que sumar 100 %.</p>}

      {!listos ? <p className="text-suave">Cargando precios…</p> : !a || !b ? <p className="text-suave">Algún fondo no tiene precios todavía.</p> : (
        <>
          <section>
            <Titulo>Backtest (base 100)</Titulo>
            <p className="mb-2 text-suave">Desde {fecha(desde)}, el primer día con datos de las dos.</p>
            <Grafico lineas={lineas} />
          </section>

          <section className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
            {VENTANAS.map(([v, t]) => (
              <div key={v} className="overflow-x-auto">
                <Titulo>{t}</Titulo>
                <table className="w-full text-right tabular whitespace-nowrap [&_tr>*+*]:pl-3">
                  <thead className="rotulo">
                    <tr className="border-b border-borde"><th className="py-1" /><th className="font-normal">Actual</th><th className="font-normal">Propuesta</th></tr>
                  </thead>
                  <tbody>
                    {CIFRAS.map(([n, k, f, s]) => {
                      const x = a.calc?.metricas[v]?.[k], y = b.calc?.metricas[v]?.[k]
                      return fila(n, f(x), f(y), compara(x, y, s))
                    })}
                  </tbody>
                </table>
              </div>
            ))}
            <div className="overflow-x-auto">
              <Titulo>Coste y diversificación</Titulo>
              <table className="w-full text-right tabular whitespace-nowrap [&_tr>*+*]:pl-3">
                <thead className="rotulo">
                  <tr className="border-b border-borde"><th className="py-1" /><th className="font-normal">Actual</th><th className="font-normal">Propuesta</th></tr>
                </thead>
                <tbody>
                  {fila('Coste anual (TER)', pct((ter(actual) ?? NaN) / 100, 2, false), pct((ter(propuesta) ?? NaN) / 100, 2, false), compara(ter(actual), ter(propuesta), -1))}
                  {fila('Correlación media entre fondos', cifra(correlacionMedia(a.calc)), cifra(correlacionMedia(b.calc)), compara(correlacionMedia(a.calc), correlacionMedia(b.calc), -1))}
                  {(() => {
                    const q3 = (x: CalculoCartera | null) => x?.volatilidadMedia != null && x.metricas['3a']?.volatilidad != null ? x.volatilidadMedia - x.metricas['3a'].volatilidad : null
                    return fila('Volatilidad que quita diversificar (3A)', pct(q3(a.calc), 1, false), pct(q3(b.calc), 1, false), compara(q3(a.calc), q3(b.calc), 1))
                  })()}
                  {fila('Simulada desde', fecha(a.calc?.desde), fecha(b.calc?.desde), null)}
                </tbody>
              </table>
            </div>
          </section>
          <p className="text-suave">En verde, lo que mejora la propuesta; en rojo, lo que empeora. Cada ventana acaba en el último dato y solo sale con la historia completa.</p>
        </>
      )}
    </div>
  )
}
