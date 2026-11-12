import { useState } from 'react'
import {
  CAJA_RF, CAJA_RV, exposicion,
  type Cifra, type Fila, type Fondo, type Grupo, type PosicionCartera,
} from '../calculo/exposicion'
import { cifra, fecha, pct } from '../calculo/formato'

type FondoX = Fondo & { fechaCartera: string | null }
const COLOR: Record<string, string> = { Acciones: '#4fd18b', Bonos: '#5b9bd5', Liquidez: '#7d8f86' } // el resto, ámbar

/** X-Ray de una cartera (o de uno de sus fondos): tipo de activo y, a elegir, la parte de renta variable o la de renta fija. */
export default function Exposicion({ fondos }: { fondos: FondoX[] }) {
  const [elegido, setElegido] = useState('') // '' = toda la cartera
  const [parte, setParte] = useState<'rv' | 'rf' | null>(null)
  const vistos = elegido ? fondos.filter((f) => f.nombre === elegido).map((f) => ({ ...f, peso: 100 })) : fondos
  const x = exposicion(vistos)
  const conDatos = fondos.filter((f) => f.c?.activos?.neto)

  if (!conDatos.length)
    return (
      <section>
        <h2 className="mb-2 text-[11px] uppercase tracking-widest text-suave">Exposición (X-Ray)</h2>
        <p className="text-suave">Sin composición todavía: se descarga los domingos.</p>
      </section>
    )

  const partes = ([['rv', 'Renta variable', x.rv], ['rf', 'Renta fija y liquidez', x.rf]] as const).filter(([, , v]) => v >= 5)
  const tab = partes.find(([k]) => k === parte)?.[0] ?? [...partes].sort((a, b) => b[2] - a[2])[0]?.[0]
  const antiguas = vistos.filter((f) => f.fechaCartera && f.fechaCartera < haceMeses(6))

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[11px] uppercase tracking-widest text-suave">Exposición (X-Ray)</h2>
        {conDatos.length > 1 && (
          <select
            value={elegido}
            onChange={(e) => setElegido(e.target.value)}
            aria-label="Ver la exposición de"
            className="max-w-full border border-borde bg-panel px-2 py-1 text-texto"
          >
            <option value="">Toda la cartera</option>
            {conDatos.map((f) => <option key={f.nombre} value={f.nombre}>{f.nombre}</option>)}
          </select>
        )}
      </div>

      <p className="text-suave">
        {elegido ? `Cartera de ${elegido} según Morningstar` : 'Cartera de cada fondo según Morningstar, ponderada por su peso'}
        {x.cobertura < 99.5 && <span className="text-aviso"> · solo el {pct(x.cobertura / 100, 0, false)} de la cartera tiene datos</span>}
        {x.cortos.length > 0 && <> · cifras netas: {x.cortos.join(', ')} {x.cortos.length > 1 ? 'tienen' : 'tiene'} posiciones cortas</>}
        {antiguas.length > 0 && <span className="text-aviso"> · cartera antigua: {antiguas.map((f) => `${f.nombre} (${fecha(f.fechaCartera)})`).join(', ')}</span>}
      </p>

      <Reparto filas={x.activos} />

      {partes.length > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Parte de la cartera">
          {partes.map(([k, t, v]) => (
            <button
              key={k}
              type="button"
              aria-pressed={k === tab}
              onClick={() => setParte(k)}
              className={`min-h-9 border px-3 ${k === tab ? 'border-acento text-acento' : 'border-borde text-suave hover:text-texto'}`}
            >
              {t} · {pct(v / 100, 0, false)}
            </button>
          ))}
        </div>
      )}

      {tab === 'rv' && (
        <div className="space-y-6">
          <Bloque titulo="Regiones (de la renta variable)">
            <Grupos grupos={x.regiones} />
            <div className="mt-4 grid gap-6 md:grid-cols-2">
              <Lista titulo="Mercados" filas={x.mercados} />
              <Lista titulo="10 mayores países" filas={x.paises} />
            </div>
          </Bloque>
          <Bloque titulo="Sectores (de la renta variable)">
            <Grupos grupos={x.sectores} />
          </Bloque>
          <Bloque titulo="Estilo">
            <div className="grid gap-6 md:grid-cols-2">
              <Caja valores={x.estiloRv} {...CAJA_RV} fila="Tamaño" col="Estilo" />
              <div className="space-y-4">
                <Lista titulo="Capitalización" filas={x.capitalizacion} />
                <Cifras titulo="Estadísticas" cifras={x.estadisticasRv} />
              </div>
            </div>
          </Bloque>
          <Posiciones titulo="10 mayores acciones" filas={x.acciones} incompletas={x.incompletas} />
        </div>
      )}

      {tab === 'rf' && (
        <div className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Bloque titulo="Estilo de renta fija"><Caja valores={x.estiloRf} {...CAJA_RF} /></Bloque>
            <Cifras titulo="Cifras medias (de los bonos)" cifras={x.estadisticasRf} />
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <Lista titulo="Calidad crediticia (de los bonos)" filas={x.calidad} barras />
            <Lista titulo="Renta fija por sector" filas={x.sectoresRf} barras />
          </div>
          <Posiciones titulo="10 mayores bonos y otras posiciones" filas={x.otras} incompletas={x.incompletas} />
        </div>
      )}
    </section>
  )
}

