import { useState } from 'react'
import { lecturaRiesgo, type CalculoCartera } from '../calculo/cartera'
import { cifra, pct } from '../calculo/formato'
import { movimiento, viejo, type Puestos } from '../calculo/jornada'
import type { FondoRevisado } from '../datos/revision'
import { corto } from './EstadisticasCartera'
import Tarjeta from './Tarjeta'

/** Lo que dice la cartera en conjunto, a 3 años: volatilidad, lo que quita diversificar, quién pone más riesgo,
 *  rentabilidad anual y coste. Sale en el Resumen y en Fondos; al editar, frente a la cartera guardada. */
export type Conjunto = { vol: number | null; quita: number | null; rent: number | null; coste: number | null; mayor: { nombre: string; riesgo: number; peso: number } | null }

export function conjunto(calc: CalculoCartera | null, coste: number | null, fondos: { nombre: string; peso: number }[]): Conjunto {
  if (!calc) return { vol: null, quita: null, rent: null, coste, mayor: null }
  const l = lecturaRiesgo(calc, fondos.map((f) => f.peso))
  const total = fondos.reduce((s, f) => s + f.peso, 0) || 1
  return {
    vol: l.vol, quita: l.quita, rent: calc.metricas['3a']?.rentabilidad ?? null, coste,
    mayor: l.mayor == null ? null : { nombre: fondos[l.mayor].nombre, riesgo: calc.fondos[l.mayor].riesgo!, peso: fondos[l.mayor].peso / total },
  }
}

/** Diferencia con la cartera guardada, en puntos, con su color (mejor en verde). */
function Delta({ a, b, menosMejor, decimales = 1, escala = 100 }: { a: number | null; b: number | null | undefined; menosMejor: boolean; decimales?: number; escala?: number }) {
  if (a == null || b == null) return null
  const x = (a - b) * escala
  if (Math.abs(x) < 0.5 * 10 ** -decimales) return <span className="text-suave">igual</span>
  return <span className={`font-semibold ${(x < 0) === menosMejor ? 'text-sube' : 'text-baja'}`}>{x > 0 ? '+' : '−'}{cifra(Math.abs(x), decimales)} pts</span>
}

