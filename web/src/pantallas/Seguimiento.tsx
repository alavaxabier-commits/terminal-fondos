import { useEffect, useState } from 'react'
import { cifra, fecha, millones, pct } from '../calculo/formato'
import { cubierta, TIPOS, tipoActivo, type Tipo } from '../calculo/screener'
import { evolucion, type NotaSemanal, type Senal } from '../calculo/senales'
import { variacion } from '../calculo/series'
import DetalleFondo, { type CifraPanel } from '../componentes/DetalleFondo'
import type { Cats } from '../componentes/TarjetaFondo'
import { useTeclasLista } from '../componentes/teclas'
import { alternar } from '../datos/bandeja'
import * as q from '../datos/consultas'
import { serieEur } from '../datos/series'
import { senalesSeguidos } from '../datos/revision'
import Cargando from '../componentes/Cargando'
import Fallo from '../componentes/Fallo'

type Fila = Awaited<ReturnType<typeof q.seguidos>>[number]
type Nota = NonNullable<ReturnType<typeof evolucion>>
const control = 'border border-borde bg-panel px-1 py-1 text-texto outline-none focus:border-acento'
const NOMBRE_TIPO: Record<Tipo, string> = { 'renta variable': 'Renta variable', 'renta fija': 'Renta fija', mixto: 'Mixtos', monetario: 'Monetarios', otros: 'Otros' }
const fechaCorta = (f: string) => new Date(f + 'T12:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
const tono = (v: number | null | undefined) => (v == null ? 'text-suave' : v >= 0 ? 'text-sube' : 'text-baja')
const ter = (v: number) => `${cifra(v)} %`

/** Columnas de cada vista: [clave en `metrica`, título, explicación, formato, con color por signo]. */
type Col = [clave: string, titulo: string, explica: string, formato: (v: number) => string, signo?: true]
const COLUMNAS: Col[] = [
  ['hoy|ter', 'TER', 'Gastos corrientes', ter],
  ['3a|rentabilidad', '3 años', 'Rentabilidad anualizada a 3 años', pct, true],
  ['5a|rentabilidad', '5 años', 'Rentabilidad anualizada a 5 años', pct, true],
  ['3a|volatilidad', 'Volat. 3a', 'Volatilidad a 3 años', (v) => pct(v, 1, false)],
  ['3a|sharpe', 'Sharpe 3a', 'Sharpe a 3 años', (v) => cifra(v)],
]
const COLUMNAS_MONETARIO: Col[] = [
  ['1m|rentabilidad', 'Último mes', 'Lo que ha ganado el último mes, pasado a un año (% anual)', (v) => pct(v, 2, false)],
  ['2m|rentabilidad', '2 meses', 'Lo que ha ganado en los últimos 2 meses, pasado a un año (% anual)', (v) => pct(v, 2, false)],
  ['3m|rentabilidad', '3 meses', 'Lo que ha ganado en los últimos 3 meses, pasado a un año (% anual)', (v) => pct(v, 2, false)],
  ['3m|diferencial_estr', 'vs €STR', '3 meses: puntos que rinde por encima (o por debajo) del €STR medio de esos 3 meses', (v) => pct(v, 2), true],
  ['1a|rentabilidad', '12 meses', 'Lo que ha ganado de verdad en los últimos 12 meses', (v) => pct(v, 2, false)],
  ['hoy|ter', 'TER', 'Gastos corrientes', ter],
]
/** Lo que enseña el panel frente a su categoría. */
const PANEL: [string, string, (v: number) => string, true?][] = [
  ['Rentabilidad 1 año', '1a|rentabilidad', pct, true], ['Rentabilidad 3 años', '3a|rentabilidad', pct, true],
  ['Volatilidad 3 años', '3a|volatilidad', (v) => pct(v, 1, false)], ['Caída máxima 3 años', '3a|max_caida', pct],
  ['Sharpe 3 años', '3a|sharpe', (v) => cifra(v)], ['Gastos (TER)', 'hoy|ter', ter],
]
const PANEL_MONETARIO: typeof PANEL = [
  ['3 meses vs €STR', '3m|diferencial_estr', (v) => pct(v, 2), true], ['Rentabilidad 12 meses', '1a|rentabilidad', (v) => pct(v, 2, false)],
  ['Meses en pérdidas (12)', '12m|meses_negativos', (v) => cifra(v, 0)], ['Gastos (TER)', 'hoy|ter', ter],
]

/** Seguimiento: los fondos que vigilas, por tipo de activo, con su nota y percentil en su categoría y las cifras que más
 *  dicen (las de la clasificación del Screener). Sin carteras ni alarmas: las señales de Revisión, como una marca más. */
export default function Seguimiento() {
  const [filas, setFilas] = useState<Fila[] | null>(null)
  const [notas, setNotas] = useState<Map<string, Nota>>(new Map())
  const [ultimoLunes, setUltimoLunes] = useState('')
  const [senales, setSenales] = useState<Map<string, Senal[]>>(new Map())
  const [met, setMet] = useState<Map<string, q.Metrica>>(new Map())
  const [desdeAlta, setDesdeAlta] = useState<Map<string, number | null>>(new Map())
  const [cats, setCats] = useState<Cats | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [quitando, setQuitando] = useState<string | null>(null)
  const [error, setError] = useState('')
  const falla = (e: Error) => setError(e.message)

  useEffect(() => {
    q.categoriasReferencia().then(setCats).catch(falla)
    q.seguidos().then(async (f) => {
      setFilas(f)
      const isins = f.map((x) => x.isin)
      q.metricasDe(isins).then((ms) => setMet(new Map(ms.map((x) => [`${x.isin}|${x.ventana}|${x.nombre}`, x])))).catch(falla)
      // La rentabilidad desde el alta es accesoria: si una serie falla, ese fondo va sin ella.
      for (const x of f) serieEur(x.isin, x.fondo.divisa).then((s) => setDesdeAlta((d) => new Map(d).set(x.isin, variacion(s, x.alta.slice(0, 10))))).catch(() => {})
      const todas = await q.notasDe(isins)
      const por = new Map<string, NotaSemanal[]>()
      for (const n of todas) por.set(n.isin, [...(por.get(n.isin) ?? []), n])
      setNotas(new Map([...por].map(([i, ns]) => [i, evolucion(ns)!])))
      setUltimoLunes(todas.reduce((m, n) => (n.fecha > m ? n.fecha : m), ''))
      senalesSeguidos(f.map((x) => ({ isin: x.isin, ...x.fondo, fund_id: x.fondo.fund_id ?? null })), todas).then(setSenales).catch(falla)
    }).catch(falla)
  }, [])

  const cambiarNota = (isin: string, nota: string | null) => {
    setFilas((fs) => fs!.map((f) => (f.isin === isin ? { ...f, nota } : f)))
    q.cambiarNotaSeguimiento(isin, nota).catch(falla)
  }
  const quitar = (isin: string) => {
    setFilas((fs) => fs!.filter((f) => f.isin !== isin))
    setQuitando(null)
    q.dejarDeSeguir(isin).catch(falla)
  }

  const categoria = (f: Fila) => f.fondo.categoria ?? 'Sin categoría'
  const grupos = TIPOS.map((t) => [t, (filas ?? []).filter((f) => tipoActivo(f.fondo.categoria) === t)
    .sort((a, b) => categoria(a).localeCompare(categoria(b), 'es') || a.fondo.nombre.localeCompare(b.fondo.nombre, 'es'))] as const)
    .filter(([, fs]) => fs.length)
  const visibles = grupos.flatMap(([, fs]) => fs)
  // sin selección (o si deja de verse), la primera fila
  const primera = visibles[0]?.isin
  const sigue = visibles.some((f) => f.isin === sel)
  useEffect(() => { if (primera && !sigue) setSel(primera) }, [primera, sigue])
  useTeclasLista(visibles.map((f) => f.isin), sel, setSel, {
    Enter: (i) => { location.hash = `#/fondo/${i}` },
    b: (i) => { const f = visibles.find((x) => x.isin === i); if (f) alternar({ isin: i, nombre: f.fondo.nombre }) },
    x: setQuitando,
  })

  if (!filas) return error ? <Fallo>No se ha podido leer: {error}</Fallo> : <Cargando pagina />
  const m = (isin: string, clave: string) => met.get(`${isin}|${clave}`)
  const elegido = visibles.find((f) => f.isin === sel)
  const monetarioElegido = elegido && tipoActivo(elegido.fondo.categoria) === 'monetario'

  const tabla = (fs: readonly Fila[], monetario: boolean) => {
    const cols = monetario ? COLUMNAS_MONETARIO : COLUMNAS
    return (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[52rem] table-fixed text-right text-[13px] tabular">
          <colgroup><col />{!monetario && <col className="w-[5.5rem]" />}{cols.map(([k]) => <col key={k} className="w-[4.75rem]" />)}<col className="w-[5.25rem]" /></colgroup>
          <thead className="rotulo">
            <tr>
              <th className="pb-1.5 pl-2 text-left font-normal">Fondo</th>
              {!monetario && <th className="pb-1.5 pl-3 text-left font-normal" title="Nota del lunes y, en pequeño, su percentil en su categoría (100 = mejor)">Nota</th>}
              {cols.map(([k, t, explica]) => <th key={k} className="pb-1.5 pl-3 font-normal" title={explica}>{t}</th>)}
              <th className="pb-1.5 pr-2 pl-3 font-normal" title="Rentabilidad desde el día que empezaste a seguirlo">Desde alta</th>
            </tr>
          </thead>
          <tbody>
            {fs.map((f, k) => {
              const elegida = sel === f.isin
              const alta = desdeAlta.get(f.isin)
              return (
                <tr key={f.isin} data-isin={f.isin} aria-selected={elegida} onClick={() => setSel(f.isin)}
                  className={`cursor-pointer border-t ${k > 0 && k % 5 === 0 ? 'border-texto/60' : 'border-borde/70'} ${elegida ? 'bg-acento/15 outline-2 -outline-offset-2 outline-acento' : 'hover:bg-borde/30'}`}>
                  <td className="py-2 pr-2 pl-2 text-left">
                    <a href={`#/fondo/${f.isin}`} onClick={(e) => e.stopPropagation()} className="hover:text-acento">{f.fondo.nombre}</a>
                    {f.myinvestor && <span className="ml-1.5 rounded-sm bg-acento/15 px-1.5 align-[1px] text-[10px] text-acento" title="Se puede comprar en MyInvestor">MI</span>}
                    {(f.fondo.divisa !== 'EUR' || cubierta(f.fondo.nombre)) && <span className="ml-1.5 rounded-sm bg-borde/60 px-1.5 align-[1px] text-[10px] text-suave">{f.fondo.divisa}{cubierta(f.fondo.nombre) && ' cubierta'}</span>}
                    {senales.get(f.isin)?.map((s) => <span key={s.tipo} title={s.motivo} className="ml-1.5 rounded-sm bg-aviso/15 px-1.5 align-[1px] text-[10px] text-aviso">{s.tipo}</span>)}
                    <span className="block text-[12px] text-suave">{categoria(f)}</span>
                  </td>
                  {!monetario && <CeldaNota n={notas.get(f.isin)} ultimo={ultimoLunes} />}
                  {cols.map(([c, , , formato, signo]) => {
                    const x = m(f.isin, c)
                    return <td key={c} className={`pl-3 ${x == null ? 'text-suave' : signo ? tono(x.valor) : ''}`}
                      title={x?.percentil == null ? undefined : `Percentil ${Math.round(x.percentil)} en su categoría (100 = mejor)`}>{x == null ? '—' : formato(x.valor)}</td>
                  })}
                  <td className={`pr-2 pl-3 ${tono(alta)}`}>{alta == null ? '—' : pct(alta)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <h1 className="text-3xl! sm:text-4xl!">Seguimiento <span className="text-suave">· {filas.length} {filas.length === 1 ? 'fondo' : 'fondos'}</span></h1>
      {error && <Fallo>No se ha podido leer o guardar: {error}</Fallo>}
      {visibles.length === 0 ? (
        <p className="text-suave">No sigues ningún fondo. Se añaden desde el screener o desde una ficha («s»).</p>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_23rem]">
          <div className="space-y-7">
            {grupos.map(([t, fs]) => (
              <section key={t} aria-label={NOMBRE_TIPO[t]}>
                <div className="mb-1 flex items-baseline justify-between gap-3 border-b-2 border-texto pb-1">
                  <h2 className="estrecha text-[22px] font-extrabold uppercase leading-tight">{NOMBRE_TIPO[t]}</h2>
                  <span className="text-suave">{fs.length} {fs.length === 1 ? 'fondo' : 'fondos'}</span>
                </div>
                {tabla(fs, t === 'monetario')}
              </section>
            ))}
          </div>
          {elegido && (
            <aside className="lg:sticky lg:top-16 lg:max-h-[calc(100dvh-6.5rem)] lg:overflow-y-auto lg:overscroll-contain">
              <DetalleFondo isin={elegido.isin} nombre={elegido.fondo.nombre} divisa={elegido.fondo.divisa} cats={cats}
                datos={[categoria(elegido), elegido.isin, elegido.fondo.gestion === 'indexada' ? 'Indexado' : elegido.fondo.gestion === 'activa' ? 'Gestión activa' : 'Gestión sin dato',
                  `SRRI ${elegido.fondo.srri ?? '—'}`, millones(elegido.fondo.patrimonio_meur), ...(elegido.myinvestor ? ['En MyInvestor'] : [])]}
                nota={<NotaPanel n={notas.get(elegido.isin)} monetario={!!monetarioElegido} />}
                cifras={(monetarioElegido ? PANEL_MONETARIO : PANEL).map(([et, k, fmt, signo]): CifraPanel => [et, m(elegido.isin, k)?.valor ?? null, m(elegido.isin, k)?.percentil ?? null, fmt, signo])}>
                {senales.get(elegido.isin)?.map((s) => <p key={s.tipo}><span className="text-aviso">{s.tipo}:</span> <span className="text-suave">{s.motivo}</span></p>)}
                <p className="text-[12px] text-suave">En seguimiento desde el {fecha(elegido.alta)}</p>
                <textarea key={elegido.isin + (elegido.nota ?? '')} defaultValue={elegido.nota ?? ''} rows={2} placeholder="Por qué lo sigo" aria-label="Por qué lo sigo"
                  onBlur={(x) => x.target.value !== (elegido.nota ?? '') && cambiarNota(elegido.isin, x.target.value || null)} className={`${control} w-full`} />
                {quitando === elegido.isin
                  ? <p>¿Dejar de seguirlo? Se borra también tu nota. <button onClick={() => quitar(elegido.isin)} className="text-baja hover:underline">Sí, dejar de seguir</button> <button onClick={() => setQuitando(null)} className="text-suave hover:text-texto">Cancelar</button></p>
                  : <button onClick={() => setQuitando(elegido.isin)} className="w-fit text-suave hover:text-baja">Dejar de seguir</button>}
              </DetalleFondo>
            </aside>
          )}
        </div>
      )}
      <p className="max-w-[75ch] text-[12px] text-suave">Nota y percentil del último lunes, con los pesos por defecto de cada tipo de activo: no cambian con los pesos del Screener. Cifras en euros, de las métricas del fondo; rentabilidades a 3 y 5 años, anualizadas. Al pasar el ratón por una cifra, su percentil en la categoría (100 = mejor). Tu nota se guarda al salir del campo.</p>
    </div>
  )
}

/** Nota grande y percentil pequeño; tachada con su fecha si no es del último lunes. */
function CeldaNota({ n, ultimo }: { n: Nota | undefined; ultimo: string }) {
  if (!n) return <td className="pl-3 text-left text-[12px] text-suave">sin historial</td>
  if (n.fecha < ultimo) return <td className="pl-3 text-left text-suave" title={`Sin nota esta semana: la última es del ${fechaCorta(n.fecha)}`}><s>{Math.round(n.nota)}</s> <span className="text-[11px] text-baja">{fechaCorta(n.fecha)}</span></td>
  return (
    <td className="pl-3 text-left" title={n.percentil == null ? undefined : `Percentil ${Math.round(n.percentil)} en su categoría (100 = mejor)`}>
      <span className="cifra text-[21px] font-extrabold leading-none">{Math.round(n.nota)}</span>
      {n.percentil != null && <span className="ml-1.5 text-[11px] text-suave">p{Math.round(n.percentil)}</span>}
    </td>
  )
}

/** La nota en el panel: cifra, percentil y cómo se ha movido. */
function NotaPanel({ n, monetario }: { n: Nota | undefined; monetario: boolean }) {
  if (monetario) return null
  if (!n) return <p className="text-suave">Sin nota: fuera del universo o menos de 3 años de historia.</p>
  const mov = (v: number | null, et: string) => v == null ? null : <span>{et} <span className={Math.round(v) > 0 ? 'text-sube' : Math.round(v) < 0 ? 'text-baja' : ''}>{v > 0 ? '+' : ''}{Math.round(v)}</span></span>
  return (
    <div className="flex items-baseline gap-3">
      <span className="cifra text-[34px] font-extrabold leading-none">{Math.round(n.nota)}</span>
      <p className="text-[12px] text-suave tabular">
        {n.percentil != null && <>mejor que el {Math.round(n.percentil)} % de su categoría<br /></>}
        {mov(n.semana, 'semana')}{n.semana != null && n.periodo != null && ' · '}{mov(n.periodo, '12 meses')}
      </p>
    </div>
  )
}
