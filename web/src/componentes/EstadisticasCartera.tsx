import type { Composicion } from '../calculo/exposicion'
import { solapamiento } from '../calculo/exposicion'
import { cifra, fecha, pct } from '../calculo/formato'
import type { CalculoCartera } from '../calculo/cartera'
import { CRISIS } from '../calculo/metricas'
import { Titulo } from './Exposicion'

type FondoE = { isin: string; nombre: string; peso: number; ter: number | null; c: Composicion | null }

const VENTANAS = [['1a', '1A'], ['3a', '3A'], ['5a', '5A']] as const
// [nombre, clave, formato, ¿de la referencia también?]
const CIFRAS: [string, string, (v: number | undefined) => string, boolean][] = [
  ['Rentabilidad anual', 'rentabilidad', (v) => pct(v), true],
  ['Volatilidad', 'volatilidad', (v) => pct(v, 1, false), true],
  ['Caída máxima', 'max_caida', (v) => pct(v), true],
  ['Sharpe', 'sharpe', (v) => cifra(v), true],
  ['Sortino', 'sortino', (v) => cifra(v), true],
  ['Volatilidad (mensual)', 'volatilidad_mensual', (v) => pct(v, 1, false), false],
  ['Sharpe (mensual)', 'sharpe_mensual', (v) => cifra(v), false],
  ['Alfa', 'alfa', (v) => pct(v), false],
  ['Beta', 'beta', (v) => cifra(v), false],
  ['R²', 'r2', (v) => cifra(v, 0), false],
  ['Tracking error', 'tracking_error', (v) => pct(v, 1, false), false],
  ['Ratio de información', 'ratio_informacion', (v) => cifra(v), false],
]

const color = (v: number | null | undefined) => (v == null ? '' : v > 0 ? 'text-sube' : v < 0 ? 'text-baja' : '')
const meses = (semanas: number) => (semanas < 0 ? 'sin recuperar' : semanas < 9 ? `${semanas} sem.` : `${Math.round(semanas / 4.345)} meses`)
const corto = (nombre: string) => nombre.split(' ').slice(0, 3).join(' ')

