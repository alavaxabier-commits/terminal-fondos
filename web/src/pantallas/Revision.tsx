import { useEffect, useState } from 'react'
import { cifra, colorPercentil, fecha } from '../calculo/formato'
import { tintas } from '../calculo/jornada'
import { COMPARABLES, type Senal } from '../calculo/senales'
import * as q from '../datos/consultas'
import { revisar, type FondoRevisado, type Revision as Datos } from '../datos/revision'
import Fallo from '../componentes/Fallo'

const REGLA: Record<string, string> = {
  nota_baja_percentil: 'Nota baja: percentil de su nota en la categoría por debajo de',
  empeora_puntos: 'Empeora: puntos de nota perdidos',
  empeora_meses: 'Empeora: en estos meses',
  mejor_puntos: 'Hay algo claramente mejor: puntos más de nota, con TER igual o menor',
  caro_puntos_ter: 'Caro: puntos de TER sobre la mediana de su categoría',
  redundante_correlacion: 'Redundante: correlación con otro fondo de la misma cartera desde',
  solo_myinvestor: 'Alternativas y «algo claramente mejor» solo entre fondos de MyInvestor',
  misma_divisa: 'Alternativas y «algo claramente mejor» solo entre fondos de la misma divisa',
}
const SI_NO = ['solo_myinvestor', 'misma_divisa']

type EnCartera = { cartera: q.Cartera; peso: number }
/** Un fondo una sola vez, con las carteras en que está; sus señales juntas (las de cada cartera, sin repetir). */
type Fondo = Omit<FondoRevisado, 'peso'> & { en: EnCartera[]; nuevas: Senal['tipo'][]; resueltas: Senal['tipo'][] }

function porFondo(d: Datos): Fondo[] {
  const m = new Map<string, Fondo>()
  for (const { cartera, fondos } of d.carteras) for (const f of fondos) {
    const x = m.get(f.fondo.isin) ?? { ...f, senales: [], en: [], nuevas: [], resueltas: [] }
    x.en.push({ cartera, peso: f.peso })
    // «Redundante» depende de la cartera: si el fondo está en varias, se dice en cuál
    const propias = f.senales.map((s) => (s.tipo === 'Redundante' ? { ...s, motivo: `${cartera.nombre}: ${s.motivo}` } : s))
    for (const s of propias) if (!x.senales.some((t) => t.tipo === s.tipo && t.motivo === s.motivo)) x.senales.push(s)
    m.set(f.fondo.isin, x)
  }
  for (const x of m.values()) {
    if (x.en.length === 1) x.senales = x.senales.map((s) => ({ ...s, motivo: s.motivo.replace(`${x.en[0].cartera.nombre}: `, '') }))
    const tipos = new Set(x.senales.map((s) => s.tipo))
    x.nuevas = [...tipos].filter((t) => COMPARABLES.includes(t) && !x.antes.includes(t))
    x.resueltas = x.antes.filter((t) => !tipos.has(t))
  }
  const peso = (x: Fondo) => x.en.reduce((s, e) => s + e.peso, 0)
  return [...m.values()].sort((a, b) => b.nuevas.length - a.nuevas.length || b.senales.length - a.senales.length || peso(b) - peso(a))
}

