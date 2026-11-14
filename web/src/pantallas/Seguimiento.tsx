import { Fragment, useEffect, useState } from 'react'
import { cifra, fecha } from '../calculo/formato'
import { evolucion, type NotaSemanal } from '../calculo/senales'
import * as q from '../datos/consultas'

type Fila = Awaited<ReturnType<typeof q.seguidos>>[number]
type Vista = 'activos' | 'candidato' | 'descartado'
const control = 'border border-borde bg-panel px-1 py-1 text-texto outline-none focus:border-acento'

const cambio = (v: number | null) =>
  v == null ? <span className="text-suave">—</span> : <span className={v >= 0.5 ? 'text-sube' : v <= -0.5 ? 'text-baja' : 'text-suave'}>{v > 0 ? '+' : ''}{Math.round(v)}</span>

/** Seguimiento: fondos vigilados con su estado, la nota semanal y su cambio, y si se pueden comprar en MyInvestor. */
export default function Seguimiento() {
  const [filas, setFilas] = useState<Fila[] | null>(null)
  const [notas, setNotas] = useState<Map<string, NotaSemanal[]>>(new Map())
  const [vista, setVista] = useState<Vista>('activos')
  const [error, setError] = useState('')
  const falla = (e: Error) => setError(e.message)

  useEffect(() => {
    q.seguidos().then(async (f) => {
      setFilas(f)
      const m = new Map<string, NotaSemanal[]>()
      for (const n of await q.notasDe(f.map((x) => x.isin))) m.set(n.isin, [...(m.get(n.isin) ?? []), n])
      setNotas(m)
    }).catch(falla)
  }, [])

  const cambiar = (isin: string, c: Partial<Pick<Fila, 'estado' | 'nota'>>) => {
    setFilas((fs) => fs!.map((f) => (f.isin === isin ? { ...f, ...c } : f)))
    q.cambiarSeguimiento(isin, c).catch(falla)
  }
  const quitar = (isin: string) => {
    if (!confirm('¿Dejar de seguir este fondo? Se borra también tu nota.')) return
    setFilas((fs) => fs!.filter((f) => f.isin !== isin))
    q.dejarDeSeguir(isin).catch(falla)
  }

  if (!filas) return <p className="text-suave">{error || 'Cargando…'}</p>
  const cuenta = (v: Vista) => filas.filter((f) => (v === 'activos' ? f.estado !== 'descartado' : f.estado === v)).length
  const categoria = (f: Fila) => f.fondo.categoria ?? 'Sin categoría'
  const visibles = filas.filter((f) => (vista === 'activos' ? f.estado !== 'descartado' : f.estado === vista))
    .sort((a, b) => (a.fondo.categoria == null ? 1 : 0) - (b.fondo.categoria == null ? 1 : 0) || categoria(a).localeCompare(categoria(b), 'es'))
  const porCategoria = (c: string) => visibles.filter((f) => categoria(f) === c).length
  const ultimaFecha = [...notas.values()].flat().reduce((m, n) => (n.fecha > m ? n.fecha : m), '')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-acento">Seguimiento</h1>
          <p className="text-suave">
            {cuenta('activos')} fondos · {cuenta('candidato')} candidatos
            {ultimaFecha && ` · nota de la semana del ${fecha(ultimaFecha)} y su cambio`}
          </p>
        </div>
        <div role="group" aria-label="Estado" className="flex border border-borde">
          {([['activos', 'activos'], ['candidato', 'candidatos'], ['descartado', 'descartados']] as [Vista, string][]).map(([v, t]) => (
            <button key={v} aria-pressed={vista === v} onClick={() => setVista(v)}
              className={`min-h-8 px-3 ${vista === v ? 'bg-panel text-acento' : 'text-suave hover:text-texto'} [&+&]:border-l [&+&]:border-borde`}>{t} {cuenta(v)}</button>
          ))}
        </div>
      </div>
      {error && <p className="text-baja">{error}</p>}
      {visibles.length === 0 ? (
        <p className="text-suave">Nada aquí. Se añaden fondos desde el screener (+).</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] text-right [&_tr>*+*]:pl-3">
            <thead className="text-[11px] uppercase tracking-widest text-suave">
              <tr className="border-b border-borde">
                <th className="py-1 text-left font-normal">Fondo</th>
                <th className="text-left font-normal">Estado</th>
                <th className="font-normal">Nota</th>
                <th className="font-normal">Semana</th>
                <th className="font-normal">12 meses</th>
                <th className="font-normal">TER</th>
                <th className="text-left font-normal">MyInvestor</th>
                <th className="text-left font-normal">Mi nota</th>
                <th><span className="sr-only">Quitar</span></th>
              </tr>
            </thead>
            <tbody className="tabular">
              {visibles.map((f, i) => {
                const e = evolucion(notas.get(f.isin) ?? [])
                const nueva = i === 0 || categoria(visibles[i - 1]) !== categoria(f)
                return (
                  <Fragment key={f.isin}>
                  {nueva && (
                    <tr className="border-b border-borde">
                      <th colSpan={9} scope="colgroup" className="pt-4 pb-1 text-left text-[11px] font-normal uppercase tracking-widest text-acento">
                        {categoria(f)} <span className="text-suave">· {porCategoria(categoria(f))}</span>
                      </th>
                    </tr>
                  )}
                  <tr className="border-b border-borde/50 align-top">
                    <td className="py-1 text-left">
                      <a href={`#/fondo/${f.isin}`} className="hover:text-acento">{f.fondo.nombre}</a>
                      <span className="block text-suave">desde {fecha(f.alta)}</span>
                    </td>
                    <td className="text-left">
                      <select value={f.estado} aria-label="Estado" onChange={(x) => cambiar(f.isin, { estado: x.target.value as Fila['estado'] })}
                        className={`${control} ${f.estado === 'candidato' ? 'text-acento' : ''}`}>
                        <option>vigilando</option><option>candidato</option><option>descartado</option>
                      </select>
                    </td>
                    <td>{e ? <><span className="text-acento">{Math.round(e.nota)}</span>{e.percentil != null && <span className="text-suave"> p{Math.round(e.percentil)}</span>}</> : <span className="text-suave">sin nota</span>}</td>
                    <td>{cambio(e?.semana ?? null)}</td>
                    <td>{cambio(e?.periodo ?? null)}</td>
                    <td>{f.fondo.ter == null ? '—' : `${cifra(f.fondo.ter)} %`}</td>
                    <td className={`text-left ${f.myinvestor ? 'text-sube' : 'text-suave'}`}>{f.myinvestor ? 'sí' : 'no'}</td>
                    <td className="text-left">
                      <input defaultValue={f.nota ?? ''} placeholder="por qué lo sigo" aria-label="Mi nota"
                        onBlur={(x) => x.target.value !== (f.nota ?? '') && cambiar(f.isin, { nota: x.target.value || null })}
                        className={`${control} w-56`} />
                    </td>
                    <td><button onClick={() => quitar(f.isin)} aria-label="Dejar de seguir" className="min-h-7 min-w-7 text-suave hover:text-baja">×</button></td>
                  </tr>
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-suave">El estado y tu nota se guardan al momento (la nota, al salir del campo). MyInvestor sale de su catálogo, que se renueva cada semana. Los fondos en seguimiento que no estén descartados tienen precios diarios desde la siguiente descarga.</p>
    </div>
  )
}