/** Estadísticas de la cartera simulada (calculadas en Python), coste, aportación, correlaciones y solapamiento. */
export default function EstadisticasCartera({ calc, fondos }: { calc: CalculoCartera | null; fondos: FondoE[] }) {
  const total = fondos.reduce((s, f) => s + f.peso, 0) || 1
  const coste = fondos.every((f) => f.ter != null) ? fondos.reduce((s, f) => s + (f.peso * f.ter!) / total, 0) : null

  if (!calc)
    return (
      <section>
        <Titulo>Estadísticas de la cartera</Titulo>
        <p className="text-suave">Sin historia común suficiente entre los fondos para calcularlas.</p>
      </section>
    )

  const m = calc.metricas
  const ref = calc.referencia ?? {}
  const anos = Object.keys(m).filter((k) => /^\d{4}$/.test(k)).sort()
  if (m.ytd) anos.push('ytd')
  const porIsin = new Map(calc.fondos.map((f) => [f.isin, f]))
  const aportaVentanas = VENTANAS.filter(([v]) => calc.fondos.some((f) => f.aporta[v] != null))
  const vol3 = m['3a']?.volatilidad

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-[11px] uppercase tracking-widest text-suave">Estadísticas de la cartera</h2>
        <p className="text-suave">
          Simulada con rebalanceo desde {fecha(calc.desde)} hasta {fecha(calc.hasta)}, frente a la referencia de cada fondo combinada con sus pesos
          {coste != null && <> · coste: <span className="text-texto">{pct(coste / 100, 2, false)}</span> al año</>}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <div className="overflow-x-auto">
          <Titulo>Riesgo y rentabilidad</Titulo>
          <table className="w-full min-w-[22rem] text-right tabular whitespace-nowrap [&_tr>*+*]:pl-3">
            <thead className="text-[11px] uppercase tracking-widest text-suave">
              <tr className="border-b border-borde">
                <th className="py-1 text-left font-normal" />
                {VENTANAS.map(([v, t]) => <th key={v} className="font-normal">{t}</th>)}
              </tr>
            </thead>
            <tbody>
              {CIFRAS.map(([n, k, f, conRef]) => (
                <tr key={k} className="border-b border-borde/50">
                  <td className="whitespace-normal py-1 text-left">{n}</td>
                  {VENTANAS.map(([v]) => (
                    <td key={v}>
                      {f(m[v]?.[k])}
                      {conRef && ref[v]?.[k] != null && <span className="block text-[11px] text-suave">ref. {f(ref[v][k])}</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-6">
          <div className="overflow-x-auto">
            <Titulo>Año a año</Titulo>
            <table className="w-full text-right tabular whitespace-nowrap [&_tr>*+*]:pl-3">
              <thead className="text-[11px] uppercase tracking-widest text-suave">
                <tr className="border-b border-borde">
                  <th className="py-1 text-left font-normal">Año</th>
                  <th className="font-normal">Cartera</th>
                  <th className="font-normal">Referencia</th>
                  <th className="font-normal">Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {anos.map((a) => {
                  const c = m[a]?.rentabilidad
                  const r = ref[a]?.rentabilidad
                  return (
                    <tr key={a} className="border-b border-borde/50">
                      <td className="py-1 text-left">{a === 'ytd' ? 'Este año' : a}</td>
                      <td className={color(c)}>{pct(c)}</td>
                      <td className="text-suave">{pct(r)}</td>
                      <td className={color(c != null && r != null ? c - r : null)}>{c != null && r != null ? pct(c - r) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="overflow-x-auto">
            <Titulo>En las crisis</Titulo>
            <table className="w-full text-right tabular whitespace-nowrap [&_tr>*+*]:pl-3">
              <thead className="text-[11px] uppercase tracking-widest text-suave">
                <tr className="border-b border-borde">
                  <th className="py-1 text-left font-normal" />
                  <th className="font-normal">Caída</th>
                  <th className="font-normal">Recupera</th>
                  <th className="font-normal">Referencia</th>
                </tr>
              </thead>
              <tbody>
                {CRISIS.map(([k, n]) => {
                  const c = calc.crisis[k]
                  return (
                    <tr key={k} className="border-b border-borde/50">
                      <td className="whitespace-normal py-1 text-left">{n}</td>
                      <td className="text-baja">{c?.cartera ? pct(c.cartera[0]) : '—'}</td>
                      <td>{c?.cartera ? meses(c.cartera[1]) : '—'}</td>
                      <td className="text-suave">{c?.referencia ? `${pct(c.referencia[0])} · ${meses(c.referencia[1])}` : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="mt-1 text-suave">Caída desde el máximo dentro de cada tramo y tiempo hasta volver a él.</p>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Titulo>Qué pone cada fondo</Titulo>
        <table className="w-full min-w-[40rem] text-right tabular whitespace-nowrap [&_tr>*+*]:pl-3">
          <thead className="text-[11px] uppercase tracking-widest text-suave">
            <tr className="border-b border-borde">
              <th className="py-1 text-left font-normal">Fondo</th>
              <th className="font-normal">Peso</th>
              <th className="font-normal">Hoy</th>
              {aportaVentanas.map(([v, t]) => <th key={v} className="font-normal">Aporta {t}</th>)}
              <th className="font-normal">Riesgo</th>
              <th className="font-normal">Coste</th>
            </tr>
          </thead>
          <tbody>
            {fondos.map((f) => {
              const x = porIsin.get(f.isin)
              const deriva = x ? x.pesoHoy * 100 - (f.peso / total) * 100 : null
              return (
                <tr key={f.isin} className="border-b border-borde/50">
                  <td className="whitespace-normal py-1 text-left">{f.nombre}</td>
                  <td>{pct(f.peso / total, 0, false)}</td>
                  <td>
                    {pct(x?.pesoHoy, 1, false)}
                    {deriva != null && Math.abs(deriva) >= 0.5 && <span className={`block text-[11px] ${Math.abs(deriva) >= 5 ? 'text-aviso' : 'text-suave'}`}>{pct(deriva / 100)}</span>}
                  </td>
                  {aportaVentanas.map(([v]) => <td key={v} className={color(x?.aporta[v])}>{pct(x?.aporta[v])}</td>)}
                  <td>{pct(x?.riesgo, 0, false)}</td>
                  <td className="text-suave">{coste && f.ter != null ? pct((f.peso * f.ter) / total / coste, 0, false) : '—'}</td>
                </tr>
              )
            })}
            <tr className="text-suave">
              <td className="py-1 text-left">Cartera</td>
              <td>100 %</td>
              <td />
              {aportaVentanas.map(([v]) => <td key={v} className={color(m[v]?.acumulada)}>{pct(m[v]?.acumulada)}</td>)}
              <td>100 %</td>
              <td>{pct((coste ?? NaN) / 100, 2, false)}</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-1 text-suave">
          Hoy: peso tras moverse los precios desde el último rebalanceo ({fecha(calc.ultimoRebalanceo)}). Aporta: puntos de rentabilidad acumulada
          que pone cada fondo (suman la de la cartera). Riesgo: parte de la volatilidad de la cartera que pone cada fondo, con 3 años.
          Coste: parte del gasto anual.
        </p>
      </div>

      {calc.correlacion && (
        <div>
          <Titulo>Cómo se mueven juntos</Titulo>
          {calc.volatilidadMedia != null && vol3 != null && (
            <p className="mb-2">
              Volatilidad a 3 años: media de los fondos {pct(calc.volatilidadMedia, 1, false)}, cartera {pct(vol3, 1, false)}
              <span className="text-suave"> · diversificar quita </span>
              <span className={calc.volatilidadMedia - vol3 >= 0.005 ? 'text-sube' : ''}>{cifra(Math.max(0, calc.volatilidadMedia - vol3) * 100, 1)} puntos</span>
            </p>
          )}
          <MatrizCorrelacion nombres={fondos.map((f) => f.nombre)} matriz={calc.correlacion.matriz} />
          <p className="mt-1 text-suave">Correlación de las rentabilidades semanales de {calc.correlacion.semanas} semanas: por encima de 0,9 es casi el mismo fondo; cerca de 0 o negativa, diversifican.</p>
        </div>
      )}

      <Solapes fondos={fondos} />
    </section>
  )
}

/** Correlaciones de cada par, coloreadas (más verde, más se parecen). */
export function MatrizCorrelacion({ nombres, matriz }: { nombres: string[]; matriz: (number | null)[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="tabular whitespace-nowrap [&_tr>*+*]:pl-3 text-center">
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
                  className="py-2"
                  style={i !== j && v != null ? { background: `rgba(79, 209, 139, ${Math.max(0, v) * 0.6})`, color: v >= 0.6 ? '#0b0e0d' : undefined } : undefined}
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
export function Solapes({ fondos }: { fondos: { nombre: string; c: Composicion | null }[] }) {
  const solapes = solapamiento(fondos).filter((s) => s.pct >= 1)
  return (
    <div>
      <Titulo>Posiciones en común</Titulo>
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
      <p className="mt-1 text-suave">Parte de cartera que comparten dos fondos: la suma del menor peso de cada posición común.</p>
    </div>
  )
}
