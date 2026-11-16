import { useState } from 'react'
import {
  CAJA_RF, CAJA_RV, exposicion,
  type Cifra, type Fila, type Fondo, type Grupo, type PosicionCartera,
} from '../calculo/exposicion'
import { cifra, fecha, pct } from '../calculo/formato'
import Reparto from './Reparto'
import Tarjeta from './Tarjeta'

type FondoX = Fondo & { fechaCartera: string | null }

/** X-Ray de una cartera (o de uno de sus fondos): tipo de activo y, a elegir, la parte de renta variable o la de renta fija. */
export default function Exposicion({ fondos }: { fondos: FondoX[] }) {
  const [elegido, setElegido] = useState('') // '' = toda la cartera
  const [parte, setParte] = useState<'rv' | 'rf' | null>(null)
  const vistos = elegido ? fondos.filter((f) => f.nombre === elegido).map((f) => ({ ...f, peso: 100 })) : fondos
  const x = exposicion(vistos)
  const conDatos = fondos.filter((f) => f.c?.activos?.neto)

  if (!conDatos.length)
    return (
      <Tarjeta titulo="Exposición">
        <p className="text-suave">Sin composición todavía: se descarga los domingos.</p>
      </Tarjeta>
    )

  const partes = ([['rv', 'Renta variable', x.rv], ['rf', 'Renta fija y liquidez', x.rf]] as const).filter(([, , v]) => v >= 5)
  const tab = partes.find(([k]) => k === parte)?.[0] ?? [...partes].sort((a, b) => b[2] - a[2])[0]?.[0]
  const antiguas = vistos.filter((f) => f.fechaCartera && f.fechaCartera < haceMeses(6))
  // Lo esencial, para la primera tarjeta: lo que más pesa de cada desglose (el detalle, en las tarjetas de abajo).
  const mayor = (filas: Fila[]) => filas.reduce<Fila | null>((m, f) => (!m || f[1] > m[1] ? f : m), null)
  const deLa = (f: Fila | null, parte: string) => f && `${f[0]} · ${pct(f[1] / 100, 0, false)} ${parte}`
  const casilla = Object.entries(x.estiloRv).reduce<[string, number] | null>((m, e) => (!m || e[1] > m[1] ? e : m), null)
  const top10 = [...x.acciones, ...x.otras].sort((a, b) => b.peso - a.peso).slice(0, 10).reduce((t, p) => t + p.peso, 0)
  const ultimaCartera = vistos.map((f) => f.fechaCartera).filter(Boolean).sort().at(-1)
  const emergentes = x.mercados.find(([n]) => n === 'Emergentes')
  const duracion = x.estadisticasRf.find(([n]) => n === 'Duración efectiva')
  const esencial = ([
    ...(x.rv >= 5 ? [
      ['Región principal', deLa(mayor(x.regiones.flatMap((g) => g.filas)), 'de la RV')],
      ['Sector principal', deLa(mayor(x.sectores.flatMap((g) => g.filas)), 'de la RV')],
      ['Emergentes', emergentes && `${pct(emergentes[1] / 100, 0, false)} de la RV`],
      ['Estilo dominante', casilla && `${CAJA_RV.filas[Math.floor((+casilla[0] - 1) / 3)]} · ${CAJA_RV.cols[(+casilla[0] - 1) % 3].replace('Crecim.', 'Crecimiento')} (${Math.round(casilla[1])} %)`],
    ] : []),
    ...(x.rf >= 5 ? [
      ['Calidad principal', deLa(mayor(x.calidad), 'de los bonos')],
      ['Sector de los bonos', deLa(mayor(x.sectoresRf), 'de los bonos')],
      ['Duración efectiva', duracion?.[1] != null && `${cifra(duracion[1], 1)} años`],
    ] : []),
    ['10 mayores posiciones', top10 > 0 && `${pct(top10 / 100, 0, false)} de la cartera`],
    ['Cartera del', ultimaCartera && fecha(ultimaCartera)],
  ] as [string, string | false | null | undefined][]).filter((e): e is [string, string] => !!e[1])

  return (
    <div className="space-y-4">
      <Tarjeta titulo="Exposición" extra={conDatos.length > 1 && (
        <select value={elegido} onChange={(e) => setElegido(e.target.value)} aria-label="Ver la exposición de"
          className="max-w-full rounded-sm border border-borde bg-panel px-3 py-1 text-texto">
          <option value="">Toda la cartera</option>
          {conDatos.map((f) => <option key={f.nombre} value={f.nombre}>{f.nombre}</option>)}
        </select>
      )}>
        <div className="grid items-center gap-x-10 gap-y-5 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
          <Reparto activos={x.activos} />
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
            {esencial.map(([k, v]) => (
              <div key={k} className="min-w-0 border-l-2 border-borde pl-3">
                <dt className="text-[12px] text-suave">{k}</dt><dd className="truncate text-[14px]" title={v}>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          {partes.length > 1 && (
            <div role="group" aria-label="Parte de la cartera" className="flex flex-wrap gap-0.5 rounded-sm bg-borde/50 p-0.5 text-[13px]">
              {partes.map(([k, t, v]) => (
                <button key={k} type="button" aria-pressed={k === tab} onClick={() => setParte(k)}
                  className={`rounded-sm px-3 py-1 ${k === tab ? 'bg-panel text-texto ring-1 ring-borde' : 'text-suave hover:text-texto'}`}>
                  {t} · {pct(v / 100, 0, false)}
                </button>
              ))}
            </div>
          )}
          <p className="text-[12px] text-suave">
          {elegido ? `Cartera de ${elegido} según Morningstar` : 'Cartera de cada fondo según Morningstar, ponderada por su peso'}
          {x.cobertura < 99.5 && <span className="text-aviso"> · solo el {pct(x.cobertura / 100, 0, false)} de la cartera tiene datos</span>}
          {x.cortos.length > 0 && <> · cifras netas: {x.cortos.join(', ')} {x.cortos.length > 1 ? 'tienen' : 'tiene'} posiciones cortas</>}
          {antiguas.length > 0 && <span className="text-aviso"> · cartera antigua: {antiguas.map((f) => `${f.nombre} (${fecha(f.fechaCartera)})`).join(', ')}</span>}
          </p>
        </div>
      </Tarjeta>

      {tab === 'rv' && (
        <div className="space-y-4">
          <Bloque titulo="Regiones (de la renta variable)">
            <Grupos grupos={x.regiones} />
            {x.mercados.length > 0 && <Mercados filas={x.mercados} />}
            {x.paises.length > 0 && (
              <div className="mt-5">
                <Titulo>{x.paises.length} mayores países</Titulo>
                <Lista filas={x.paises} barras columnas={3} />
              </div>
            )}
          </Bloque>
          <Bloque titulo="Sectores (de la renta variable)">
            <Grupos grupos={x.sectores} />
          </Bloque>
          <Bloque titulo="Estilo">
            <div className="grid gap-6 md:grid-cols-3">
              <Caja valores={x.estiloRv} {...CAJA_RV} fila="Tamaño" col="Estilo" />
              <Lista titulo="Capitalización" filas={x.capitalizacion} barras />
              <Cifras titulo="Estadísticas" cifras={x.estadisticasRv} />
            </div>
          </Bloque>
          <Posiciones titulo="10 mayores acciones" filas={x.acciones} incompletas={x.incompletas} />
        </div>
      )}

      {tab === 'rf' && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Bloque titulo="Estilo de renta fija"><Caja valores={x.estiloRf} {...CAJA_RF} /></Bloque>
            <Bloque titulo="Cifras medias"><Cifras titulo="De los bonos" cifras={x.estadisticasRf} /></Bloque>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Bloque titulo="Calidad crediticia"><Lista titulo="De los bonos" filas={x.calidad} barras /></Bloque>
            <Bloque titulo="Renta fija por sector"><Lista filas={x.sectoresRf} barras /></Bloque>
          </div>
          <Posiciones titulo="10 mayores bonos y otras posiciones" filas={x.otras} incompletas={x.incompletas} />
        </div>
      )}
    </div>
  )
}

function haceMeses(n: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - n)
  return d.toISOString().slice(0, 10)
}

export const Titulo = ({ children }: { children: React.ReactNode }) => (
  <h3 className="mb-1.5 text-[12px] text-suave">{children}</h3>
)

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return <Tarjeta titulo={titulo}>{children}</Tarjeta>
}

