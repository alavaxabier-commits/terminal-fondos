import { useEffect, useMemo, useState } from 'react'
import { cifra, colorPercentil, pct } from '../calculo/formato'
import { BLOQUES, NOMBRE_BLOQUE, type Bloque, type Plazo } from '../calculo/nota'
import { alternativas, cifraDe, cubierta, percentilDe, plazoDe, type Puntuado } from '../calculo/screener'
import type { Senal } from '../calculo/senales'
import { base100, haceAnos, type Punto } from '../calculo/series'
import { alternar, MAX_BANDEJA, useBandeja } from '../datos/bandeja'
import * as q from '../datos/consultas'
import { serieEur } from '../datos/series'
import Grafico from './Grafico'
import Cargando from './Cargando'

type Cats = Awaited<ReturnType<typeof q.categoriasReferencia>>
const RANGOS = [1, 3, 5] as const
const anos = (p: Plazo) => (p === '1a' ? '1 año' : `${parseInt(p)} años`)
const tono = (v: number | null | undefined) => (v == null ? '' : v >= 0 ? 'text-sube' : 'text-baja')

/** Lo que se carga al elegir un fondo: su serie, la de su referencia (la semanal que guarda `metricas`) y sus carteras. */
type Extra = { serie: Punto[]; ref: Punto[]; nombreRef: string; carteras: { id: number; nombre: string; peso: number }[] }

async function cargar(f: Puntuado, cats: Cats | null): Promise<Extra> {
  const [serie, fondo, carteras] = await Promise.all([serieEur(f.isin, f.divisa), q.fondo(f.isin), q.carterasDe(f.isin)])
  let ref: Punto[] = [], nombreRef = ''
  if (fondo && cats) {
    const clave = q.claveReferencia(fondo, cats)
    const [refs, r] = await Promise.all([q.referenciaSeries(clave ? [clave] : []), q.referencia(fondo)])
    const s = clave ? refs.get(clave)?.semanal : undefined
    // la serie semanal va fechada por lunes: se pasa al viernes, como en las carteras
    if (s) ref = [...s].map(([k, v]) => ({ fecha: new Date(Date.parse(k) + 4 * 864e5).toISOString().slice(0, 10), valor: v }))
    nombreRef = r.metodo === 'indice' ? r.indice?.nombre ?? 'Índice' : r.metodo === 'media_categoria' ? 'Media de su categoría' : ''
  }
  return { serie, ref, nombreRef, carteras }
}

/** Barra fina de percentil (100 = mejor) con su cifra. */
const Pct = ({ p }: { p: number | null }) => p == null ? <><span /><span /></> : (
  <>
    <span className="relative h-1 rounded-sm bg-borde/70"><span className="absolute inset-y-0 left-0 rounded-sm bg-acento" style={{ width: `${p}%` }} /></span>
    <span className={`text-right text-[11px] tabular ${colorPercentil(p)}`}>p{Math.round(p)}</span>
  </>
)

/** Tarjeta del fondo elegido en el screener: lo que la fila no dice. Evolución frente a su referencia, por qué la nota,
 * cifras frente a su categoría al plazo de la nota, alternativas de su categoría y su contexto (carteras, seguimiento,
 * señales). En los monetarios, lo que rinde ahora frente al €STR en lugar de la nota. */
