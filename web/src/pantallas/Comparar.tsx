import { useCallback, useEffect, useMemo, useState } from 'react'
import { exposicion, type Composicion, type Fila } from '../calculo/exposicion'
import { cifra, colorPercentil, millones, pct } from '../calculo/formato'
import { rendimientos, riesgo, semanal } from '../calculo/metricas'
import { BLOQUES, bloques, NOMBRE_BLOQUE, nota, grupoPesos, PESOS_TIPO_DEFECTO, tipoActivo, type Plazo } from '../calculo/nota'
import { base100, caidas, haceAnos, inicioComun, type Punto } from '../calculo/series'
import Candidatos from '../componentes/Candidatos'
import Dispersion from '../componentes/Dispersion'
import { MatrizCorrelacion, Solapes } from '../componentes/EstadisticasCartera'
import Grafico from '../componentes/Grafico'
import Tarjeta from '../componentes/Tarjeta'
import { escribiendo } from '../componentes/teclas'
import { bandeja, fijarBandeja, MAX_BANDEJA, type EnBandeja } from '../datos/bandeja'
import * as q from '../datos/consultas'
import { serieEur } from '../datos/series'
import { FILAS, GRUPOS } from './Ficha'
import Cargando from '../componentes/Cargando'
import Fallo from '../componentes/Fallo'

type Datos = { fondo: q.Fondo; serie: Punto[]; metricas: Map<string, q.Metrica>; comp: Composicion | null }

// Tres colores validados (dataviz) y dos grises para el 4.º y el 5.º, que se leen por su nombre y por la tabla. Tokens de estilos.css.
const COLORES = ['serie1', 'serie2', 'serie3', 'serie4', 'serie5']
const RANGOS = [1, 3, 5, 10] as const
const PESTANAS = ['resumen', 'evolución', 'cifras', 'composición'] as const
type Pestana = (typeof PESTANAS)[number]
const MENOS = new Set(['volatilidad', 'volatilidad_mensual', 'tracking_error', 'captura_bajista', 'ter']) // menos es mejor
const SIN_MEJOR = new Set(['beta', 'r2']) // ni más ni menos es mejor
const FMT = Object.fromEntries(FILAS.map(([n, , f]) => [n, f]))
const ETIQUETA = Object.fromEntries(FILAS.map(([n, e]) => [n, e]))

async function cargar(isin: string): Promise<Datos | null> {
  const fondo = await q.fondo(isin)
  if (!fondo) return null
  const [serie, ms, comps] = await Promise.all([serieEur(isin, fondo.divisa), q.metricasDe([isin]), q.composiciones([isin])])
  return { fondo, serie, metricas: new Map(ms.map((m) => [`${m.ventana}|${m.nombre}`, m])), comp: comps[0]?.datos ?? null }
}

/** Posición del mejor valor (más alto, o más bajo si `menos`); null si hay menos de dos con valor. */
function mejor(valores: (number | null | undefined)[], menos = false): number | null {
  const con = valores.map((v, i) => [v, i] as const).filter((x): x is readonly [number, number] => x[0] != null)
  if (con.length < 2) return null
  return con.reduce((a, b) => ((menos ? b[0] < a[0] : b[0] > a[0]) ? b : a))[1]
}

