import { useState } from 'react'
import {
  aportaciones, CAJA_RF, CAJA_RV, exposicion, solapamiento,
  type Cifra, type Fila, type Fondo, type PosicionCartera, type Vista,
} from '../calculo/exposicion'
import { cifra, fecha, pct } from '../calculo/formato'
import Arbol, { type Rama } from './Arbol'
import { COLOR_ACTIVO } from './Reparto'
import Tarjeta from './Tarjeta'

type FondoX = Fondo & { fechaCartera: string | null }

const p1 = (v: number, dec = 1) => pct(v / 100, dec, false)
/** Escala de un solo tono (dataviz: lo ordenado, de más a menos, en un color): acento mezclado con el panel. */
const tono = (fuerza: number) => `color-mix(in srgb, var(--color-acento) ${Math.round(fuerza)}%, var(--color-panel))`

/** X-Ray de una cartera (o de uno de sus fondos): radiografía arriba y, a elegir, la parte de renta variable o la de renta fija. */
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
  // Lo esencial: lo que más pesa de cada desglose (el detalle, en los bloques de abajo).
  const mayor = (filas: Fila[]) => filas.reduce<Fila | null>((m, f) => (!m || f[1] > m[1] ? f : m), null)
  const deLa = (f: Fila | null, parte: string): [string, string] | null => f && [f[0], `${p1(f[1], 0)} ${parte}`]
  const casilla = Object.entries(x.estiloRv).reduce<[string, number] | null>((m, e) => (!m || e[1] > m[1] ? e : m), null)
  const top10 = [...x.acciones, ...x.otras].sort((a, b) => b.peso - a.peso).slice(0, 10).reduce((t, p) => t + p.peso, 0)
  const ultimaCartera = vistos.map((f) => f.fechaCartera).filter(Boolean).sort().at(-1)
  const emergentes = x.mercados.find(([n]) => n === 'Emergentes')
  const duracion = x.estadisticasRf.find(([n]) => n === 'Duración efectiva')
  const esencial = ([
    ...(x.rv >= 5 ? [
      ['Región principal', deLa(mayor(x.regiones.flatMap((g) => g.filas)), 'de la RV')],
      ['Sector principal', deLa(mayor(x.sectores.flatMap((g) => g.filas)), 'de la RV')],
      ['Emergentes', emergentes && [p1(emergentes[1], 0), 'de la RV']],
      ['Estilo dominante', casilla && [`${CAJA_RV.filas[Math.floor((+casilla[0] - 1) / 3)]} · ${CAJA_RV.cols[(+casilla[0] - 1) % 3].replace('Crecim.', 'Crecimiento')}`, `${Math.round(casilla[1])} %`]],
    ] : []),
    ...(x.rf >= 5 ? [
      ['Calidad principal', deLa(mayor(x.calidad), 'de los bonos')],
      ['Sector de los bonos', deLa(mayor(x.sectoresRf), 'de los bonos')],
      ['Duración efectiva', duracion?.[1] != null && [`${cifra(duracion[1], 1)} años`, '']],
    ] : []),
    ['10 mayores posiciones', top10 > 0 && [p1(top10, 0), 'de la cartera']],
    ['Cartera del', ultimaCartera && [fecha(ultimaCartera), '']],
  ] as [string, [string, string] | false | null | undefined][]).filter((e): e is [string, [string, string]] => !!e[1])

  return (
    <div className="space-y-4">
      <Tarjeta titulo="Exposición" extra={conDatos.length > 1 && (
        <select value={elegido} onChange={(e) => setElegido(e.target.value)} aria-label="Ver la exposición de"
          className="max-w-full rounded-sm border border-borde bg-panel px-3 py-1 text-texto">
          <option value="">Toda la cartera</option>
          {conDatos.map((f) => <option key={f.nombre} value={f.nombre}>{f.nombre}</option>)}
        </select>
      )}>
        <Barra grande etiqueta="Tipo de activo" filas={x.activos.map(([n, v]) => ({ n, v, color: COLOR_ACTIVO[n] ?? 'var(--color-serie5)' }))} />
        <dl className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-x-6 gap-y-4">
          {esencial.map(([k, [v, de]]) => (
            <div key={k} className="min-w-0 border-t border-borde pt-2">
              <dt className="rotulo">{k}</dt>
              <dd className="mt-1 truncate text-[15px] font-medium" title={`${v} ${de}`}>{v} <span className="text-[13px] font-normal text-suave">{de}</span></dd>
            </div>
          ))}
        </dl>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-borde pt-4">
          {partes.length > 1 && (
            <div role="group" aria-label="Parte de la cartera" className="flex flex-wrap gap-0.5 rounded-sm border border-borde bg-fondo p-0.5 text-[13px]">
              {partes.map(([k, t, v]) => (
                <button key={k} type="button" aria-pressed={k === tab} onClick={() => setParte(k)}
                  className={`rounded-xs px-3 py-1.5 ${k === tab ? 'bg-acento font-medium text-sobre-acento' : 'text-suave hover:text-texto'}`}>
                  {t} · <span className="tabular">{p1(v, 0)}</span>
                </button>
              ))}
            </div>
          )}
          <p className="text-[12px] text-suave">
            {elegido ? `Cartera de ${elegido} según Morningstar` : 'Cartera de cada fondo según Morningstar, ponderada por su peso'}
            {x.cobertura < 99.5 && <span className="text-aviso"> · solo el {p1(x.cobertura, 0)} de la cartera tiene datos</span>}
            {x.cortos.length > 0 && <> · cifras netas: {x.cortos.join(', ')} {x.cortos.length > 1 ? 'tienen' : 'tiene'} posiciones cortas</>}
            {antiguas.length > 0 && <span className="text-aviso"> · cartera antigua: {antiguas.map((f) => `${f.nombre} (${fecha(f.fechaCartera)})`).join(', ')}</span>}
          </p>
        </div>
      </Tarjeta>

      {tab === 'rv' && (
        <div className="space-y-4">
          <Tarjeta titulo="Regiones de la renta variable" extra={<Leyenda filas={x.regiones.map((g, i) => [g.nombre, g.pct, `var(--color-${SERIE_REGION[i]})`])} />}>
            <Arbol etiqueta={`Regiones: ${x.regiones.flatMap((g) => g.filas).map(([n, v]) => `${n} ${p1(v)}`).join(', ')}`}
              ramas={x.regiones.map((g, i): Rama => ({ nombre: g.nombre, hojas: g.filas.map(([n, v]) => ({ nombre: n, valor: v, color: SERIE_REGION[i], fuerza: 0.5 })) }))} />
            <div className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
              {x.mercados.length > 0 && (
                <div>
                  <h3 className="rotulo mb-2">Mercados</h3>
                  <Barra etiqueta="Mercados" filas={x.mercados.map(([n, v], i) => ({ n, v, color: ['var(--color-serie1)', 'var(--color-serie2)'][i] ?? 'var(--color-gris)' }))} />
                </div>
              )}
              {x.paises.length > 0 && (
                <div>
                  <h3 className="rotulo mb-2">{x.paises.length} mayores países</h3>
                  <p className="tabular flex flex-wrap gap-x-4 gap-y-1 text-suave">
                    {x.paises.map(([n, v]) => <span key={n} className="whitespace-nowrap"><span className="text-texto">{n}</span> {p1(v)}</span>)}
                  </p>
                </div>
              )}
            </div>
          </Tarjeta>
          <Tarjeta titulo="Sectores de la renta variable"><Perfil grupos={x.sectores} /></Tarjeta>
          <Tarjeta titulo="Estilo">
            <div className="grid grid-cols-[minmax(0,1fr)] gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)]">
              <Caja valores={x.estiloRv} {...CAJA_RV} fila="Tamaño" col="Estilo" />
              <div>
                <h3 className="rotulo mb-2">Capitalización</h3>
                <Barra etiqueta="Capitalización" filas={x.capitalizacion.map(([n, v], i) => ({ n, v, color: tono(90 - i * 18) }))} />
              </div>
              <Cifras titulo="Estadísticas" cifras={x.estadisticasRv} />
            </div>
          </Tarjeta>
          <Posiciones titulo="Mayores acciones" filas={x.acciones} incompletas={x.incompletas} />
        </div>
      )}

      {tab === 'rf' && (
        <div className="space-y-4">
          <Tarjeta titulo="Calidad crediticia de los bonos" extra={<span className="text-[12px] text-suave">de más a menos calidad</span>}>
            <Barra grande etiqueta="Calidad crediticia" filas={ordenCalidad(x.calidad).map(([n, v], i) => ({ n, v, color: n === 'Sin calificación' ? 'var(--color-borde)' : tono(90 - i * 13) }))} />
            <h2 className="mt-6 mb-3 border-t border-borde pt-4 text-[15px] font-semibold tracking-tight">Renta fija por sector</h2>
            <Barra etiqueta="Renta fija por sector" filas={x.sectoresRf.map(([n, v]) => ({ n, v, color: COLOR_SECTOR_RF[n] ?? 'var(--color-serie4)' }))} />
          </Tarjeta>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
            <Tarjeta titulo="Estilo de renta fija"><Caja valores={x.estiloRf} {...CAJA_RF} /></Tarjeta>
            <Tarjeta titulo="Cifras medias de los bonos"><Cifras titulo="" cifras={x.estadisticasRf} grande /></Tarjeta>
          </div>
          <Posiciones titulo="Mayores bonos y otras posiciones" filas={x.otras} incompletas={x.incompletas} />
        </div>
      )}

      {conDatos.length > 1 && (
        <>
          <Aportes fondos={fondos} elegido={elegido} elegir={(n) => setElegido(n === elegido ? '' : n)} rv={x.rv >= 5 || !!elegido} />
          <MatrizSolapes fondos={conDatos} />
        </>
      )}
    </div>
  )
}