function haceMeses(n: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - n)
  return d.toISOString().slice(0, 10)
}

export const Titulo = ({ children }: { children: React.ReactNode }) => (
  <h3 className="mb-1 text-[11px] uppercase tracking-widest text-suave">{children}</h3>
)

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return <div><Titulo>{titulo}</Titulo>{children}</div>
}

/** Tipo de activo en una sola barra partida, con su leyenda. */
function Reparto({ filas }: { filas: Fila[] }) {
  const positivos = filas.filter(([, v]) => v > 0)
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden bg-panel" role="img" aria-label={`Tipo de activo: ${filas.map(([n, v]) => `${n} ${pct(v / 100, 0, false)}`).join(', ')}`}>
        {positivos.map(([n, v]) => <span key={n} style={{ width: `${v}%`, background: COLOR[n] ?? '#f2b84b' }} />)}
      </div>
      <p className="mt-1 flex flex-wrap gap-x-4 text-suave">
        {filas.map(([n, v]) => (
          <span key={n}>
            <i aria-hidden="true" className="mr-1 inline-block h-2 w-2" style={{ background: COLOR[n] ?? '#f2b84b' }} />
            {n} <b className="tabular font-normal text-texto">{pct(v / 100, 1, false)}</b>
          </span>
        ))}
      </p>
    </div>
  )
}

/** Grupos (regiones o sectores) en columnas: el total del grupo y sus partes. */
function Grupos({ grupos }: { grupos: Grupo[] }) {
  return (
    <div className="grid gap-6 md:grid-cols-3">
      {grupos.map((g) => (
        <div key={g.nombre}>
          <p className="flex justify-between border-b border-borde pb-0.5">
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
function Lista({ titulo, filas, barras }: { titulo?: string; filas: Fila[]; barras?: boolean }) {
  const max = Math.max(...filas.map(([, v]) => Math.abs(v)), 1)
  return (
    <div>
      {titulo && <Titulo>{titulo}</Titulo>}
      {!filas.length ? (
        <p className="text-suave">—</p>
      ) : (
        <ul className="space-y-0.5">
          {filas.map(([nombre, v]) => (
            <li key={nombre} className={`grid items-center gap-2 ${barras ? 'grid-cols-[minmax(0,10rem)_1fr_4rem]' : 'grid-cols-[1fr_4rem]'}`}>
              <span className="truncate">{nombre}</span>
              {barras && (
                <span className="h-2 bg-panel" aria-hidden="true">
                  <span className={`block h-2 ${v < 0 ? 'bg-baja' : 'bg-acento'}`} style={{ width: `${(Math.abs(v) / max) * 100}%` }} />
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
        className="grid grid-cols-[auto_repeat(3,minmax(0,4rem))] gap-px text-center"
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
              <span key={`${f}-${c}`} className="py-3 tabular" style={{ background: `rgba(79, 209, 139, ${Math.min(v / 50, 1) * 0.7})`, color: v >= 25 ? '#0b0e0d' : undefined }} title={`${f} · ${c}: ${pct(v / 100, 1, false)}`}>
                {Math.round(v)}
              </span>
            )
          }),
        ])}
      </div>
      <figcaption className="mt-1 text-suave">Filas: {fila.toLowerCase()} · columnas: {col.toLowerCase()} · % de la parte</figcaption>
    </figure>
  )
}

function Cifras({ titulo, cifras }: { titulo: string; cifras: Cifra[] }) {
  const valor = ([, v, u]: Cifra) => (v == null ? '—' : u === '%' ? pct(v / 100, 2, false) : u === 'años' ? `${cifra(v, 2)} años` : cifra(v, 1))
  return (
    <div>
      <Titulo>{titulo}</Titulo>
      <ul className="space-y-0.5">
        {cifras.map((c) => (
          <li key={c[0]} className="flex justify-between gap-4 border-b border-borde/50">
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
    <div>
      <Titulo>{titulo}</Titulo>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] text-right tabular">
          <thead className="text-[11px] uppercase tracking-widest text-suave">
            <tr className="border-b border-borde">
              <th className="py-1 text-left font-normal">Nombre</th>
              <th className="text-left font-normal">Sector</th>
              <th className="text-left font-normal">País</th>
              <th className="font-normal">Cartera</th>
            </tr>
          </thead>
          <tbody>
            {filas.slice(0, 10).map((p) => (
              <tr key={p.isin || p.nombre} className="border-b border-borde/50">
                <td className="py-1 text-left">
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
      {incompletas.length > 0 && <p className="mt-2 text-suave">Morningstar solo da las mayores posiciones de: {incompletas.join(', ')}.</p>}
    </div>
  )
}