/** Comparador: hasta 5 fondos (la lista es la misma que la franja «Comparando»), con un plazo común y cuatro pestañas. */
export default function Comparar({ isins }: { isins: string[] }) {
  const [datos, setDatos] = useState<Map<string, Datos | null>>(new Map())
  const [error, setError] = useState('')
  const [rango, setRango] = useState(3)
  const [pestana, setPestana] = useState<Pestana>('resumen')
  const [anadiendo, setAnadiendo] = useState(false)

  useEffect(() => {
    const faltan = isins.filter((i) => !datos.has(i))
    if (!faltan.length) return
    Promise.all(faltan.map(async (i) => [i, await cargar(i)] as const))
      .then((nuevos) => setDatos((d) => new Map([...d, ...nuevos])))
      .catch((e: Error) => setError(e.message))
  }, [isins.join()]) // eslint-disable-line react-hooks/exhaustive-deps

  const fondos = isins.map((i) => datos.get(i)).filter((d): d is Datos => !!d)
  const listos = isins.every((i) => datos.has(i))
  const nombre = (i: string) => datos.get(i)?.fondo.nombre ?? bandeja().find((x) => x.isin === i)?.nombre ?? i
  const ir = (lista: EnBandeja[]) => {
    fijarBandeja(lista)
    location.hash = lista.length ? `#/comparar/${lista.map((x) => x.isin).join(',')}` : '#/comparar'
  }

  // Con un enlace (Revisión, a mano) la lista del comparador pasa a ser la de la dirección.
  useEffect(() => {
    if (listos) fijarBandeja(fondos.map((d) => ({ isin: d.fondo.isin, nombre: d.fondo.nombre })))
  }, [listos, isins.join()]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (escribiendo(e)) return
      if (e.key === 'a' && isins.length < MAX_BANDEJA) { e.preventDefault(); setAnadiendo(true); return }
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      const p = PESTANAS[PESTANAS.indexOf(pestana) + (e.key === 'ArrowRight' ? 1 : -1)]
      if (p) setPestana(p)
    }
    addEventListener('keydown', tecla)
    return () => removeEventListener('keydown', tecla)
  })

  const cerrarCandidatos = useCallback(() => setAnadiendo(false), [])
  const color = (d: Datos) => COLORES[isins.indexOf(d.fondo.isin)]
  const ventana = `${rango}a`

  const lineas = useMemo(() => {
    const conSerie = fondos.filter((d) => d.serie.length)
    if (!conSerie.length) return []
    const ultima = conSerie.map((d) => d.serie.at(-1)!.fecha).sort()[0]
    const desde = inicioComun(conSerie.map((d) => d.serie), haceAnos(ultima, rango))
    return conSerie.map((d) => ({ nombre: d.fondo.nombre, serie: base100(d.serie, desde), color: color(d) }))
  }, [listos, rango, isins.join()]) // eslint-disable-line react-hooks/exhaustive-deps

  const corr = useMemo(() => (fondos.length > 1 ? riesgo(fondos.map((d) => rendimientos(semanal(d.serie))), fondos.map(() => 1), rango) : null),
    [listos, rango, isins.join()]) // eslint-disable-line react-hooks/exhaustive-deps

  const cats = new Set(fondos.map((d) => d.fondo.categoria))

  return (
    <div className="space-y-4">
      <header className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-3xl!">Comparador</h1>
          <div role="group" aria-label="Plazo" className="flex gap-0.5 rounded-sm bg-borde/50 p-0.5 text-[12px]">
            {RANGOS.map((n) => (
              <button key={n} onClick={() => setRango(n)} aria-pressed={rango === n}
                className={`rounded-sm px-3 py-0.5 ${rango === n ? 'bg-panel text-texto ring-1 ring-borde' : 'text-suave hover:text-texto'}`}>{n}A</button>
            ))}
          </div>
        </div>
        <ul className="flex flex-wrap gap-2">
          {isins.map((i, k) => (
            <li key={i} className="flex items-center gap-2 rounded-lg border border-borde bg-panel px-3 py-1.5">
              <span style={{ color: `var(--color-${COLORES[k]})` }} aria-hidden="true">●</span>
              <span className="min-w-0">
                <a href={`#/fondo/${i}`} className="block hover:text-acento">{nombre(i)}</a>
                <span className="block text-[11px] text-suave">{datos.get(i)?.fondo.categoria ?? (datos.get(i) === null ? 'no existe' : '')}</span>
              </span>
              <button onClick={() => ir(isins.filter((x) => x !== i).map((x) => ({ isin: x, nombre: nombre(x) })))}
                aria-label={`Quitar ${nombre(i)}`} className="min-h-7 min-w-7 text-suave hover:text-baja">✕</button>
            </li>
          ))}
          <li className="flex">
            {isins.length < MAX_BANDEJA
              ? <button onClick={() => setAnadiendo(true)} aria-expanded={anadiendo} title="Tecla a"
                  className="rounded-lg border border-dashed border-borde px-4 py-1.5 text-suave hover:border-acento hover:text-acento">
                  + Añadir fondo <span className="ml-1 text-[11px]">a</span>
                </button>
              : <span className="self-center text-[12px] text-suave">Como mucho {MAX_BANDEJA}: quita uno para añadir otro.</span>}
          </li>
        </ul>
        {cats.size > 1 && <p className="text-[12px] text-aviso">Categorías distintas: los percentiles (pNN y la nota) son frente a la categoría de cada fondo y no se comparan entre sí.</p>}
      </header>

      {error && <Fallo>No se han podido leer los fondos: {error}</Fallo>}
      {!isins.length && <p className="text-suave">Añade fondos para compararlos: con «+ Añadir fondo» (tecla a), o con «+ Comparar» (tecla b) en el screener, el seguimiento o la ficha.</p>}
      {isins.length > 0 && !listos && <Cargando alto="h-80" />}

      {anadiendo && (
        <Candidatos isins={isins} categorias={fondos.map((d) => d.fondo.categoria)} rango={rango} cerrar={cerrarCandidatos}
          anadir={(f) => ir([...isins.map((x) => ({ isin: x, nombre: nombre(x) })), f])} />
      )}

      {listos && fondos.length > 0 && (
        <>
          <div role="tablist" aria-label="Secciones del comparador" className="flex flex-wrap gap-5 border-b border-borde">
            {PESTANAS.map((p) => (
              <button key={p} id={`pestana-${p}`} role="tab" aria-selected={pestana === p} aria-controls="panel-comparar" onClick={() => setPestana(p)}
                className={`-mb-px border-b-2 pb-1.5 capitalize ${pestana === p ? 'border-acento text-texto' : 'border-transparent text-suave hover:text-texto'}`}>{p}</button>
            ))}
            <span className="ml-auto self-center text-[11px] text-suave">← → cambiar · plazo {rango}A en todas</span>
          </div>
          <div id="panel-comparar" role="tabpanel" aria-labelledby={`pestana-${pestana}`} className="space-y-4">
            {pestana === 'resumen' && <Resumen fondos={fondos} color={color} ventana={ventana} />}
            {pestana === 'evolución' && <Evolucion fondos={fondos} color={color} lineas={lineas} />}
            {pestana === 'cifras' && <Cifras fondos={fondos} color={color} ventana={ventana} />}
            {pestana === 'composición' && <ComposicionFondos fondos={fondos} color={color} corr={corr} />}
          </div>
        </>
      )}
    </div>
  )
}