/** Grupos (regiones o sectores) en columnas: el total del grupo y sus partes. */
function Grupos({ grupos }: { grupos: Grupo[] }) {
  return (
    <div className="grid gap-6 md:grid-cols-3">
      {grupos.map((g) => (
        <div key={g.nombre}>
          <p className="mb-1.5 flex justify-between border-b border-borde pb-1">
            <span>{g.nombre}</span>
            <b className="tabular font-normal text-acento">{pct(g.pct / 100, 1, false)}</b>
          </p>
          <Lista filas={g.filas} barras />
        </div>
      ))}
    </div>
  )
}

/** Lista de nombre y %, con barra proporcional si se pide. */
function Lista({ titulo, filas, barras, columnas }: { titulo?: string; filas: Fila[]; barras?: boolean; columnas?: number }) {
  const max = Math.max(...filas.map(([, v]) => Math.abs(v)), 1)
  return (
    <div>
      {titulo && <Titulo>{titulo}</Titulo>}
      {!filas.length ? (
        <p className="text-suave">—</p>
      ) : (
        <ul className={columnas ? 'grid gap-x-6 gap-y-1 md:grid-flow-col' : 'space-y-1'}
          style={columnas ? { gridTemplateRows: `repeat(${Math.ceil(filas.length / columnas)}, auto)` } : undefined}>
          {filas.map(([nombre, v]) => (
            <li key={nombre} className={`grid items-center gap-2 ${barras ? 'grid-cols-[minmax(0,10rem)_1fr_4rem]' : 'grid-cols-[1fr_4rem]'}`}>
              <span className="truncate">{nombre}</span>
              {barras && (
                <span className="h-1.5 rounded-sm bg-borde/60" aria-hidden="true">
                  <span className={`block h-1.5 rounded-sm ${v < 0 ? 'bg-baja' : 'bg-acento'}`} style={{ width: `${(Math.abs(v) / max) * 100}%` }} />
                </span>
              )}
              <span className="text-right tabular">{pct(v / 100, 1, false)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Caja de estilo 3×3 como la de Morningstar: casillas 1–9 por filas, más intensas cuanto más pesan. */
function Caja({ valores, filas, cols, fila, col }: { valores: Record<string, number>; filas: string[]; cols: string[]; fila: string; col: string }) {
  if (!Object.keys(valores).length) return <p className="text-suave">—</p>
  const celdas = filas.flatMap((f, i) => cols.map((c, j) => ({ f, c, v: valores[String(i * 3 + j + 1)] ?? 0 })))
  return (
    <figure>
      <div
        className="grid max-w-sm grid-cols-[auto_repeat(3,minmax(3rem,1fr))] gap-1 text-center"
        role="img"
        aria-label={`${fila} × ${col}: ${celdas.filter((x) => x.v >= 0.5).map((x) => `${x.f} · ${x.c} ${pct(x.v / 100, 0, false)}`).join(', ')}`}
      >
        <span />
        {cols.map((c) => <span key={`col-${c}`} className="pb-1 text-suave">{c}</span>)}
        {filas.map((f, i) => [
          <span key={`fila-${f}`} className="pr-2 text-left text-suave">{f}</span>,
          ...cols.map((c, j) => {
            const v = valores[String(i * 3 + j + 1)] ?? 0
            return (
              <span key={`${f}-${c}`} className="rounded-sm py-3 tabular" style={{ background: `color-mix(in srgb, var(--color-acento) ${Math.min(v / 50, 1) * 70}%, color-mix(in srgb, var(--color-borde) 40%, transparent))`, color: v >= 25 ? 'var(--color-fondo)' : undefined }} title={`${f} · ${c}: ${pct(v / 100, 1, false)}`}>
                {Math.round(v)}
              </span>
            )
          }),
        ])}
      </div>
      <figcaption className="mt-2 text-[12px] text-suave">Filas: {fila.toLowerCase()} · columnas: {col.toLowerCase()} · % de la parte</figcaption>
    </figure>
  )
}

/** Desarrollados frente a emergentes en una sola barra partida. */
function Mercados({ filas }: { filas: Fila[] }) {
  const total = filas.reduce((t, [, v]) => t + Math.max(v, 0), 0) || 1
  const colores = ['var(--color-serie1)', 'var(--color-serie2)', 'var(--color-gris)']
  return (
    <div className="mt-5">
      <Titulo>Mercados</Titulo>
      <div className="flex h-2 overflow-hidden rounded-sm bg-borde/60" aria-hidden="true">
        {filas.map(([n, v], i) => <span key={n} style={{ width: `${(Math.max(v, 0) / total) * 100}%`, background: colores[i % 3] }} />)}
      </div>
      <p className="mt-1.5 flex flex-wrap gap-x-5 text-[13px]">
        {filas.map(([n, v], i) => (
          <span key={n} className="flex items-center gap-1.5">
            <i aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: colores[i % 3] }} />
            {n} <span className="tabular">{pct(v / 100, 1, false)}</span>
          </span>
        ))}
      </p>
    </div>
  )
}

function Cifras({ titulo, cifras }: { titulo: string; cifras: Cifra[] }) {
  const valor = ([, v, u]: Cifra) => (v == null ? '—' : u === '%' ? pct(v / 100, 2, false) : u === 'años' ? `${cifra(v, 2)} años` : cifra(v, 1))
  return (
    <div>
      <Titulo>{titulo}</Titulo>
      <ul className="space-y-0.5">
        {cifras.map((c) => (
          <li key={c[0]} className="flex justify-between gap-4 border-b border-borde/60 py-1">
            <span>{c[0]}</span>
            <span className={`tabular ${c[1] == null ? 'text-suave' : ''}`}>{valor(c)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Posiciones({ titulo, filas, incompletas }: { titulo: string; filas: PosicionCartera[]; incompletas: string[] }) {
  if (!filas.length) return null
  return (
    <Tarjeta titulo={titulo}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] text-right tabular">
          <thead className="text-[12px] text-suave">
            <tr className="border-b border-borde">
              <th className="py-1 text-left font-normal">Nombre</th>
              <th className="text-left font-normal">Sector</th>
              <th className="text-left font-normal">País</th>
              <th className="font-normal">Cartera</th>
            </tr>
          </thead>
          <tbody>
            {filas.slice(0, 10).map((p) => (
              <tr key={p.isin || p.nombre} className="border-b border-borde/60">
                <td className="py-1.5 text-left">
                  {p.nombre}
                  {p.fondos > 1 && <span className="text-suave"> · en {p.fondos} fondos</span>}
                </td>
                <td className="text-left text-suave">{p.sector ?? '—'}</td>
                <td className="text-left text-suave">{p.pais ?? '—'}</td>
                <td>{pct(p.peso / 100, 2, false)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {incompletas.length > 0 && <p className="mt-2 text-[12px] text-suave">Morningstar solo da las mayores posiciones de: {incompletas.join(', ')}.</p>}
    </Tarjeta>
  )
}
