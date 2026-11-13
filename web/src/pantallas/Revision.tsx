import { useEffect, useState } from 'react'
import { cifra, fecha } from '../calculo/formato'
import * as q from '../datos/consultas'
import { revisar, type Revision as Datos } from '../datos/revision'

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

/** Revisión: los fondos de mis carteras con alguna señal, por qué y sus 3 mejores alternativas; umbrales editables. */
export default function Revision() {
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  useEffect(() => { revisar().then(setDatos).catch((e: Error) => setError(e.message)) }, [version])

  if (!datos) return <p className="text-suave">{error || 'Revisando las carteras (señales, correlaciones y alternativas)…'}</p>
  const marcados = datos.carteras.flatMap((c) => c.fondos.filter((f) => f.senales.length).map((f) => ({ ...f, cartera: c.cartera })))
  const sinSenal = datos.carteras.flatMap((c) => c.fondos.filter((f) => !f.senales.length).map((f) => ({ ...f, cartera: c.cartera })))
  const semana = datos.carteras.flatMap((c) => c.fondos).map((f) => f.nota?.fecha).filter(Boolean).sort().at(-1)
  const guardar = (clave: string, texto: string) => {
    const v = Number(texto.replace(',', '.'))
    if (!isFinite(v)) return
    q.guardarUmbral(clave, v).then(() => setVersion((n) => n + 1)).catch((e: Error) => setError(e.message))
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-acento">Revisión</h1>
        <p className="text-suave">
          {marcados.length} fondos marcados en {new Set(marcados.map((m) => m.cartera.id)).size} de {datos.carteras.length} carteras
          {semana && ` · nota de la semana del ${fecha(semana)} (pesos por defecto, sin Diversificación)`}
          {datos.umbrales.find((u) => u.clave === 'solo_myinvestor')?.valor ? ' · alternativas solo de MyInvestor' : ''}
          {(datos.umbrales.find((u) => u.clave === 'misma_divisa')?.valor ?? 1) ? ' · en la misma divisa' : ''}
        </p>
      </div>
      {error && <p className="text-baja">{error}</p>}

      {marcados.map((m) => (
        <section key={`${m.cartera.id}-${m.fondo.isin}`} className="border border-borde">
          <div className="flex flex-wrap justify-between gap-3 border-b border-borde bg-panel p-3">
            <div>
              <p className="text-suave"><a href={`#/cartera/${m.cartera.id}`} className="hover:text-texto">{m.cartera.nombre}</a> · peso {cifra(m.peso, 0)} %</p>
              <p className="text-[15px]"><a href={`#/fondo/${m.fondo.isin}`} className="hover:text-acento">{m.fondo.nombre}</a> <span className="text-suave">· {m.fondo.isin}</span></p>
              <p className="text-suave">
                {m.fondo.categoria} · nota {m.nota ? <span className="text-aviso">{Math.round(m.nota.nota)}{m.nota.percentil != null && ` (p${Math.round(m.nota.percentil)})`}</span> : 'sin nota'}
                {' '}· TER {m.fondo.ter == null ? '—' : `${cifra(Number(m.fondo.ter))} %`}
              </p>
            </div>
            <div className="flex flex-wrap items-start gap-1.5">
              {m.senales.map((s) => <span key={s.tipo} className="border border-aviso px-2 py-0.5 text-aviso">▲ {s.tipo}</span>)}
            </div>
          </div>
          <ul className="list-disc space-y-1 py-3 pl-8 pr-3">{m.senales.map((s) => <li key={s.tipo}>{s.motivo}</li>)}</ul>
          {m.alternativas.length > 0 && (
            <p className="px-3 pb-2"><a href={`#/comparar/${[m.fondo.isin, ...m.alternativas.map((a) => a.isin)].slice(0, 5).join(',')}`} className="text-suave hover:text-acento">comparar con sus alternativas →</a></p>
          )}
          {m.alternativas.length > 0 && (
            <div className="overflow-x-auto px-3 pb-3">
              <table className="w-full min-w-[40rem] text-right tabular [&_tr>*+*]:pl-3">
                <thead className="text-[11px] uppercase tracking-widest text-suave">
                  <tr className="border-b border-borde">
                    <th className="py-1 text-left font-normal">Alternativa</th><th className="font-normal">Nota</th><th className="font-normal">TER</th>
                    <th className="font-normal">Correl.</th><th className="text-left font-normal">MyInvestor</th><th><span className="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  {m.alternativas.map((a) => (
                    <tr key={a.isin} className="border-b border-borde/50">
                      <td className="py-1 text-left"><a href={`#/fondo/${a.isin}`} className="hover:text-acento">{a.nombre}</a></td>
                      <td className="text-acento">{Math.round(a.nota)}</td>
                      <td>{a.ter == null ? '—' : `${cifra(a.ter)} %`}</td>
                      <td className="text-suave">{a.c == null ? '—' : cifra(a.c)}</td>
                      <td className={`text-left ${a.myinvestor ? 'text-sube' : 'text-suave'}`}>{a.myinvestor ? 'sí' : 'no'}</td>
                      <td className="whitespace-nowrap">
                        <button onClick={() => q.seguir(a.isin).catch((e: Error) => setError(e.message))} className="min-h-7 text-suave hover:text-acento">+ seguir</button>
                        <a href={`#/simular/${m.cartera.id}/${m.fondo.isin}/${a.isin}`} className="ml-3 text-suave hover:text-acento">probar en la cartera</a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}

      {sinSenal.length > 0 && (
        <p className="text-suave">Sin señal: {sinSenal.map((f) => `${f.fondo.nombre} (${f.cartera.nombre}${f.nota ? `, nota ${Math.round(f.nota.nota)}` : ', sin nota'})`).join(' · ')}.</p>
      )}

      <section className="space-y-2">
        <h2 className="text-[11px] uppercase tracking-widest text-suave">Umbrales de las señales</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] tabular">
            <tbody>
              {datos.umbrales.map((u) => (
                <tr key={u.clave} className="border-b border-borde/50">
                  <td className="py-1">{REGLA[u.clave] ?? u.descripcion}</td>
                  <td className="w-24 text-right">
                    {SI_NO.includes(u.clave) ? (
                      <input type="checkbox" checked={!!u.valor} aria-label={REGLA[u.clave]} onChange={(e) => guardar(u.clave, e.target.checked ? '1' : '0')} className="accent-acento" />
                    ) : <input key={u.valor} defaultValue={String(u.valor).replace('.', ',')} inputMode="decimal" aria-label={REGLA[u.clave] ?? u.clave}
                      onBlur={(e) => e.target.value !== String(u.valor).replace('.', ',') && guardar(u.clave, e.target.value)}
                      className="w-20 border border-borde bg-panel px-1 py-1 text-right outline-none focus:border-acento" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-suave">Se guarda al salir del campo y la revisión se recalcula.</p>
      </section>
    </div>
  )
}