export default function TarjetaFondo({ f, todos, plazo, colores, monetario, cats, seguido, seguir, senales, elegir, pocos }: {
  f: Puntuado; todos: Puntuado[]; plazo: Plazo | ''; colores: Record<Bloque, string>; monetario: boolean; cats: Cats | null
  seguido: boolean; seguir: () => void; senales: Senal[]; elegir: (isin: string) => void; pocos: number
}) {
  const [extra, setExtra] = useState<Extra | null>(null)
  const [rango, setRango] = useState<number>(3)
  const bandeja = useBandeja()
  const enBandeja = bandeja.some((x) => x.isin === f.isin)

  useEffect(() => {
    let vigente = true // al moverse deprisa por la lista, la respuesta de un fondo anterior no pisa la del actual
    setExtra(null)
    cargar(f, cats).then((x) => vigente && setExtra(x)).catch(() => vigente && setExtra({ serie: [], ref: [], nombreRef: '', carteras: [] }))
    return () => { vigente = false }
  }, [f.isin, cats]) // eslint-disable-line react-hooks/exhaustive-deps

  const grafica = useMemo(() => {
    if (!extra?.serie.length) return null
    const ultima = extra.serie.at(-1)!.fecha
    const desde = [haceAnos(ultima, rango), extra.serie[0].fecha, extra.ref[0]?.fecha ?? ''].sort().at(-1)!
    const fondo = base100(extra.serie, desde)
    const ref = extra.ref.length ? base100(extra.ref, desde) : []
    const lineas = [{ nombre: 'Fondo', serie: fondo, color: 'acento' }]
    if (ref.length) lineas.push({ nombre: extra.nombreRef || 'Referencia', serie: ref, color: 'suave' })
    return { lineas, fin: fondo.at(-1)?.valor ?? null, finRef: ref.at(-1)?.valor ?? null }
  }, [extra, rango])

  const v = plazoDe(f, plazo || undefined)
  const filas: [string, string, (x: number) => string][] = monetario
    ? [['3 meses vs €STR', '3m|diferencial_estr', (x) => pct(x, 2)], ['Rentabilidad 3 años', '3a|rentabilidad', (x) => pct(x)],
       ['Volatilidad 3 años', '3a|volatilidad', (x) => pct(x, 1, false)]]
    : [...(v === '1a' ? [] : [['Rentabilidad 1 año', '1a|rentabilidad', (x: number) => pct(x)]] as [string, string, (x: number) => string][]),
       [`Rentabilidad ${anos(v)}`, `${v}|rentabilidad`, (x) => pct(x)], [`Volatilidad ${anos(v)}`, `${v}|volatilidad`, (x) => pct(x, 1, false)],
       [`Caída máxima ${anos(v)}`, `${v}|max_caida`, (x) => pct(x)], [`Sharpe ${anos(v)}`, `${v}|sharpe`, (x) => cifra(x)]]
  const alts = alternativas(f, todos, monetario)
  const tam = 'min-h-8 px-2.5 text-[12.5px]'
  const seccion = 'flex flex-col gap-2 border-t border-borde pt-3'
  const titulo = 'text-[12px] font-medium text-suave'

  // monetarios: lo que rinde ahora y el €STR de cada periodo (rentabilidad − diferencial), en la misma escala
  const rinde = (['1m', '2m', '3m'] as const).map((k) => {
    const r = cifraDe(f, `${k}|rentabilidad`), d = cifraDe(f, `${k}|diferencial_estr`)
    return { k, r, estr: r != null && d != null ? r - d : null }
  })
  const r12 = cifraDe(f, '1a|rentabilidad')
  const maxR = Math.max(...rinde.flatMap((x) => [x.r ?? 0, x.estr ?? 0]), r12 ?? 0) * 1.08 || 1

  return (
    <section aria-label="Detalle del fondo" className="flex flex-col gap-3 rounded-lg border border-borde bg-panel p-4 text-[13px]">
      <div className="space-y-1.5">
        <p className="rotulo text-acento!">{f.categoria}</p>
        <a href={`#/fondo/${f.isin}`} className="block text-xl font-semibold leading-tight tracking-tight hover:text-acento">{f.nombre}</a>
        <div className="flex flex-wrap gap-1 text-[11px] text-suave">
          <span className="rounded-sm bg-borde/50 px-2 font-mono">{f.isin}</span>
          <span className="rounded-sm bg-borde/50 px-2">{f.gestion === 'indexada' ? 'Indexado' : f.gestion === 'activa' ? 'Gestión activa' : 'Gestión sin dato'}</span>
          <span className="rounded-sm bg-borde/50 px-2">{f.divisa}{cubierta(f.nombre) && ' cubierta'}</span>
          {f.myinvestor && <span className="rounded-sm bg-acento/15 px-2 text-acento">En MyInvestor</span>}
        </div>
      </div>

      <div className={seccion}>
        <div className="flex items-center justify-between gap-2">
          <h3 className={titulo}>Evolución · base 100</h3>
          <div role="group" aria-label="Periodo de la gráfica" className="flex gap-0.5 rounded-sm bg-borde/50 p-0.5 text-[11px]">
            {RANGOS.map((n) => (
              <button key={n} onClick={() => setRango(n)} aria-pressed={rango === n}
                className={`rounded-sm px-2.5 ${rango === n ? 'bg-panel text-texto ring-1 ring-borde' : 'text-suave hover:text-texto'}`}>{n}A</button>
            ))}
          </div>
        </div>
        {extra == null ? <Cargando /> : grafica ? (
          <>
            <Grafico lineas={grafica.lineas} alto="h-40" />
            {grafica.fin != null && grafica.finRef != null && (
              <p className="text-right text-[12px] tabular">
                <span className="text-suave">frente a {extra.nombreRef || 'su referencia'}: </span>
                <span className={tono(grafica.fin - grafica.finRef)}>{grafica.fin - grafica.finRef >= 0 ? '+' : ''}{cifra(grafica.fin - grafica.finRef, 1)} puntos</span>
              </p>
            )}
          </>
        ) : <p className="text-suave">Sin valores descargados.</p>}
      </div>

      {monetario ? (
        <div className={seccion}>
          <div className="flex items-baseline justify-between gap-2"><h3 className={titulo}>Lo que rinde ahora, en % anual</h3><span className="text-[11px] text-suave">┆ €STR del periodo</span></div>
          {[...rinde.map(({ k, r, estr }) => [k === '1m' ? 'Último mes' : k === '2m' ? '2 meses' : '3 meses', r, estr] as const), ['12 meses', r12, null] as const].map(([et, r, estr]) => (
            <div key={et} className="grid grid-cols-[4.5rem_1fr_3.5rem] items-center gap-2">
              <span className="text-suave">{et}</span>
              <span className="relative h-3.5">
                {r != null && <span className={`absolute inset-y-[3px] left-0 rounded-sm ${et === '12 meses' ? 'bg-suave/60' : 'bg-acento'}`} style={{ width: `${Math.max(0, r / maxR) * 100}%` }} />}
                {estr != null && <span className="absolute -inset-y-0.5 border-l-[1.5px] border-dashed border-aviso" style={{ left: `${(estr / maxR) * 100}%` }} />}
              </span>
              <span className="text-right tabular">{r == null ? '—' : pct(r, 2, false)}</span>
            </div>
          ))}
          <p className="text-[11px] text-suave">
            {cifraDe(f, '3m|diferencial_estr') != null && <>A 3 meses rinde {pct(cifraDe(f, '3m|diferencial_estr'), 2)} frente al €STR. </>}
            {cifraDe(f, '12m|meses_negativos') != null && <>{cifra(cifraDe(f, '12m|meses_negativos'), 0)} meses en pérdidas en el último año.</>}
          </p>
        </div>
      ) : (
        <div className={seccion}>
          <div className="flex items-baseline justify-between gap-2">
            <h3 className={titulo}>Por qué la nota{plazo ? ` · a ${anos(plazo)}` : ''}</h3>
            {f.nota != null && <span className="cifra text-2xl leading-none tabular">{Math.round(f.nota)}</span>}
          </div>
          {f.nota == null ? <p className="text-suave">{plazo ? `Menos de ${anos(plazo)} de historial: no tiene nota a ese plazo.` : 'Menos de 3 años de historial: no tiene nota.'}</p> : (
            <>
              {BLOQUES.filter((k) => f.bloques[k] != null).map((k) => (
                <div key={k} className={`grid grid-cols-[minmax(0,1fr)_7rem_1.75rem] items-center gap-2 ${f.bloques[k]! < 40 ? 'text-aviso' : ''}`}>
                  <span className="truncate">{NOMBRE_BLOQUE[k]}</span>
                  <span className="relative h-1.5 overflow-hidden rounded-sm bg-borde/60"><span className="absolute inset-y-0 left-0 rounded-sm" style={{ width: `${f.bloques[k]}%`, background: colores[k] }} /></span>
                  <span className="text-right tabular">{Math.round(f.bloques[k]!)}</span>
                </div>
              ))}
              <p className="text-[11px] text-suave">Percentil de cada bloque en su categoría; en ámbar, los flojos (menos de 40).{f.solo3a && ' Menos de 5 años: métricas a 3.'}</p>
            </>
          )}
          {pocos > 0 && <p className="text-[12px] text-aviso">Su categoría solo tiene {pocos} fondos en el universo: la nota dice poco.</p>}
        </div>
      )}

      <div className={seccion}>
        <div className="flex items-baseline justify-between gap-2"><h3 className={titulo}>Frente a su categoría</h3><span className="text-[11px] text-suave">percentil · 100 = mejor</span></div>
        {[...filas.map(([et, k, fmt]) => [et, cifraDe(f, k), percentilDe(f, k), fmt] as const),
          ['Gastos (TER)', f.ter, f.pct?.['hoy|ter'] ?? null, (x: number) => `${cifra(x)} %`] as const].map(([et, x, p, fmt]) => (
          <div key={et} className="grid grid-cols-[minmax(0,1fr)_4rem_4.5rem_1.75rem] items-center gap-2">
            <span className="truncate text-suave">{et}</span>
            <span className={`text-right tabular ${et.startsWith('Rentabilidad') || et.includes('€STR') ? tono(x) : ''}`}>{x == null ? '—' : fmt(x)}</span>
            <Pct p={x == null ? null : p} />
          </div>
        ))}
      </div>

      {alts.length > 0 && (
        <div className={seccion}>
          <div className="flex items-baseline justify-between gap-2"><h3 className={titulo}>Alternativas en su categoría</h3><span className="text-[11px] text-suave">{monetario ? '3 meses' : 'nota'} · TER</span></div>
          <ul className="divide-y divide-borde/60">
            {alts.map(({ f: a, motivo }) => (
              <li key={a.isin} className="py-1.5">
                <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-2">
                  <button onClick={() => elegir(a.isin)} className="truncate text-left hover:text-acento">{a.nombre}</button>
                  <span className="min-w-14 text-right tabular">{monetario ? pct(cifraDe(a, '3m|rentabilidad'), 2, false) : <span className="cifra text-lg leading-none">{Math.round(a.nota!)}</span>}</span>
                  <span className="text-right tabular text-suave">{a.ter == null ? '—' : `${cifra(a.ter)} %`}</span>
                </div>
                <p className="text-[11px] text-suave">{motivo}{a.myinvestor ? ' · en MyInvestor' : ''}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={`${seccion} text-[12.5px]`}>
        <p>
          {extra == null ? <span className="text-suave">…</span> : extra.carteras.length
            ? <>En {extra.carteras.map((c, i) => <span key={c.id}>{i > 0 && ', '}<a href={`#/cartera/${c.id}`} className="hover:text-acento">{c.nombre}</a> ({cifra(c.peso, 0)} %)</span>)}</>
            : <span className="text-suave">No está en ninguna cartera</span>}
          <span className="text-suave"> · </span>{seguido ? <span className="text-aviso">★ en seguimiento</span> : <span className="text-suave">no lo sigues</span>}
        </p>
        {senales.map((s) => <p key={s.tipo} className="text-aviso">▲ {s.tipo}: {s.motivo}</p>)}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button onClick={seguir} disabled={seguido} className={`boton-pri ${tam}`}>{seguido ? '★ Siguiendo' : '★ Seguir'}</button>
        <button onClick={() => alternar({ isin: f.isin, nombre: f.nombre })} disabled={!enBandeja && bandeja.length >= MAX_BANDEJA} aria-pressed={enBandeja}
          title={!enBandeja && bandeja.length >= MAX_BANDEJA ? `Como mucho ${MAX_BANDEJA} fondos en el comparador` : undefined}
          className={`boton ${tam} ${enBandeja ? 'text-acento' : 'text-texto'}`}>{enBandeja ? '− Comparar' : '+ Comparar'}</button>
        <a href={`#/fondo/${f.isin}`} className={`boton ${tam}`}>Ficha</a>
      </div>
      <p className="text-[11px] text-suave">j/k mover · Intro ficha{seguido ? '' : ' · s seguir'} · b comparar</p>
    </section>
  )
}
