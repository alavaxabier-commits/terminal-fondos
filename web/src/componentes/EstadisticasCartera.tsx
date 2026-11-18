import type { Composicion } from '../calculo/exposicion'
import { solapamiento } from '../calculo/exposicion'
import { cifra, pct } from '../calculo/formato'
import { lecturaRiesgo, type CalculoCartera } from '../calculo/cartera'
import { CRISIS } from '../calculo/metricas'
import { Titulo } from './Exposicion'
import Tarjeta from './Tarjeta'

export type FondoE = { isin: string; nombre: string; peso: number; ter: number | null; c: Composicion | null }

const color = (v: number | null | undefined) => (v == null ? '' : v > 0 ? 'text-sube' : v < 0 ? 'text-baja' : '')
const meses = (semanas: number) => (semanas < 0 ? 'sin recuperar' : semanas < 9 ? `${semanas} sem.` : `${Math.round(semanas / 4.345)} meses`)
export const corto = (nombre: string) => nombre.split(' ').slice(0, 3).join(' ')

/** Coste anual ponderado (TER en %), o null si falta el de algún fondo. */
export function costeCartera(fondos: { peso: number; ter: number | null }[]) {
  const total = fondos.reduce((s, f) => s + f.peso, 0) || 1
  return fondos.length && fondos.every((f) => f.ter != null) ? fondos.reduce((s, f) => s + (f.peso * f.ter!) / total, 0) : null
}

/** Rentabilidad de cada año natural (los 10 últimos y este año) frente a la referencia, en una fila: por año, las dos barras,
 *  la cifra de la cartera, la de la referencia y la diferencia. */
export function AnoAno({ calc }: { calc: CalculoCartera }) {
  const m = calc.metricas
  const ref = calc.referencia ?? {}
  const anos = Object.keys(m).filter((k) => /^\d{4}$/.test(k)).sort().slice(-10)
  if (m.ytd) anos.push('ytd')
  if (!anos.length) return null
  const c = (a: string) => m[a]?.rentabilidad ?? null
  const r = (a: string) => ref[a]?.rentabilidad ?? null
  const todos = anos.flatMap((a) => [c(a), r(a)]).filter((v): v is number => v != null)
  const sube = Math.max(0, ...todos), baja = Math.max(0, ...todos.map((v) => -v)), alto = 72
  const cero = (sube / (sube + baja || 1)) * alto
  const barra = (v: number | null) => (v == null ? { display: 'none' } : { top: v >= 0 ? cero - (v / (sube + baja || 1)) * alto : cero, height: Math.max(1, (Math.abs(v) / (sube + baja || 1)) * alto) })
  const comparables = anos.filter((a) => c(a) != null && r(a) != null)
  const gana = comparables.filter((a) => c(a)! > r(a)!).length
  return (
    <Tarjeta titulo="Por año natural" extra={
      <span className="flex flex-wrap items-center gap-x-3 text-[12px] text-suave">
        <span><i aria-hidden="true" className="mr-1 inline-block h-2.5 w-2.5 rounded-xs bg-acento" />cartera</span>
        <span><i aria-hidden="true" className="mr-1 inline-block h-2.5 w-2.5 rounded-xs bg-gris" />referencia</span>
        {comparables.length > 0 && <span>gana a la referencia en {gana} de {comparables.length}</span>}
      </span>}>
      <ol className="grid grid-cols-4 gap-y-4 sm:grid-cols-[repeat(var(--n),minmax(0,1fr))]" style={{ '--n': anos.length } as React.CSSProperties}>
        {anos.map((a) => {
          const d = c(a) != null && r(a) != null ? c(a)! - r(a)! : null
          return (
            <li key={a} className="flex flex-col items-center gap-0.5 border-borde/70 px-1 tabular [&:not(:first-child)]:sm:border-l"
              title={`${a === 'ytd' ? 'Este año' : a}: cartera ${pct(c(a))}${r(a) != null ? `, referencia ${pct(r(a))}` : ''}`}>
              <div aria-hidden="true" className="relative w-full" style={{ height: alto }}>
                <span className="absolute inset-x-0 h-px bg-gris" style={{ top: cero }} />
                <span className="absolute left-[24%] w-[22%] bg-acento" style={barra(c(a))} />
                <span className="absolute left-[54%] w-[22%] bg-gris" style={barra(r(a))} />
              </div>
              <span className="estrecha text-[15px] font-bold">{a === 'ytd' ? 'Este año' : a}</span>
              <span className={`cifra text-[22px] leading-tight ${color(c(a))}`}>{pct(c(a))}</span>
              {r(a) != null && <span className="text-[12px] text-suave">ref. {pct(r(a))}</span>}
              {d != null && <span className={`text-[12px] font-semibold ${Math.abs(d) < 0.0005 ? 'text-suave' : color(d)}`}>{pct(d).replace(' %', ' pts')}</span>}
            </li>
          )
        })}
      </ol>
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

/** Correlaciones entre los fondos, con la pareja que más se parece. */
export function Juntos({ calc, fondos }: { calc: CalculoCartera; fondos: FondoE[] }) {
  if (!calc.correlacion) return null
  const { pareja } = lecturaRiesgo(calc, fondos.map((f) => f.peso))
  return (
    <Tarjeta titulo="Cómo se mueven juntos">
      {pareja && (
        <p className="mb-3">
          La pareja que más se parece: <strong>{corto(fondos[pareja.a].nombre)}</strong> y <strong>{corto(fondos[pareja.b].nombre)}</strong>, {cifra(pareja.c)}.
          <span className="text-suave"> {pareja.c >= 0.9 ? 'Son casi el mismo fondo.' : 'Ninguna pasa de 0,9.'}</span>
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