const SERIE_REGION = ['serie1', 'serie2', 'serie3'] // tokens: América, Europa…, Asia
const COLOR_SECTOR_RF: Record<string, string> = { Corporativo: 'var(--color-serie1)', Gubernamental: 'var(--color-serie2)', Titulizado: 'var(--color-serie3)', Liquidez: 'var(--color-gris)' }
const ORDEN_CALIDAD = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'Inferior a B', 'Sin calificación']
const ordenCalidad = (filas: Fila[]) => [...filas].sort((a, b) => ORDEN_CALIDAD.indexOf(a[0]) - ORDEN_CALIDAD.indexOf(b[0]))

function haceMeses(n: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - n)
  return d.toISOString().slice(0, 10)
}

export const Titulo = ({ children }: { children: React.ReactNode }) => (
  <h3 className="mb-1.5 text-[12px] text-suave">{children}</h3>
)

function Leyenda({ filas }: { filas: [string, number, string][] }) {
  return (
    <p className="tabular flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-suave">
      {filas.filter(([, v]) => v > 0).map(([n, v, c]) => (
        <span key={n} className="flex items-center gap-1.5">
          <i aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-xs" style={{ background: c }} />
          <span className="text-texto">{n}</span> {p1(v)}
        </span>
      ))}
    </p>
  )
}

