import type { Composicion } from '../calculo/exposicion'
import { solapamiento } from '../calculo/exposicion'
import { cifra, fecha, pct } from '../calculo/formato'
import type { CalculoCartera } from '../calculo/cartera'
import { CRISIS, VENTANAS } from '../calculo/metricas'
import { FILAS, GRUPOS } from '../pantallas/Ficha'
import { Titulo } from './Exposicion'
import Tarjeta from './Tarjeta'

type FondoE = { isin: string; nombre: string; peso: number; ter: number | null; c: Composicion | null }

const color = (v: number | null | undefined) => (v == null ? '' : v > 0 ? 'text-sube' : v < 0 ? 'text-baja' : '')
const meses = (semanas: number) => (semanas < 0 ? 'sin recuperar' : semanas < 9 ? `${semanas} sem.` : `${Math.round(semanas / 4.345)} meses`)
const corto = (nombre: string) => nombre.split(' ').slice(0, 3).join(' ')
const sinPct = (v: number | null | undefined) => (v == null ? '—' : pct(v, 1, false).replace(' %', ''))
const plazo = (v: string) => (v === '1a' ? '1 año' : `${v.slice(0, -1)} años`)

/** Coste anual ponderado (TER en %), o null si falta el de algún fondo. */
export function costeCartera(fondos: { peso: number; ter: number | null }[]) {
  const total = fondos.reduce((s, f) => s + f.peso, 0) || 1
  return fondos.length && fondos.every((f) => f.ter != null) ? fondos.reduce((s, f) => s + (f.peso * f.ter!) / total, 0) : null
}