type Props = { fondos: Datos[]; color: (d: Datos) => string }

/** Tabla con una columna por fondo; la primera columna queda fija al desplazar en horizontal. */
function Tabla({ fondos, color, children }: Props & { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] text-right tabular text-[13px] [&_tr>*+*]:pl-3">
        <thead>
          <tr className="border-b border-borde text-[12px] text-suave">
            <th className="sticky left-0 bg-panel" />
            {fondos.map((d) => (
              <th key={d.fondo.isin} className="max-w-44 py-1 align-bottom font-normal" title={d.fondo.nombre}>
                <span style={{ color: `var(--color-${color(d)})` }} aria-hidden="true">● </span>{d.fondo.nombre}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

/** Fila de una métrica: valor y percentil de cada fondo, con el mejor resaltado. */
function FilaMetrica({ fondos, etiqueta, clave, fmt, menos = false, neutra = false }: {
  fondos: Datos[]; etiqueta: React.ReactNode; clave: string; fmt: (v: number) => string; menos?: boolean; neutra?: boolean
}) {
  const xs = fondos.map((d) => d.metricas.get(clave))
  const m = neutra ? null : mejor(xs.map((x) => x?.valor), menos)
  return (
    <tr className="border-b border-borde/50">
      <td className="sticky left-0 bg-panel py-1 text-left text-suave">{etiqueta}</td>
      {xs.map((x, k) => (
        <td key={k} className={k === m ? 'font-semibold text-acento' : ''}>
          {x ? fmt(x.valor) : <span className="text-suave">—</span>}
          {x?.percentil != null && <span className={`ml-1 text-[10px] font-normal ${colorPercentil(x.percentil)}`}>p{Math.round(x.percentil)}</span>}
        </td>
      ))}
    </tr>
  )
}

const Fila = ({ etiqueta, celdas }: { etiqueta: string; celdas: React.ReactNode[] }) => (
  <tr className="border-b border-borde/50">
    <td className="sticky left-0 bg-panel py-1 text-left text-suave">{etiqueta}</td>
    {celdas.map((c, k) => <td key={k}>{c}</td>)}
  </tr>
)

function Resumen({ fondos, color, ventana }: Props & { ventana: string }) {
  const notas = fondos.map((d) => {
    const pcts = Object.fromEntries([...d.metricas].filter(([, x]) => x.percentil != null).map(([k, x]) => [k, x.percentil!]))
    const b = bloques(pcts, d.fondo.gestion === 'indexada', ventana as Plazo, tipoActivo(d.fondo.categoria))
    return b && { bloques: b.bloques, nota: nota(b.bloques, PESOS_TIPO_DEFECTO[grupoPesos(d.fondo.categoria, d.fondo.gestion === 'indexada')]) }
  })
  const barra = (v: number | null | undefined, resaltar: boolean) => v == null ? <span className="text-suave">—</span> : (
    <span className="inline-flex w-full max-w-36 items-center gap-2">
      <span className="relative h-1 flex-1 rounded-sm bg-borde/70"><span className="absolute inset-y-0 left-0 rounded-sm bg-acento" style={{ width: `${v}%` }} /></span>
      <span className={resaltar ? 'font-semibold text-acento' : ''}>{Math.round(v)}</span>
    </span>
  )
  const filaNota = (etiqueta: string, vs: (number | null | undefined)[], fuerte = false) => {
    const m = mejor(vs)
    return (
      <tr key={etiqueta} className={`border-b border-borde/50 ${fuerte ? 'text-[14px]' : ''}`}>
        <td className={`sticky left-0 bg-panel py-1 text-left ${fuerte ? 'text-texto' : 'text-suave'}`}>{etiqueta}</td>
        {vs.map((v, k) => <td key={k}>{barra(v, k === m)}</td>)}
      </tr>
    )
  }
  const puntos = fondos.flatMap((d) => {
    const r = d.metricas.get(`${ventana}|rentabilidad`), v = d.metricas.get(`${ventana}|volatilidad`)
    return r && v ? [{ nombre: d.fondo.nombre, x: v.valor * 100, y: r.valor * 100, color: color(d) }] : []
  })
  const plazo = ventana.toUpperCase()

  return (
    <>
      <Tarjeta titulo="Lo esencial" extra={<span className="text-[12px] text-suave">a {plazo} · en acento, el mejor de cada fila · pNN, percentil en su categoría</span>}>
        <Tabla fondos={fondos} color={color}>
          <FilaMetrica fondos={fondos} etiqueta="Gastos (TER)" clave="hoy|ter" fmt={(v) => `${cifra(v)} %`} menos />
          <FilaMetrica fondos={fondos} etiqueta="Este año" clave="ytd|rentabilidad" fmt={(v) => pct(v)} />
          <FilaMetrica fondos={fondos} etiqueta="Rentabilidad anual" clave={`${ventana}|rentabilidad`} fmt={(v) => pct(v)} />
          <FilaMetrica fondos={fondos} etiqueta="Volatilidad" clave={`${ventana}|volatilidad`} fmt={(v) => pct(v, 1, false)} menos />
          <FilaMetrica fondos={fondos} etiqueta="Máxima caída" clave={`${ventana}|max_caida`} fmt={(v) => pct(v)} />
          <FilaMetrica fondos={fondos} etiqueta="Sharpe" clave={`${ventana}|sharpe`} fmt={(v) => cifra(v)} />
        </Tabla>
      </Tarjeta>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
        <Tarjeta titulo="Nota" extra={<span className="text-[12px] text-suave">a {plazo}, con los pesos por defecto de su tipo · 100 es lo mejor</span>}>
          <Tabla fondos={fondos} color={color}>
            {filaNota('Nota', notas.map((n) => n?.nota), true)}
            {BLOQUES.filter((k) => notas.some((n) => n?.bloques[k] != null)).map((k) => filaNota(NOMBRE_BLOQUE[k], notas.map((n) => n?.bloques[k])))}
          </Tabla>
          {notas.some((n) => !n) && <p className="mt-2 text-[11px] text-suave">«—»: sin {plazo} de historia o fuera del universo.</p>}
        </Tarjeta>
        <Tarjeta titulo="Rentabilidad y riesgo" extra={<span className="text-[12px] text-suave">a {plazo} · arriba a la izquierda es mejor</span>}>
          {puntos.length ? <Dispersion puntos={puntos} /> : <p className="text-suave">Ningún fondo tiene {plazo} de historia.</p>}
        </Tarjeta>
      </div>
    </>
  )
}

function Evolucion({ fondos, color, lineas }: Props & { lineas: { nombre: string; serie: Punto[]; color: string }[] }) {
  const anos = [...new Set(fondos.flatMap((d) => [...d.metricas.keys()].filter((k) => /^\d{4}\|rentabilidad$/.test(k)).map((k) => k.slice(0, 4))))].sort().slice(-10)
  const columnas = [...anos.map((a) => [a, `${a}|rentabilidad`]), ['Este año', 'ytd|rentabilidad']]
  return (
    <>
      <Tarjeta titulo="Evolución" extra={<span className="text-[12px] text-suave">base 100 · en euros · desde el primer día común</span>}>
        {lineas.length ? <Grafico lineas={lineas} /> : <p className="text-suave">Aún no hay valores descargados.</p>}
      </Tarjeta>
      {lineas.length > 0 && (
        <Tarjeta titulo="Caída desde máximos" extra={<span className="text-[12px] text-suave">en %, en el mismo tramo</span>}>
          <Grafico lineas={lineas.map((l) => ({ ...l, serie: caidas(l.serie) }))} alto="h-48 sm:h-56" />
        </Tarjeta>
      )}
      {anos.length > 0 && (
        <Tarjeta titulo="Por año natural" extra={<span className="text-[12px] text-suave">rentabilidad en % · en acento, el mejor de cada año</span>}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-right tabular text-[13px] [&_tr>*+*]:pl-2">
              <thead><tr className="text-[11px] text-suave"><th className="sticky left-0 bg-panel" />{columnas.map(([a]) => <th key={a} className="pb-1 font-normal">{a}</th>)}</tr></thead>
              <tbody>
                {fondos.map((d, i) => (
                  <tr key={d.fondo.isin} className="border-t border-borde/60">
                    <td className="sticky left-0 max-w-48 truncate bg-panel py-1 pr-2 text-left" title={d.fondo.nombre}>
                      <span style={{ color: `var(--color-${color(d)})` }} aria-hidden="true">● </span>{d.fondo.nombre}
                    </td>
                    {columnas.map(([a, k]) => {
                      const v = d.metricas.get(k)?.valor
                      const m = mejor(fondos.map((x) => x.metricas.get(k)?.valor))
                      return <td key={a} className={m === i ? 'font-semibold text-acento' : v == null ? 'text-suave' : v < 0 ? 'text-baja' : ''}>
                        {v == null ? '—' : pct(v, 1, false).replace(' %', '')}
                      </td>
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Tarjeta>
      )}
    </>
  )
}

function Cifras({ fondos, color, ventana }: Props & { ventana: string }) {
  const f = fondos.map((d) => d.fondo)
  return (
    <>
      <Tarjeta titulo="Datos">
        <Tabla fondos={fondos} color={color}>
          <Fila etiqueta="Gestora" celdas={f.map((x) => x.gestora ?? '—')} />
          <Fila etiqueta="Categoría" celdas={f.map((x) => x.categoria ?? '—')} />
          <Fila etiqueta="Gestión" celdas={f.map((x) => (x.gestion === 'indexada' ? 'Indexada' : x.gestion ? 'Activa' : '—'))} />
          <Fila etiqueta="Patrimonio" celdas={f.map((x) => millones(x.patrimonio_meur))} />
          <Fila etiqueta="Riesgo (SRRI)" celdas={f.map((x) => (x.srri == null ? '—' : `${x.srri} de 7`))} />
          <FilaMetrica fondos={fondos} etiqueta="Gastos (TER)" clave="hoy|ter" fmt={(v) => `${cifra(v)} %`} menos />
          <FilaMetrica fondos={fondos} etiqueta="Este año" clave="ytd|rentabilidad" fmt={(v) => pct(v)} />
        </Tabla>
      </Tarjeta>
      {GRUPOS.map(([grupo, ayuda, filas]) => (
        <Tarjeta key={grupo} titulo={grupo} extra={<span className="text-[12px] text-suave">{ayuda} · a {ventana.toUpperCase()}</span>}>
          <Tabla fondos={fondos} color={color}>
            {filas.map(([n, explica]) => (
              <FilaMetrica key={n} fondos={fondos} etiqueta={<span title={explica}>{ETIQUETA[n]}</span>} clave={`${ventana}|${n}`} fmt={FMT[n]}
                menos={MENOS.has(n)} neutra={SIN_MEJOR.has(n)} />
            ))}
          </Tabla>
        </Tarjeta>
      ))}
      <p className="text-[11px] text-suave">Cada fondo frente a su propia referencia (alfa, beta, captura…). pNN = percentil en su categoría (100 = mejor). Beta y R² no tienen mejor ni peor.</p>
    </>
  )
}

function ComposicionFondos({ fondos, color, corr }: Props & { corr: ReturnType<typeof riesgo> }) {
  const xs = fondos.map((d) => (d.comp ? exposicion([{ peso: 100, nombre: d.fondo.nombre, c: d.comp }]) : null))
  const desglose = (titulo: string, de: (x: NonNullable<(typeof xs)[number]>) => Fila[]) => {
    const vals = xs.map((x) => new Map(x ? de(x) : []))
    const nombres = [...new Set(vals.flatMap((m) => [...m.keys()]))]
      .map((n) => [n, Math.max(...vals.map((m) => m.get(n) ?? 0))] as const).filter(([, v]) => v >= 1).sort((a, b) => b[1] - a[1])
    if (!nombres.length) return null
    return (
      <Tarjeta titulo={titulo}>
        <Tabla fondos={fondos} color={color}>
          {nombres.map(([n]) => (
            <Fila key={n} etiqueta={n} celdas={vals.map((m, k) => {
              const v = m.get(n)
              return xs[k] == null ? <span className="text-suave">—</span> : (
                <span className="inline-flex w-full max-w-36 items-center gap-2">
                  <span className="relative h-1 flex-1 rounded-sm bg-borde/70">
                    <span className="absolute inset-y-0 left-0 rounded-sm" style={{ width: `${Math.min(100, Math.max(0, v ?? 0))}%`, background: `var(--color-${color(fondos[k])})` }} />
                  </span>
                  <span className="w-10">{v == null ? '0' : cifra(v, 1)}</span>
                </span>
              )
            })} />
          ))}
        </Tabla>
      </Tarjeta>
    )
  }
  const conRf = xs.some((x) => x && x.rf >= 5)
  return (
    <>
      {xs.every((x) => !x) && <p className="text-suave">Sin composición todavía: se descarga los domingos.</p>}
      {desglose('Tipo de activo', (x) => x.activos)}
      {desglose('Regiones (de la renta variable)', (x) => x.regiones.flatMap((g) => g.filas))}
      {desglose('Sectores (de la renta variable)', (x) => x.sectores.flatMap((g) => g.filas))}
      {conRf && desglose('Calidad crediticia (de los bonos)', (x) => x.calidad)}
      {xs.some(Boolean) && <p className="text-[11px] text-suave">En % según la última cartera de Morningstar; las filas por debajo del 1 % en todos los fondos no se muestran.</p>}
      {fondos.length > 1 && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
          <Tarjeta titulo="Cómo se mueven juntos">
            {corr ? (
              <>
                <MatrizCorrelacion nombres={fondos.map((d) => d.fondo.nombre)} matriz={corr.matriz} />
                <p className="mt-2 text-[11px] text-suave">Correlación de las rentabilidades semanales de las últimas {corr.semanas} semanas comunes: por encima de {cifra(0.9)} es casi el mismo fondo.</p>
              </>
            ) : <p className="text-suave">Menos de un año de historia común.</p>}
          </Tarjeta>
          <Tarjeta titulo="Posiciones en común"><Solapes titulo={false} fondos={fondos.map((d) => ({ nombre: d.fondo.nombre, c: d.comp }))} /></Tarjeta>
        </div>
      )}
    </>
  )
}