/**
 * Barra partida (un total en partes, de un vistazo). Nombre y cifra encima de cada tramo que tiene sitio; los estrechos,
 * en la leyenda de debajo. Lo negativo (posiciones cortas netas) no cabe en una barra: va aparte, marcado.
 */
function Barra({ filas, etiqueta, grande }: { filas: { n: string; v: number; color: string }[]; etiqueta: string; grande?: boolean }) {
  const pos = filas.filter((f) => f.v >= 0.05)
  const neg = filas.filter((f) => f.v <= -0.05)
  const total = pos.reduce((t, f) => t + f.v, 0)
  if (!total) return <p className="text-suave">—</p>
  const ancho = (v: number) => v / total >= (grande ? 0.09 : 0.12)
  const estrechos = pos.filter((f) => !ancho(f.v))
  return (
    <div className="flex items-end gap-3">
      <div className="min-w-0 flex-1" role="img" aria-label={`${etiqueta}: ${filas.map((f) => `${f.n} ${p1(f.v)}`).join(', ')}`}>
        <div className="flex gap-0.5" aria-hidden="true">
          {pos.map((f) => (
            <div key={f.n} className="min-w-0 overflow-hidden whitespace-nowrap pb-1" style={{ flex: `${f.v} 1 0` }}>
              {ancho(f.v) && <>
                <span className="block truncate text-[13px] text-suave">{f.n}</span>
                <span className={`tabular block ${grande ? 'cifra text-[22px] leading-tight' : 'text-[14px]'}`}>{p1(f.v)}</span>
              </>}
            </div>
          ))}
        </div>
        <div className={`flex gap-0.5 ${grande ? 'h-4' : 'h-2.5'}`} aria-hidden="true">
          {pos.map((f) => <span key={f.n} className="min-w-0.5 rounded-xs" style={{ flex: `${f.v} 1 0`, background: f.color }} />)}
        </div>
        {estrechos.length > 0 && (
          <p className="tabular mt-1.5 flex flex-wrap gap-x-4 text-[13px] text-suave" aria-hidden="true">
            {estrechos.map((f) => (
              <span key={f.n} className="flex items-center gap-1.5">
                <i className="inline-block h-2.5 w-2.5 rounded-xs" style={{ background: f.color }} /><span className="text-texto">{f.n}</span> {p1(f.v)}
              </span>
            ))}
          </p>
        )}
      </div>
      {neg.map((f) => (
        <div key={f.n} className="shrink-0 rounded-xs border border-dashed border-baja px-3 py-1.5 text-[13px]" title="Posición corta neta">
          <span className="block">{f.n}</span><span className="tabular text-baja">{p1(f.v)} neto corto</span>
        </div>
      ))}
    </div>
  )
}