/** Revisión semanal: los fondos de mis carteras con alguna señal (los nuevos primero), por qué y sus mejores alternativas. */
export default function Revision() {
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  useEffect(() => { revisar().then(setDatos).catch((e: Error) => setError(e.message)) }, [version])

  if (!datos) return error ? <Fallo>No se ha podido hacer la revisión: {error}</Fallo>
    : <p className="text-suave">Revisando las carteras (señales, correlaciones y alternativas)…</p>
  const fondos = porFondo(datos)
  const marcados = fondos.filter((f) => f.senales.length)
  const sinSenal = fondos.filter((f) => !f.senales.length).sort((a, b) => b.resueltas.length - a.resueltas.length)
  const nuevas = marcados.reduce((s, f) => s + f.nuevas.length, 0)
  const resueltos = sinSenal.filter((f) => f.resueltas.length).length
  const semana = fondos.map((f) => f.nota?.fecha).filter(Boolean).sort().at(-1)
  const tinta = tintas(datos.carteras.map((c) => c.cartera.id))
  const valor = (clave: string) => datos.umbrales.find((u) => u.clave === clave)?.valor
  const guardar = (clave: string, texto: string) => {
    const v = Number(texto.replace(',', '.'))
    if (!isFinite(v)) return
    q.guardarUmbral(clave, v).then(() => setVersion((n) => n + 1)).catch((e: Error) => setError(e.message))
  }
  const seguir = (isin: string) => q.seguir(isin).catch((e: Error) => setError(e.message))

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-3xl! sm:text-4xl!">Revisión</h1>
        <p className="text-[15px]">
          {semana ? <>Semana del {fecha(semana)}: </> : null}
          {marcados.length
            ? <><Num>{marcados.length}</Num> {marcados.length === 1 ? 'fondo' : 'fondos'} con señal
              {nuevas > 0 && <>, <Num className="text-aviso">{nuevas}</Num> {nuevas === 1 ? 'señal nueva' : 'señales nuevas'}</>}</>
            : 'nada que revisar'}
          {resueltos > 0 && <> · <Num className="text-sube">{resueltos}</Num> ya sin señal</>}
          <span className="text-suave"> · {fondos.length} fondos en {datos.carteras.length} {datos.carteras.length === 1 ? 'cartera' : 'carteras'}</span>
        </p>
        <p className="max-w-[75ch] text-[13px] text-suave">
          Nota de la semana con los pesos por defecto, sin Diversificación; el percentil, en su categoría (azul el mejor cuarto, rojo el peor) y la flecha, lo que ha cambiado desde la semana anterior.
          {' '}<Marca>Nueva</Marca> es una señal que la semana anterior no tenía; solo se comparan Nota baja y Empeora, porque el TER y las correlaciones no se guardan por semana.
          {' '}Alternativas de su categoría{valor('solo_myinvestor') ? ', solo de MyInvestor' : ''}{(valor('misma_divisa') ?? 1) ? ', en la misma divisa' : ''}.
        </p>
      </div>
      {error && <Fallo>No se ha podido leer o guardar: {error}</Fallo>}

      {datos.carteras.length === 0 && <p className="text-suave">No hay carteras que revisar. <a href="#/" className="text-acento hover:underline">Crea una en Inicio</a>.</p>}

      {marcados.length > 0 && (
        <ol className="border-b border-borde">
          {marcados.map((f) => <Marcado key={f.fondo.isin} f={f} tinta={tinta} seguir={seguir} />)}
        </ol>
      )}

      {sinSenal.length > 0 && (
        <section className="space-y-2">
          <h2 className="rotulo">Sin señal</h2>
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[36rem] tabular [&_tr>*+*]:pl-4">
              <thead className="rotulo">
                <tr className="border-b border-borde text-left">
                  <th className="py-1 font-normal">Fondo</th><th className="font-normal">Carteras</th>
                  <th className="text-right font-normal">Nota</th><th className="font-normal"><span className="sr-only">Cambio</span></th>
                </tr>
              </thead>
              <tbody>
                {sinSenal.map((f) => (
                  <tr key={f.fondo.isin} className="border-b border-borde/50">
                    <td className="py-1.5"><a href={`#/fondo/${f.fondo.isin}`} className="hover:text-acento">{f.fondo.nombre}</a></td>
                    <td><Carteras en={f.en} tinta={tinta} /></td>
                    <td className="text-right"><Nota f={f} pequena /></td>
                    <td className="text-[13px] text-sube">{f.resueltas.length > 0 && `ya sin ${f.resueltas.map((t) => `«${t}»`).join(' ni ')}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <details className="group border-t border-borde pt-4">
        <summary className="boton cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          Ajustar umbrales <span aria-hidden="true" className="text-suave group-open:rotate-180">▾</span>
        </summary>
        <div className="mt-3 max-w-3xl space-y-2">
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[34rem] tabular">
              <tbody>
                {datos.umbrales.map((u) => (
                  <tr key={u.clave} className="border-b border-borde/50">
                    <td className="py-1">{REGLA[u.clave] ?? u.descripcion}</td>
                    <td className="w-24 text-right">
                      {SI_NO.includes(u.clave) ? (
                        <input type="checkbox" checked={!!u.valor} aria-label={REGLA[u.clave]} onChange={(e) => guardar(u.clave, e.target.checked ? '1' : '0')} className="accent-acento" />
                      ) : <input key={u.valor} defaultValue={String(u.valor).replace('.', ',')} inputMode="decimal" aria-label={REGLA[u.clave] ?? u.descripcion ?? u.clave}
                        onBlur={(e) => e.target.value !== String(u.valor).replace('.', ',') && guardar(u.clave, e.target.value)}
                        className="w-20 border border-borde bg-panel px-1 py-1 text-right outline-none focus:border-acento" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-suave">Se guarda al salir del campo y la revisión se recalcula.</p>
        </div>
      </details>
    </div>
  )
}

const Num = ({ children, className = '' }: { children: React.ReactNode; className?: string }) =>
  <span className={`cifra text-[19px] leading-none ${className}`}>{children}</span>

const Marca = ({ children }: { children: React.ReactNode }) =>
  <span className="estrecha inline-block border border-aviso px-1 text-[11px] leading-[1.4] font-bold tracking-[0.06em] text-aviso uppercase">{children}</span>

function Carteras({ en, tinta }: { en: EnCartera[]; tinta: Map<number, string> }) {
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-0.5">
      {en.map(({ cartera, peso }) => (
        <span key={cartera.id} className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <i aria-hidden="true" className="inline-block h-2.5 w-2.5 shrink-0" style={{ background: tinta.get(cartera.id) }} />
          <a href={`#/cartera/${cartera.id}`} className="hover:text-acento">{cartera.nombre}</a>
          <span className="text-suave">{cifra(peso, 0)} %</span>
        </span>
      ))}
    </span>
  )
}

/** Nota de la semana, su percentil y lo que ha cambiado desde la semana anterior. */
function Nota({ f, pequena }: { f: Fondo; pequena?: boolean }) {
  if (!f.nota) return <span className="text-suave">sin nota</span>
  const s = f.nota.semana == null ? null : Math.round(f.nota.semana)
  return (
    <span className="inline-flex items-baseline justify-end gap-1.5 whitespace-nowrap">
      <span className={`cifra leading-none ${pequena ? 'text-[17px]' : 'text-[28px] font-extrabold'}`}>{Math.round(f.nota.nota)}</span>
      {f.nota.percentil != null && <span className={`text-[12px] ${colorPercentil(f.nota.percentil)}`}>p{Math.round(f.nota.percentil)}</span>}
      {s != null && (s === 0
        ? <span className="text-[12px] text-suave">= <span className="sr-only">igual que la semana anterior</span></span>
        : <span className={`estrecha text-[13px] font-bold ${s > 0 ? 'text-sube' : 'text-baja'}`}>
          <span aria-hidden="true">{s > 0 ? '▲' : '▼'}</span><span className="sr-only">{s > 0 ? 'sube' : 'baja'}</span> {Math.abs(s)}
        </span>)}
    </span>
  )
}

function Marcado({ f, tinta, seguir }: { f: Fondo; tinta: Map<number, string>; seguir: (isin: string) => void }) {
  const [todas, setTodas] = useState(false)
  const alts = todas ? f.alternativas : f.alternativas.slice(0, 1)
  const ter = f.fondo.ter == null ? null : Number(f.fondo.ter)
  return (
    <li className="grid gap-x-10 gap-y-4 border-t border-borde py-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      <div className="min-w-0 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <Carteras en={f.en} tinta={tinta} />
            <a href={`#/fondo/${f.fondo.isin}`} className="block text-[17px] leading-snug font-semibold text-balance hover:text-acento">{f.fondo.nombre}</a>
            <p className="text-[13px] text-suave">
              <span className="font-mono text-[12px]">{f.fondo.isin}</span> · {f.fondo.categoria ?? 'sin categoría'} · TER {ter == null ? '—' : `${cifra(ter)} %`}
            </p>
          </div>
          <Nota f={f} />
        </div>
        <ul className="space-y-1.5">
          {f.senales.map((s) => (
            <li key={`${s.tipo}${s.motivo}`} className="grid gap-x-3 sm:grid-cols-[15rem_minmax(0,1fr)]">
              <span className="flex items-baseline gap-2">
                <span className="estrecha text-[14px] font-bold tracking-[0.02em] text-aviso uppercase">{s.tipo}</span>
                {f.nuevas.includes(s.tipo) && <Marca>Nueva</Marca>}
              </span>
              <span className="max-w-[70ch]">{s.motivo}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="min-w-0">
        {f.alternativas.length === 0
          ? <p className="text-[13px] text-suave">Sin alternativas en su categoría con estos filtros.</p>
          : <>
            <h3 className="rotulo mb-1.5">{f.alternativas.length === 1 ? 'Alternativa' : todas ? 'Alternativas' : 'Mejor alternativa'}</h3>
            <ul className="divide-y divide-borde/60 border-y border-borde">
              {alts.map((a) => (
                <li key={a.isin} className="space-y-1 py-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <a href={`#/fondo/${a.isin}`} className="min-w-0 leading-snug hover:text-acento">{a.nombre}</a>
                    <span className="cifra shrink-0 text-[19px] leading-none">{Math.round(a.nota)}</span>
                  </div>
                  <p className="text-[13px] text-suave">
                    TER {a.ter == null ? '—' : `${cifra(a.ter)} %`} · correlación {a.c == null ? '—' : cifra(a.c)} · {a.myinvestor ? <span className="text-sube">en MyInvestor</span> : 'no está en MyInvestor'}
                  </p>
                  <p className="flex flex-wrap gap-x-4 text-[13px]">
                    {f.en.map(({ cartera }) => (
                      <a key={cartera.id} href={`#/simular/${cartera.id}/${f.fondo.isin}/${a.isin}`} className="text-acento hover:underline">
                        probar en {f.en.length > 1 ? cartera.nombre : 'la cartera'}
                      </a>
                    ))}
                    <button onClick={() => seguir(a.isin)} className="text-suave hover:text-acento">+ seguir</button>
                  </p>
                </li>
              ))}
            </ul>
            <p className="mt-2 flex flex-wrap justify-between gap-x-4 text-[13px]">
              {f.alternativas.length > 1 && (
                <button onClick={() => setTodas(!todas)} aria-expanded={todas} className="text-suave hover:text-acento">
                  {todas ? 'ver solo la mejor' : `ver ${f.alternativas.length - 1} más`}
                </button>
              )}
              <a href={`#/comparar/${[f.fondo.isin, ...f.alternativas.map((a) => a.isin)].slice(0, 5).join(',')}`} className="text-suave hover:text-acento">comparar con sus alternativas →</a>
            </p>
          </>}
      </div>
    </li>
  )
}