export function FranjaConjunto({ a, antes }: { a: Conjunto; antes?: Conjunto }) {
  const celdas: [string, string, React.ReactNode][] = [
    ['Volatilidad', pct(a.vol, 1, false), antes ? <><Delta a={a.vol} b={antes.vol} menosMejor /> <span className="text-suave">antes {pct(antes.vol, 1, false)}</span></> : null],
    ['Diversificar quita', a.quita == null ? '—' : `${cifra(a.quita * 100, 1)} pts`,
      antes ? <><Delta a={a.quita} b={antes.quita} menosMejor={false} /> <span className="text-suave">antes {antes.quita == null ? '—' : cifra(antes.quita * 100, 1)}</span></>
        : a.quita != null && a.vol != null && <span className="text-suave">media de los fondos {pct(a.vol + a.quita, 1, false)}</span>],
    ['Más riesgo lo pone', a.mayor ? pct(a.mayor.riesgo, 0, false) : '—', a.mayor && <span className="text-suave">{corto(a.mayor.nombre)}, con {pct(a.mayor.peso, 0, false)} del peso</span>],
    ['Rentabilidad anual', pct(a.rent), antes ? <><Delta a={a.rent} b={antes.rent} menosMejor={false} /> <span className="text-suave">antes {pct(antes.rent)}</span></> : null],
    ['Coste anual', a.coste == null ? '—' : pct(a.coste / 100, 2, false),
      antes ? <><Delta a={a.coste} b={antes.coste} menosMejor decimales={2} escala={1} /> <span className="text-suave">antes {antes.coste == null ? '—' : pct(antes.coste / 100, 2, false)}</span></> : <span className="text-suave">TER ponderado</span>],
  ]
  return (
    <section aria-labelledby="t-conjunto">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 id="t-conjunto" className="rotulo">La cartera en conjunto · 3 años</h2>
        <span className="text-[12px] text-suave">{antes ? 'con los pesos nuevos, frente a la cartera guardada' : 'también en el Resumen, bajo el gráfico'}</span>
      </div>
      <div aria-live="polite" className="grid grid-cols-2 border-y border-borde lg:grid-cols-5">
        {celdas.map(([et, v, pie], i) => (
          <div key={et} className={`py-3 pr-3 ${i ? 'lg:border-l lg:border-borde lg:pl-4' : ''}`}>
            <div className="text-[12px] text-suave">{et}</div>
            <div className="cifra text-[26px] leading-tight tabular">{v}</div>
            <div className="text-[12px] tabular">{pie}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

type Fila = { isin: string; nombre: string; peso: number; ter: number | null }

/** El papel de cada fondo en esta cartera: peso (editable), peso de hoy, riesgo, rentabilidad y coste que pone y cuánto se parece
 *  al resto. Lo que dice el fondo por sí solo va en TablaLiga. */
export function TablaPapel({ filas, calc, coste, editar }: {
  filas: Fila[]; calc: CalculoCartera | null; coste: number | null
  editar?: { peso: (k: number, v: number) => void; quitar: (k: number) => void }
}) {
  const conPeso = filas.filter((f) => f.peso > 0)
  const total = conPeso.reduce((s, f) => s + f.peso, 0) || 1
  const parecido = calc ? lecturaRiesgo(calc, calc.fondos.map((x) => conPeso.find((f) => f.isin === x.isin)?.peso ?? 0)).parecido : []
  const de = (isin: string) => { const i = calc?.fondos.findIndex((x) => x.isin === isin) ?? -1; return i < 0 ? null : { ...calc!.fondos[i], parecido: parecido[i] } }
  const suma = filas.reduce((s, f) => s + f.peso, 0)
  const aporta = calc?.fondos.reduce((s, x) => s + (x.aporta['3a'] ?? 0), 0)
  const th = 'pb-1.5 pl-3 text-left font-normal'
  return (
    <Tarjeta titulo="Qué pone cada fondo en la cartera" extra={<span className="text-[12px] text-suave">cuánto pesa y cuánto riesgo, rentabilidad y coste pone</span>}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[56rem] tabular text-[13px]">
          <thead>
            <tr className="rotulo">
              <th className="pb-1.5 text-left font-normal">Fondo</th>
              <th className={th}>Peso</th>
              <th className={th} title="Peso tras moverse los precios desde el último rebalanceo">Hoy</th>
              <th className={`${th} text-acento`}>Riesgo que pone</th>
              <th className={th} title="Puntos de rentabilidad acumulada a 3 años que pone (suman la de la cartera)">Aporta 3a</th>
              <th className={th}>Coste que pone</th>
              <th className={th} title="Correlación media con los demás fondos, ponderada por su peso">Se parece al resto</th>
              {editar && <th />}
            </tr>
          </thead>
          <tbody>
            {filas.map((f, k) => {
              const x = de(f.isin)
              const deriva = x && f.peso > 0 ? x.pesoHoy * 100 - (f.peso / total) * 100 : null
              const parteCoste = coste && f.ter != null && f.peso > 0 ? (f.peso * f.ter) / total / coste : null
              return (
                <tr key={f.isin} className="border-t border-borde/60">
                  <td className="py-2 pr-3 text-left"><a href={`#/fondo/${f.isin}`} className="font-semibold hover:text-acento">{f.nombre}</a></td>
                  <td className="pl-3">
                    {editar ? (
                      <span className="flex items-center gap-0.5">
                        <button onClick={() => editar.peso(k, Math.max(0, f.peso - 1))} aria-label={`Bajar el peso de ${f.nombre}`} className="h-8 w-7 rounded-xs border border-borde bg-fondo hover:border-acento">−</button>
                        <input type="number" min={0} max={100} step={0.5} value={f.peso} aria-label={`Peso de ${f.nombre}`}
                          onChange={(e) => editar.peso(k, Number(e.target.value))}
                          className="h-8 w-16 rounded-xs border border-borde bg-panel px-1.5 text-right outline-none focus:border-acento" />
                        <button onClick={() => editar.peso(k, Math.min(100, f.peso + 1))} aria-label={`Subir el peso de ${f.nombre}`} className="h-8 w-7 rounded-xs border border-borde bg-fondo hover:border-acento">+</button>
                      </span>
                    ) : <span className="estrecha text-[16px] font-bold">{pct(f.peso / 100, 0, false)}</span>}
                  </td>
                  <td className="pl-3 whitespace-nowrap">
                    {editar || !x ? <span className="text-suave">—</span> : <>{pct(x.pesoHoy, 1, false)}
                      {deriva != null && Math.abs(deriva) >= 0.5 && <span className={`ml-1 text-[11px] ${Math.abs(deriva) >= 5 ? 'text-aviso' : 'text-suave'}`}>{deriva > 0 ? '+' : '−'}{cifra(Math.abs(deriva), 1)}</span>}</>}
                  </td>
                  <td className="pl-3"><Barra v={x?.riesgo} clase="bg-acento" negrita /></td>
                  <td className={`pl-3 ${(x?.aporta['3a'] ?? 0) >= 0 ? 'text-sube' : 'text-baja'}`}>{x?.aporta['3a'] == null ? <span className="text-suave">—</span> : pct(x.aporta['3a']).replace(' %', ' pts')}</td>
                  <td className="pl-3"><Barra v={parteCoste} clase="bg-serie2" /></td>
                  <td className="pl-3">{x?.parecido == null ? <span className="text-suave">—</span> : cifra(x.parecido)}</td>
                  {editar && (
                    <td className="pl-3 text-right">
                      <button onClick={() => editar.quitar(k)} aria-label={`Quitar ${f.nombre}`} className="min-h-8 rounded-sm px-3 text-suave hover:bg-baja/10 hover:text-baja">Quitar</button>
                    </td>
                  )}
                </tr>
              )
            })}
            <tr className="border-t border-borde text-suave">
              <td className="py-2 text-left">Cartera</td>
              <td className={`pl-3 ${Math.abs(suma - 100) >= 0.01 ? 'text-baja' : ''}`}>{cifra(suma, suma % 1 ? 1 : 0)} %</td>
              <td className="pl-3">{calc && !editar ? '100 %' : ''}</td>
              <td className="pl-3">{calc ? `100 % · vol. ${pct(calc.metricas['3a']?.volatilidad, 1, false)}` : ''}</td>
              <td className="pl-3">{aporta == null ? '' : pct(aporta).replace(' %', ' pts')}</td>
              <td className="pl-3">{coste == null ? '' : `100 % · ${pct(coste / 100, 2, false)}`}</td>
              <td />
              {editar && <td />}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-suave">
        Hoy: peso tras moverse los precios desde el último rebalanceo{calc?.ultimoRebalanceo ? ` (${calc.ultimoRebalanceo.split('-').reverse().join('/')})` : ''}.
        Riesgo: parte de la volatilidad de la cartera a 3 años que pone cada fondo. Aporta: puntos de rentabilidad acumulada a 3 años (suman la de la cartera).
        Coste: parte del gasto anual. Se parece al resto: correlación media con los demás fondos, ponderada por su peso; cerca de 0, diversifica.
      </p>
    </Tarjeta>
  )
}

function Barra({ v, clase, negrita }: { v: number | null | undefined; clase: string; negrita?: boolean }) {
  if (v == null) return <span className="text-suave">—</span>
  return (
    <span className="flex min-w-32 items-center gap-2">
      <span aria-hidden="true" className="relative h-2.5 flex-1 rounded-xs bg-borde/55"><span className={`absolute inset-y-0 left-0 rounded-xs ${clase}`} style={{ width: `${Math.min(100, Math.max(0, v * 100))}%` }} /></span>
      <span className={`w-10 text-right ${negrita ? 'font-semibold' : ''}`}>{pct(v, 0, false)}</span>
    </span>
  )
}

const PLAZOS = [['1a', '1 año'], ['3a', '3 años'], ['5a', '5 años'], ['10a', '10 años']] as const
const COLUMNAS = [['rentabilidad', 'Rentab.', (v: number) => pct(v)], ['volatilidad', 'Volatilidad', (v: number) => pct(v, 1, false)],
  ['max_caida', 'Caída máx.', (v: number) => pct(v)], ['sharpe', 'Sharpe', (v: number) => cifra(v)]] as const
const fondoP = (p: number | undefined) => (p == null ? 'bg-panel ring-1 ring-inset ring-borde' : p >= 75 ? 'bg-tinte-alta' : p < 25 ? 'bg-tinte-baja' : 'bg-borde/45')

/** Cada fondo por sí solo, frente a los de su categoría: métricas al plazo elegido con su percentil, nota, puesto y señales. */
export function TablaLiga({ filas, metricas, percentiles, revision, puestos, semana }: {
  filas: (Fila & { categoria: string | null })[]
  metricas: (isin: string) => Map<string, number> | undefined; percentiles: (isin: string) => Map<string, number> | undefined
  revision: Map<string, FondoRevisado>; puestos: Map<string, Puestos>; semana: string
}) {
  const [plazo, setPlazo] = useState<(typeof PLAZOS)[number][0]>('3a')
  const th = 'pb-1.5 pl-[3px] font-normal'
  return (
    <Tarjeta titulo="Cada fondo en su categoría" extra={
      <span className="flex flex-wrap items-center gap-2 text-[12px] text-suave">
        el fondo por sí solo, frente a su categoría
        <span role="group" aria-label="Plazo de las métricas" className="flex gap-0.5 rounded-sm bg-borde/50 p-0.5">
          {PLAZOS.map(([v, t]) => (
            <button key={v} onClick={() => setPlazo(v)} aria-pressed={plazo === v}
              className={`rounded-sm px-3 py-0.5 ${plazo === v ? 'bg-panel text-texto ring-1 ring-borde' : 'hover:text-texto'}`}>{t}</button>
          ))}
        </span>
      </span>}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[60rem] border-separate border-spacing-y-[3px] tabular text-[13px]">
          <thead>
            <tr className="rotulo">
              <th className="pb-1.5 text-left font-normal">Fondo</th>
              <th className={`${th} text-right`}>TER</th>
              {COLUMNAS.map(([k, t]) => <th key={k} className={`${th} w-28 text-center`}>{t}</th>)}
              <th className={`${th} pl-3 text-left`}>Nota</th>
              <th className={`${th} pl-3 text-left`} title="Puesto en su categoría por la nota guardada esta semana, y lo que ha subido o bajado">Puesto</th>
              <th className={`${th} pl-3 text-left`}>Señales</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const m = metricas(f.isin), p = percentiles(f.isin), r = revision.get(f.isin)
              const hay = COLUMNAS.some(([k]) => m?.has(`${plazo}|${k}`))
              return (
                <tr key={f.isin} className={r?.senales.length ? '[&>td:first-child]:bg-aviso/10' : ''}>
                  <td className="py-1.5 pr-3 pl-2 text-left">
                    <a href={`#/fondo/${f.isin}`} className="font-semibold hover:text-acento">{f.nombre}</a>
                    <span className="block text-[12px] text-suave">{f.categoria ?? 'sin categoría'}</span>
                  </td>
                  <td className="px-2 text-right">{f.ter == null ? '—' : pct(f.ter / 100, 2, false)}</td>
                  {hay ? COLUMNAS.map(([k, , fmt]) => {
                    const v = m?.get(`${plazo}|${k}`), pc = p?.get(`${plazo}|${k}`)
                    return (
                      <td key={k} className={`rounded-xs px-2 py-2 ${v == null ? 'rayado text-center text-[11px] text-suave' : fondoP(pc)}`}>
                        {v == null ? '—' : <span className="flex items-baseline justify-between gap-1"><span className="estrecha text-[16px] font-bold">{fmt(v)}</span>{pc != null && <span className={`text-[11px] ${pc >= 75 ? 'text-acento' : pc < 25 ? 'text-baja' : 'text-suave'}`}>p{Math.round(pc)}</span>}</span>}
                      </td>
                    )
                  }) : <td colSpan={4} className="rayado rounded-xs text-center text-[12px] text-suave">sin historia a {PLAZOS.find(([v]) => v === plazo)![1]}</td>}
                  <td className="pl-3">{r?.nota ? <><span className="estrecha text-[16px] font-bold">{cifra(r.nota.nota, 1)}</span>{r.nota.percentil != null && <span className="text-[11px] text-suave"> p{Math.round(r.nota.percentil)}</span>}</> : <span className="text-suave">—</span>}</td>
                  <td className="pl-3 text-left whitespace-nowrap"><Once p={puestos.get(f.isin)} semana={semana} /></td>
                  <td className="pl-3 text-left">
                    {r?.senales.map((s) => <a key={s.tipo} href="#/revision" title={s.motivo} className="mr-1 inline-block rounded-sm bg-aviso/15 px-2 text-[11px] text-aviso">{s.tipo}</a>)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-suave">Azul: en el mejor 25 % de su categoría; rojo: en el peor 25 % (en volatilidad y caída, mejor es menos). El número pequeño es el percentil.</p>
    </Tarjeta>
  )
}

/** El «once»: el puesto del fondo en su liga (categoría), en amarillo; tachado con su fecha si no es de esta semana. */
export function Once({ p, semana }: { p: Puestos | undefined; semana: string }) {
  if (!p) return <span className="text-suave">—</span>
  const v = viejo(p, semana), m = movimiento(p)
  return (
    <span className="inline-flex items-baseline gap-2">
      <span className={`estrecha inline-block min-w-[3.25rem] bg-once px-1.5 text-center text-[16px] font-extrabold text-sobre-once ${v ? 'line-through opacity-60' : ''}`}>{p.puestos.at(-1)}.º</span>
      <span className="text-[12px] text-suave">de {p.de}</span>
      {v ? <span className="text-[11px] text-baja">{new Date(v + 'T12:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</span>
        : m ? <span className={`estrecha text-[14px] font-bold ${m > 0 ? 'text-zona-alta' : 'text-zona-baja'}`}>{m > 0 ? `▲ ${m}` : `▼ ${-m}`}</span> : null}
    </span>
  )
}