/** Sectores como un perfil: una columna por sector, agrupadas en cíclico, sensible y defensivo; el mayor, en acento. */
function Perfil({ grupos }: { grupos: { nombre: string; pct: number; filas: Fila[] }[] }) {
  const max = Math.max(...grupos.flatMap((g) => g.filas.map(([, v]) => v)), 1)
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[40rem] grid-cols-[4fr_4fr_3fr] gap-6">
        {grupos.map((g) => (
          <figure key={g.nombre} className="min-w-0" role="img" aria-label={`${g.nombre} ${p1(g.pct)}: ${g.filas.map(([n, v]) => `${n} ${p1(v)}`).join(', ')}`}>
            <figcaption className="mb-2 flex justify-between border-b border-borde pb-1.5"><span>{g.nombre}</span><span className="tabular text-acento">{p1(g.pct)}</span></figcaption>
            <div className="flex h-44 items-end gap-2" aria-hidden="true">
              {g.filas.map(([n, v]) => (
                <div key={n} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-1">
                  <span className="tabular text-center text-[13px]">{p1(v)}</span>
                  <span className="rounded-xs" style={{ height: `${(Math.max(v, 0) / max) * 80}%`, background: v === max ? 'var(--color-acento)' : tono(45) }} />
                </div>
              ))}
            </div>
            <div className="mt-1.5 flex gap-2" aria-hidden="true">
              {g.filas.map(([n]) => <span key={n} className="min-w-0 flex-1 text-center text-[12px] leading-tight text-suave">{n}</span>)}
            </div>
          </figure>
        ))}
      </div>
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
        aria-label={`${fila} × ${col}: ${celdas.filter((x) => x.v >= 0.5).map((x) => `${x.f} · ${x.c} ${p1(x.v, 0)}`).join(', ')}`}
      >
        <span />
        {cols.map((c) => <span key={`col-${c}`} className="pb-1 text-suave">{c}</span>)}
        {filas.map((f, i) => [
          <span key={`fila-${f}`} className="pr-2 text-left text-suave">{f}</span>,
          ...cols.map((c, j) => {
            const v = valores[String(i * 3 + j + 1)] ?? 0
            return (
              <span key={`${f}-${c}`} className="rounded-xs py-3 tabular" style={{ background: `color-mix(in srgb, var(--color-acento) ${Math.min(v / 50, 1) * 70}%, color-mix(in srgb, var(--color-borde) 40%, transparent))`, color: v >= 36 ? 'var(--color-sobre-acento)' : undefined }} title={`${f} · ${c}: ${p1(v)}`}>
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

function Cifras({ titulo, cifras, grande }: { titulo: string; cifras: Cifra[]; grande?: boolean }) {
  const valor = ([, v, u]: Cifra) => (v == null ? '—' : u === '%' ? p1(v, 2) : u === 'años' ? `${cifra(v, 2)} años` : cifra(v, 1))
  if (grande)
    return (
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
        {cifras.map((c) => (
          <div key={c[0]} className="border-t border-borde pt-2">
            <dt className="rotulo">{c[0]}</dt>
            <dd className={`cifra tabular mt-1 text-[20px] ${c[1] == null ? 'text-suave' : ''}`}>{valor(c)}</dd>
          </div>
        ))}
      </dl>
    )
  return (
    <div>
      {titulo && <h3 className="rotulo mb-2">{titulo}</h3>}
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

/** Mapa de árbol de las mayores posiciones (las que están en más de un fondo, en ocre) y la tabla con las cifras exactas. */
function Posiciones({ titulo, filas, incompletas }: { titulo: string; filas: PosicionCartera[]; incompletas: string[] }) {
  if (!filas.length) return null
  const arbol = filas.slice(0, 12)
  const max = arbol[0].peso || 1
  const suma = arbol.reduce((t, p) => t + p.peso, 0)
  return (
    <Tarjeta titulo={titulo} extra={<span className="text-[12px] text-suave">las {arbol.length} mayores suman el <span className="tabular text-texto">{p1(suma)}</span> de la cartera · el área es su peso</span>}>
      <Arbol alto="h-56" etiqueta={`${titulo}: ${arbol.map((p) => `${p.nombre} ${p1(p.peso, 2)}`).join(', ')}`}
        ramas={[{ nombre: titulo, hojas: arbol.map((p) => p.fondos > 1
          ? { nombre: p.nombre, valor: p.peso, color: 'serie2', fuerza: 0.5, nota: `en ${p.fondos} fondos` }
          : { nombre: p.nombre, valor: p.peso, color: 'acento', fuerza: 0.22 + (p.peso / max) * 0.28 }) }]} />
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[32rem] text-right tabular">
          <thead>
            <tr className="border-b border-borde">
              <th className="rotulo py-1.5 text-left font-normal">Nombre</th>
              <th className="rotulo text-left font-normal">Sector</th>
              <th className="rotulo text-left font-normal">País</th>
              <th className="rotulo font-normal">Cartera</th>
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
                <td>{p1(p.peso, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {incompletas.length > 0 && <p className="mt-2 text-[12px] text-suave">Morningstar solo da las mayores posiciones de: {incompletas.join(', ')}.</p>}
    </Tarjeta>
  )
}

const VISTAS: [Vista, string][] = [['regiones', 'Regiones'], ['sectores', 'Sectores'], ['calidad', 'Calidad de los bonos']]

/** Cartera: quién aporta qué. Mapa de calor fondo × región, sector o calidad; pulsar un fondo lo elige arriba y resalta su fila. */
function Aportes({ fondos, elegido, elegir, rv }: { fondos: Fondo[]; elegido: string; elegir: (n: string) => void; rv: boolean }) {
  const [vista, setVista] = useState<Vista | null>(null)
  const datos = VISTAS.map(([k, t]) => [k, t, aportaciones(fondos, k)] as const).filter(([, , a]) => a.cols.length > 0)
  if (!datos.length) return null
  const [v, , a] = datos.find(([k]) => k === vista) ?? datos.find(([k]) => k === (rv ? 'sectores' : 'calidad')) ?? datos[0]
  const max = Math.max(...a.filas.flatMap((r) => r.valores ?? []), 1)
  const rejilla = { gridTemplateColumns: `minmax(12rem,16rem) repeat(${a.cols.length}, minmax(3.25rem,1fr))` }
  return (
    <Tarjeta titulo="Quién aporta qué" extra={
      <div role="group" aria-label="Desglose" className="flex flex-wrap gap-0.5 rounded-sm border border-borde bg-fondo p-0.5 text-[13px]">
        {datos.map(([k, t]) => (
          <button key={k} type="button" aria-pressed={k === v} onClick={() => setVista(k)}
            className={`rounded-xs px-3 py-1.5 ${k === v ? 'bg-acento font-medium text-sobre-acento' : 'text-suave hover:text-texto'}`}>{t}</button>
        ))}
      </div>
    }>
      <p className="-mt-1 mb-3 text-[13px] text-suave">
        Puntos de {v === 'calidad' ? 'los bonos' : 'la renta variable'} de la cartera que pone cada fondo · la fila «Cartera» es la suma · pulsa un fondo para verlo solo
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] text-[13px]">
          <thead>
            <tr className="mb-[3px] grid gap-[3px]" style={rejilla}>
              <th className="rotulo sticky left-0 self-end bg-panel text-left font-normal">Fondo · peso</th>
              {a.cols.map((c) => <th key={c} className="hyphens-auto self-end px-1 text-center text-[12px] font-normal leading-tight text-suave">{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {a.filas.map((r) => {
              const on = elegido === r.nombre
              return (
                <tr key={r.nombre} className={`mb-[3px] grid min-h-12 gap-[3px] ${elegido && !on ? 'opacity-40' : ''}`} style={rejilla}>
                  <th scope="row" className={`sticky left-0 bg-panel text-left font-normal ${on ? 'ring-1 ring-acento' : ''}`}>
                    <button type="button" onClick={() => elegir(r.nombre)} aria-pressed={on} className="block w-full px-1 py-1.5 text-left">
                      <span className="block truncate font-medium" title={r.nombre}>{r.nombre}</span>
                      <span className="tabular text-[12px] text-suave">{p1(r.peso, 0)}</span>
                    </button>
                  </th>
                  {r.valores ? r.valores.map((x, i) => (
                    <td key={a.cols[i]} title={`${r.nombre} · ${a.cols[i]}: ${cifra(x, 1)} puntos`}
                      className={`tabular flex items-center justify-center rounded-xs ${x < 0 ? 'border border-dashed border-baja text-baja' : Math.abs(x) < 0.05 ? 'text-gris' : ''}`}
                      style={x > 0 ? { background: tono(Math.min(x / max, 1) * 50) } : undefined}>
                      {Math.abs(x) < 0.05 ? '·' : cifra(x, 1)}
                    </td>
                  )) : (
                    <td className="flex items-center rounded-xs border border-dashed border-borde px-3 text-gris" style={{ gridColumn: `2 / span ${a.cols.length}` }}>{r.sin}</td>
                  )}
                </tr>
              )
            })}
            <tr className="grid gap-[3px] border-t border-borde" style={rejilla}>
              <th scope="row" className="sticky left-0 bg-panel px-1 py-1.5 text-left font-semibold">Cartera</th>
              {a.total.map((x, i) => <td key={a.cols[i]} className="tabular py-1.5 text-center font-semibold text-acento">{cifra(x, 1)}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
      {a.filas.some((r) => r.valores?.some((x) => x < 0)) && <p className="mt-2 text-[12px] text-suave">Las cifras son netas: lo marcado en rojo es una posición corta.</p>}
    </Tarjeta>
  )
}

/** Cartera: cuánto comparten dos fondos (suma del menor de los dos pesos en cada posición común), en una matriz triangular. */
function MatrizSolapes({ fondos }: { fondos: { nombre: string; c: FondoX['c'] }[] }) {
  const s = solapamiento(fondos)
  const nombres = fondos.filter((f) => f.c?.posiciones?.length).map((f) => f.nombre)
  if (nombres.length < 2) return null
  const de = (a: string, b: string) => s.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a))
  const mayor = s[0]
  const corto = (n: string) => n.split(' ').slice(0, 3).join(' ')
  return (
    <Tarjeta titulo="Posiciones en común">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-max border-separate border-spacing-[3px] text-[13px]">
            <thead>
              <tr>
                <th />
                {nombres.slice(0, -1).map((n) => <th key={n} className="max-w-28 px-1 text-center text-[12px] font-normal leading-tight text-suave" title={n}>{corto(n)}</th>)}
              </tr>
            </thead>
            <tbody>
              {nombres.slice(1).map((fila, i) => (
                <tr key={fila}>
                  <th scope="row" className="max-w-40 truncate pr-2 text-left font-normal" title={fila}>{corto(fila)}</th>
                  {nombres.slice(0, -1).map((col, j) => {
                    if (j > i) return <td key={col} />
                    const x = de(fila, col)
                    const v = x?.pct ?? 0
                    return (
                      <td key={col} className={`tabular rounded-xs px-2 py-3 text-center ${v >= 0.05 ? '' : 'text-gris'}`}
                        style={{ background: v >= 0.05 ? tono(Math.min(15 + v * 1.5, 60)) : 'color-mix(in srgb, var(--color-borde) 40%, transparent)' }}
                        title={x?.comunes.length ? `En común: ${x.comunes.join(', ')}` : undefined}>
                        {x && !x.completo ? '≥ ' : ''}{v >= 0.05 ? p1(v) : '0'}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-borde pt-3">
          <h3 className="rotulo">El mayor solape</h3>
          {mayor && mayor.pct >= 0.05 ? <>
            <p className="mt-1"><span className="cifra tabular text-[22px]">{p1(mayor.pct)}</span> <span className="text-suave">{corto(mayor.a)} y {corto(mayor.b)}</span></p>
            {mayor.comunes.length > 0 && <p className="mt-1 text-suave">Comparten sobre todo {mayor.comunes.join(', ')}.</p>}
          </> : <p className="mt-1 text-suave">Los fondos no comparten posiciones.</p>}
          {s.some((x) => !x.completo) && <p className="mt-2 text-[12px] text-aviso">≥: algún fondo solo publica sus mayores posiciones; el solape es «al menos».</p>}
          <p className="mt-2 text-[12px] text-suave">Suma del menor de los dos pesos en cada posición común: 100 es la misma cartera.</p>
        </div>
      </div>
    </Tarjeta>
  )
}