/** Rentabilidad de cada año natural (los 10 últimos y este año) frente a la referencia. */
export function AnoAno({ calc }: { calc: CalculoCartera }) {
  const m = calc.metricas
  const ref = calc.referencia ?? {}
  const anos = Object.keys(m).filter((k) => /^\d{4}$/.test(k)).sort().slice(-10)
  if (m.ytd) anos.push('ytd')
  if (!anos.length) return null
  const filas: [string, (a: string) => number | null | undefined, string][] = [
    ['Cartera', (a) => m[a]?.rentabilidad, ''],
    ['Referencia', (a) => ref[a]?.rentabilidad, 'text-suave'],
    ['Diferencia', (a) => (m[a]?.rentabilidad != null && ref[a]?.rentabilidad != null ? m[a].rentabilidad - ref[a].rentabilidad : null), ''],
  ]
  return (
    <Tarjeta titulo="Por año natural" extra={<span className="text-[12px] text-suave">rentabilidad en %</span>}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[460px] tabular text-[13px]">
          <thead><tr className="text-[11px] text-suave"><th />{anos.map((a) => <th key={a} className="pb-1 pl-2 text-right font-normal">{a === 'ytd' ? 'Este año' : a}</th>)}</tr></thead>
          <tbody>
            {filas.filter(([, v]) => anos.some((a) => v(a) != null)).map(([n, v, cls]) => (
              <tr key={n} className="border-t border-borde/60">
                <td className="py-1 pr-2 text-left text-[12px] text-suave">{n}</td>
                {anos.map((a) => <td key={a} className={`py-1 pl-2 text-right ${cls || color(v(a))}`}>{sinPct(v(a))}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Tarjeta>
  )
}

/** Caída y recuperación en las crisis recientes, frente a la referencia. */
export function Crisis({ calc }: { calc: CalculoCartera }) {
  const crisis = CRISIS.filter(([k]) => calc.crisis[k]?.cartera)
  if (!crisis.length) return null
  return (
    <Tarjeta titulo="En las crisis" extra={<span className="text-[12px] text-suave">caída desde el máximo del tramo y tiempo hasta volver a él</span>}>
      <table className="w-full tabular text-[13px]">
        <thead>
          <tr className="text-[11px] text-suave">
            <th className="pb-1 text-left font-normal" /><th className="pb-1 text-right font-normal">Caída</th>
            <th className="pb-1 pl-3 text-right font-normal">Recupera</th><th className="pb-1 pl-3 text-right font-normal">Referencia</th>
          </tr>
        </thead>
        <tbody>
          {crisis.map(([k, n]) => {
            const c = calc.crisis[k]
            return (
              <tr key={k} className="border-t border-borde/60">
                <td className="py-1.5 text-left">{n}</td>
                <td className="text-right text-baja">{c?.cartera ? pct(c.cartera[0]) : '—'}</td>
                <td className="pl-3 text-right">{c?.cartera ? meses(c.cartera[1]) : '—'}</td>
                <td className="pl-3 text-right text-suave">{c?.referencia ? `${pct(c.referencia[0])} · ${meses(c.referencia[1])}` : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Tarjeta>
  )
}

/** Las métricas de la cartera simulada agrupadas como en la ficha, cada una con la de su referencia debajo. */
export function MetricasCartera({ calc }: { calc: CalculoCartera }) {
  const m = calc.metricas
  const ref = calc.referencia ?? {}
  const ventanas = VENTANAS.map(([v]) => v).filter((v) => m[v])
  if (!ventanas.length) return <p className="text-suave">Sin historia suficiente para las métricas (hace falta al menos un año).</p>
  return (
    <>
      {GRUPOS.map(([grupo, ayudaGrupo, claves]) => {
        const filas = claves.filter(([k]) => ventanas.some((v) => m[v]?.[k] != null))
        if (!filas.length) return null
        return (
          <Tarjeta key={grupo} titulo={grupo} extra={<span className="text-[12px] text-suave">{ayudaGrupo}</span>}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] tabular">
                <thead>
                  <tr className="text-[12px] text-suave">
                    <th className="pb-1.5 text-left font-normal" />
                    {ventanas.map((v) => <th key={v} className="w-[14%] pb-1.5 pl-4 text-right font-normal">{plazo(v)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {filas.map(([nombre, ayuda]) => {
                    const [, etiqueta, fmt] = FILAS.find(([k]) => k === nombre)!
                    return (
                      <tr key={nombre} className="border-t border-borde/60">
                        <td className="py-2 pr-4 text-left">
                          <span className="block">{etiqueta}</span>
                          <span className="block text-[12px] text-suave">{ayuda}</span>
                        </td>
                        {ventanas.map((v) => {
                          const x = m[v]?.[nombre]
                          const r = ref[v]?.[nombre]
                          return (
                            <td key={v} className="py-2 pl-4 text-right align-top">
                              {x == null ? <span className="text-suave">—</span> : fmt(x)}
                              {r != null && <span className="block text-[11px] text-suave">ref. {fmt(r)}</span>}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Tarjeta>
        )
      })}
      <p className="text-[12px] text-suave">
        Cartera simulada con su rebalanceo desde el {fecha(calc.desde)} hasta el {fecha(calc.hasta)}. Debajo de cada cifra, la de la referencia: la de cada fondo combinada con sus pesos.
      </p>
    </>
  )
}

/** Qué pone cada fondo: peso de hoy, rentabilidad aportada, riesgo y coste. */
export function Aportacion({ calc, fondos }: { calc: CalculoCartera; fondos: FondoE[] }) {
  const total = fondos.reduce((s, f) => s + f.peso, 0) || 1
  const coste = costeCartera(fondos)
  const m = calc.metricas
  const porIsin = new Map(calc.fondos.map((f) => [f.isin, f]))
  const ventanas = VENTANAS.filter(([v]) => calc.fondos.some((f) => f.aporta[v] != null)).map(([v]) => v)
  return (
    <Tarjeta titulo="Qué pone cada fondo">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-right tabular text-[13px] whitespace-nowrap">
          <thead>
            <tr className="text-[12px] text-suave">
              <th className="pb-1.5 text-left font-normal">Fondo</th>
              <th className="pl-3 font-normal">Peso</th>
              <th className="pl-3 font-normal">Hoy</th>
              {ventanas.map((v) => <th key={v} className="pl-3 font-normal">Aporta {plazo(v)}</th>)}
              <th className="pl-3 font-normal">Riesgo</th>
              <th className="pl-3 font-normal">Coste</th>
            </tr>
          </thead>
          <tbody>
            {fondos.map((f) => {
              const x = porIsin.get(f.isin)
              const deriva = x ? x.pesoHoy * 100 - (f.peso / total) * 100 : null
              return (
                <tr key={f.isin} className="border-t border-borde/60">
                  <td className="whitespace-normal py-1.5 text-left">{f.nombre}</td>
                  <td className="pl-3">{pct(f.peso / total, 0, false)}</td>
                  <td className="pl-3">
                    {pct(x?.pesoHoy, 1, false)}
                    {deriva != null && Math.abs(deriva) >= 0.5 && <span className={`block text-[11px] ${Math.abs(deriva) >= 5 ? 'text-aviso' : 'text-suave'}`}>{pct(deriva / 100)}</span>}
                  </td>
                  {ventanas.map((v) => <td key={v} className={`pl-3 ${color(x?.aporta[v])}`}>{pct(x?.aporta[v])}</td>)}
                  <td className="pl-3">{pct(x?.riesgo, 0, false)}</td>
                  <td className="pl-3 text-suave">{coste && f.ter != null ? pct((f.peso * f.ter) / total / coste, 0, false) : '—'}</td>
                </tr>
              )
            })}
            <tr className="border-t border-borde text-suave">
              <td className="py-1.5 text-left">Cartera</td>
              <td className="pl-3">100 %</td>
              <td />
              {ventanas.map((v) => <td key={v} className={`pl-3 ${color(m[v]?.acumulada)}`}>{pct(m[v]?.acumulada)}</td>)}
              <td className="pl-3">100 %</td>
              <td className="pl-3">{pct((coste ?? NaN) / 100, 2, false)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-suave">
        Hoy: peso tras moverse los precios desde el último rebalanceo ({fecha(calc.ultimoRebalanceo)}). Aporta: puntos de rentabilidad acumulada
        que pone cada fondo (suman la de la cartera). Riesgo: parte de la volatilidad de la cartera que pone cada fondo, con 3 años.
        Coste: parte del gasto anual.
      </p>
    </Tarjeta>
  )
}

/** Correlaciones entre los fondos y lo que quita diversificar. */
export function Juntos({ calc, fondos }: { calc: CalculoCartera; fondos: FondoE[] }) {
  if (!calc.correlacion) return null
  const vol3 = calc.metricas['3a']?.volatilidad
  return (
    <Tarjeta titulo="Cómo se mueven juntos">
      {calc.volatilidadMedia != null && vol3 != null && (
        <p className="mb-3">
          Volatilidad a 3 años: media de los fondos {pct(calc.volatilidadMedia, 1, false)}, cartera {pct(vol3, 1, false)}
          <span className="text-suave"> · diversificar quita </span>
          <span className={calc.volatilidadMedia - vol3 >= 0.005 ? 'text-sube' : ''}>{cifra(Math.max(0, calc.volatilidadMedia - vol3) * 100, 1)} puntos</span>
        </p>
      )}
      <MatrizCorrelacion nombres={fondos.map((f) => f.nombre)} matriz={calc.correlacion.matriz} />
      <p className="mt-2 text-[11px] text-suave">Correlación de las rentabilidades semanales de {calc.correlacion.semanas} semanas: por encima de 0,9 es casi el mismo fondo; cerca de 0 o negativa, diversifican.</p>
    </Tarjeta>
  )
}

/** Correlaciones de cada par, coloreadas (más intenso, más se parecen). */
export function MatrizCorrelacion({ nombres, matriz }: { nombres: string[]; matriz: (number | null)[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="tabular whitespace-nowrap [&_tr>*+*]:pl-1 text-center">
        <thead className="text-suave">
          <tr>
            <th />
            {nombres.map((f, j) => <th key={j} className="w-14 font-normal" title={f}>{j + 1}</th>)}
          </tr>
        </thead>
        <tbody>
          {nombres.map((f, i) => (
            <tr key={i}>
              <th className="pr-3 text-left font-normal">
                <span className="text-suave">{i + 1}</span> {corto(f)}
              </th>
              {matriz[i].map((v, j) => (
                <td
                  key={j}
                  className="rounded-sm py-2"
                  style={i !== j && v != null ? { background: `color-mix(in srgb, var(--color-acento) ${Math.max(0, v) * 60}%, transparent)`, color: v >= 0.6 ? 'var(--color-fondo)' : undefined } : undefined}
                  title={`${f} · ${nombres[j]}`}
                >
                  {i === j ? '·' : cifra(v)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Pares de fondos que comparten posiciones, de más a menos. */
export function Solapes({ fondos, titulo = true }: { fondos: { nombre: string; c: Composicion | null }[]; titulo?: boolean }) {
  const solapes = solapamiento(fondos).filter((s) => s.pct >= 1)
  return (
    <div>
      {titulo && <Titulo>Posiciones en común</Titulo>}
      {!solapes.length ? (
        <p className="text-suave">Los fondos no comparten posiciones (o no hay composición todavía).</p>
      ) : (
        <ul className="space-y-1">
          {solapes.map((s) => (
            <li key={`${s.a}|${s.b}`}>
              <span className="tabular">{pct(s.pct / 100, 1, false)}</span> · {corto(s.a)} y {corto(s.b)}
              <span className="text-suave"> · {s.comunes.join(', ')}{!s.completo && ' · al menos (falta alguna posición)'}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-suave">Parte de cartera que comparten dos fondos: la suma del menor peso de cada posición común.</p>
    </div>
  )
}
