import { useEffect, useMemo, useState } from 'react'
import { cifra, millones, pct } from '../calculo/formato'
import { BLOQUES, NOMBRE_BLOQUE, PESOS_DEFECTO, PLAZOS, type Pesos, type Plazo } from '../calculo/nota'
import { cubierta, grupo, grupos, indexada, MIN_CATEGORIA, ordenar, pasa, puntuar, tipoActivo, TIPOS, type Filtros, type Modo, type Orden, type Puntuado, type Tipo } from '../calculo/screener'
import TablaNota from '../componentes/TablaNota'
import * as q from '../datos/consultas'

const POR_PAGINA = 100
const hoy = () => new Date().toISOString().slice(0, 10)
const control = 'border border-borde bg-panel px-2 py-1 text-texto outline-none focus:border-acento'

// Lo elegido se guarda en la pestaña (sessionStorage) para encontrarlo igual al volver de una ficha.
const CLAVE = 'screener'
type Guardado = { pesos: Pesos; filtros: Filtros; modo: Modo; carteraId: number | ''; excluirSuyos: boolean; sel: string | null; mostrar: number; orden: Orden; plazo: Plazo | ''; y: number }
const anos = (p: Plazo) => (p === '1a' ? '1 año' : `${parseInt(p)} años`)
const leer = (): Partial<Guardado> => { try { return JSON.parse(sessionStorage.getItem(CLAVE) ?? '{}') } catch { return {} } }
const escribir = (g: Partial<Guardado>) => { try { sessionStorage.setItem(CLAVE, JSON.stringify({ ...leer(), ...g })) } catch { /* sin almacenamiento: se pierde al salir */ } }

/** Screener: el universo ordenado por la nota (percentiles de su categoría, pesos ajustables), con filtros y perfiles. */
export default function Screener() {
  const [g] = useState(leer)
  const [datos, setDatos] = useState<q.FilaScreener[] | null>(null)
  const [perfiles, setPerfiles] = useState<q.Perfil[]>([])
  const [carteras, setCarteras] = useState<q.Cartera[]>([])
  const [seguidos, setSeguidos] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const [pesos, setPesos] = useState<Pesos>(g.pesos ?? PESOS_DEFECTO)
  const [filtros, setFiltros] = useState<Filtros>(g.filtros ?? {})
  const [modo, setModo] = useState<Modo>(g.modo ?? 'juntos')
  const [carteraId, setCarteraId] = useState<number | ''>(g.carteraId ?? '')
  const [enCartera, setEnCartera] = useState<Set<string>>(new Set())
  const [excluirSuyos, setExcluirSuyos] = useState(g.excluirSuyos ?? false)
  const [div, setDiv] = useState<Map<string, number> | undefined>(undefined)
  const [avisoDiv, setAvisoDiv] = useState<string | null>(null)
  const [sel, setSel] = useState<string | null>(g.sel ?? null)
  const [mostrar, setMostrar] = useState(g.mostrar ?? POR_PAGINA)
  const [orden, setOrden] = useState<Orden>(g.orden ?? 'nota')
  const [plazo, setPlazo] = useState<Plazo | ''>(g.plazo ?? '')

  const falla = (e: Error) => setError(e.message)
  useEffect(() => {
    q.screener().then(setDatos).catch(falla)
    q.perfiles().then(setPerfiles).catch(falla)
    q.carteras().then(setCarteras).catch(falla)
    q.seguimiento().then((s) => setSeguidos(new Set(s.map((x) => x.isin)))).catch(falla)
  }, [])
  useEffect(() => {
    setEnCartera(new Set()); setDiv(undefined); setAvisoDiv(null)
    if (carteraId === '') return
    Promise.all([q.cartera(carteraId), q.diversificacion(carteraId)]).then(([c, d]) => {
      const isins = c?.fondos.map((f) => f.fondo.isin) ?? []
      setEnCartera(new Set(isins))
      setDiv(d.percentiles)
      setAvisoDiv(q.avisoDiversificacion(d.base, isins))
    }).catch(falla)
  }, [carteraId])
  useEffect(() => escribir({ pesos, filtros, modo, carteraId, excluirSuyos, sel, mostrar, orden, plazo }), [pesos, filtros, modo, carteraId, excluirSuyos, sel, mostrar, orden, plazo])
  useEffect(() => () => escribir({ y: scrollY }), []) // al salir (p. ej. a una ficha), dónde estaba la lista
  useEffect(() => { if (datos && g.y) scrollTo(0, g.y) }, [datos, g])

  // sin cartera elegida, Diversificación no tiene datos y su peso se reparte entre los demás bloques
  const puntuados = useMemo(() => {
    const excluir = excluirSuyos ? enCartera : new Set<string>()
    return datos ? ordenar(puntuar(datos.filter((f) => pasa(f, filtros, hoy(), excluir)), pesos, div, plazo || undefined), orden) : []
  }, [datos, filtros, excluirSuyos, enCartera, pesos, div, orden, plazo])
  // shortcut: cuenta clases, no fondos (el percentil cuenta uno por fondo); basta para avisar de categorías casi vacías
  const tamano = useMemo(() => {
    const n = new Map<string, number>()
    for (const f of datos ?? []) if (f.categoria) n.set(f.categoria, (n.get(f.categoria) ?? 0) + 1)
    return n
  }, [datos])
  const pocos = (f: Puntuado) => f.nota != null && (tamano.get(f.categoria ?? '') ?? 0) < MIN_CATEGORIA ? tamano.get(f.categoria ?? '') ?? 0 : 0
  const listas: [string, Puntuado[]][] = modo === 'separados'
    ? [['Indexados', puntuados.filter(indexada)], ['Activos', puntuados.filter((f) => !indexada(f))]]
    : [['', modo === 'juntos' ? puntuados : puntuados.filter((f) => indexada(f) === (modo === 'indexados'))]]
  // lo que pesa de verdad cada bloque: su barra entre la suma de las barras (sin Diversificación si no hay cartera)
  const totalPesos = BLOQUES.reduce((s, k) => s + (k === 'diversificacion' && !div ? 0 : pesos[k]), 0)
  const elegido = puntuados.find((f) => f.isin === sel) ?? null
  const categorias = useMemo(() => {
    const n = new Map<string, number>()
    for (const f of datos ?? [])
      if (f.categoria && (!filtros.tipo || tipoActivo(f.categoria) === filtros.tipo) && (!filtros.grupo || grupo(f.categoria) === filtros.grupo))
        n.set(f.categoria, (n.get(f.categoria) ?? 0) + 1)
    return [...n].sort(([a], [b]) => a.localeCompare(b))
  }, [datos, filtros.tipo, filtros.grupo])
  const divisas = useMemo(() => [...new Set((datos ?? []).map((f) => f.divisa).filter(Boolean) as string[])].sort(), [datos])
  const filtrar = (x: Partial<Filtros>) => { setFiltros((f) => ({ ...f, ...x })); setMostrar(POR_PAGINA) }

  const aplicarPerfil = (id: string) => {
    const p = perfiles.find((x) => String(x.id) === id)
    if (!p) return
    setPesos({ ...PESOS_DEFECTO, ...p.pesos })
    setFiltros(p.filtros as Filtros)
    setModo(p.modo as Modo)
  }
  const guardar = async () => {
    const nombre = prompt('Nombre del perfil (si ya existe, se sustituye)')?.trim()
    if (!nombre) return
    try {
      await q.guardarPerfil({ nombre, pesos, filtros, modo })
      setPerfiles(await q.perfiles())
    } catch (e) { falla(e as Error) }
  }
  const seguirFondo = (isin: string) => q.seguir(isin).then(() => setSeguidos((s) => new Set(s).add(isin))).catch(falla)

  return (
    <div className="flex flex-wrap items-start gap-4">
      <aside aria-label="Filtros" className="flex w-full flex-col gap-3 sm:w-56">
        <h2 className="text-[11px] uppercase tracking-widest text-suave">Filtros</h2>
        <label className="flex flex-col gap-1 text-suave">perfil
          <select defaultValue="" onChange={(e) => aplicarPerfil(e.target.value)} className={control}>
            <option value="" disabled>elegir…</option>
            {perfiles.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-suave">tipo de activo
          <select value={filtros.tipo ?? ''} onChange={(e) => filtrar({ tipo: (e.target.value || undefined) as Tipo | undefined, grupo: undefined, categoria: undefined })} className={control}>
            <option value="">todos</option>
            {TIPOS.map((x) => <option key={x}>{x}</option>)}
          </select>
        </label>
        {filtros.tipo && grupos(filtros.tipo).length > 1 && (
          <label className="flex flex-col gap-1 text-suave">{filtros.tipo === 'mixto' ? 'perfil' : filtros.tipo === 'renta fija' ? 'tipo de bono' : 'región o estilo'}
            <select value={filtros.grupo ?? ''} onChange={(e) => filtrar({ grupo: e.target.value || undefined, categoria: undefined })} className={control}>
              <option value="">todos</option>
              {grupos(filtros.tipo).map((g) => <option key={g}>{g}</option>)}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1 text-suave">categoría ({categorias.length})
          <select value={filtros.categoria ?? ''} onChange={(e) => filtrar({ categoria: e.target.value || undefined })} className={control}>
            <option value="">todas</option>
            {categorias.map(([c, n]) => <option key={c} value={c}>{c} ({n})</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-suave">gestión
          <select value={filtros.gestion ?? ''} onChange={(e) => filtrar({ gestion: (e.target.value || undefined) as Filtros['gestion'] })} className={control}>
            <option value="">indexada y activa</option>
            <option value="indexada">indexada</option>
            <option value="activa">activa</option>
          </select>
        </label>
        {([['terMax', 'TER máximo (%)', '0,05'], ['srriMax', 'SRRI máximo (1–7)', '1'], ['anosMin', 'antigüedad mínima (años)', '1'],
          ['patrimonioMin', 'patrimonio mínimo (M€)', '10']] as const).map(([k, etiqueta]) => (
          <label key={k} className="flex flex-col gap-1 text-suave">{etiqueta}
            <CampoNumero valor={filtros[k]} cambiar={(v) => filtrar({ [k]: v })} />
          </label>
        ))}
        <label className="flex flex-col gap-1 text-suave">divisa
          <select value={filtros.divisa ?? ''} onChange={(e) => filtrar({ divisa: e.target.value || undefined })} className={control}>
            <option value="">todas</option>
            {divisas.map((d) => <option key={d}>{d}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-suave">
          <input type="checkbox" checked={!!filtros.soloMyinvestor} onChange={(e) => filtrar({ soloMyinvestor: e.target.checked || undefined })} />
          solo los de MyInvestor
        </label>
        <label className="flex flex-col gap-1 text-suave">cartera para diversificar
          <select value={carteraId} onChange={(e) => setCarteraId(e.target.value ? +e.target.value : '')} className={control}>
            <option value="">ninguna</option>
            {carteras.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-suave">
          <input type="checkbox" checked={excluirSuyos} disabled={carteraId === ''} onChange={(e) => setExcluirSuyos(e.target.checked)} />
          excluir los que ya están
        </label>
        {avisoDiv && <p role="status" className="text-aviso">{avisoDiv}</p>}
        <button onClick={() => { setFiltros({}); setCarteraId(''); setExcluirSuyos(false) }} className="min-h-8 border border-borde px-3 text-suave hover:text-texto">quitar filtros</button>
      </aside>

      <main className="min-w-0 flex-[999_1_32rem] space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-acento">Screener</h1>
            <p className="text-suave">
              {datos ? `${puntuados.length} de ${datos.length} fondos pasan los filtros` : 'Cargando el universo…'} · nota 0–100 dentro de su categoría
            </p>
          </div>
          <div role="group" aria-label="Modo de ranking" className="flex border border-borde">
            {(['juntos', 'separados', 'indexados', 'activos'] as Modo[]).map((m) => (
              <button key={m} aria-pressed={modo === m} onClick={() => setModo(m)}
                className={`min-h-8 px-3 ${modo === m ? 'bg-panel text-acento' : 'text-suave hover:text-texto'} [&+&]:border-l [&+&]:border-borde`}>{m}</button>
            ))}
          </div>
        </div>
        {error && <p className="text-baja">{error}</p>}
        {listas.map(([titulo, filas]) => (
          <section key={titulo} className="space-y-1">
            {titulo && <h2 className="text-[11px] uppercase tracking-widest text-suave">{titulo} · {filas.length}</h2>}
            <Tabla filas={filas.slice(0, mostrar)} sel={sel} setSel={setSel} seguidos={seguidos} seguir={seguirFondo} conCategoria={!filtros.categoria} orden={orden} setOrden={setOrden} pocos={pocos} plazo={plazo} />
            {filas.length > mostrar && (
              <button onClick={() => setMostrar((n) => n + POR_PAGINA)} className="text-suave hover:text-texto">ver {Math.min(POR_PAGINA, filas.length - mostrar)} más</button>
            )}
          </section>
        ))}
        <p className="text-suave">Clic en una fila: desglose de la nota · ★ ya en seguimiento · al final, los fondos con menos de 3 años, sin nota. Sin gestión conocida, un fondo cuenta como activo.</p>
      </main>

      <aside aria-label="Pesos y desglose" className="flex w-full flex-col gap-5 sm:w-72">
        <section className="flex flex-col gap-2">
          <h2 className="text-[11px] uppercase tracking-widest text-suave">Plazo de la nota</h2>
          <div role="group" aria-label="Plazo de las métricas de la nota" className="flex w-fit border border-borde">
            {(['', ...PLAZOS] as const).map((p) => (
              <button key={p} aria-pressed={plazo === p} onClick={() => setPlazo(p)}
                className={`min-h-8 px-2 ${plazo === p ? 'bg-panel text-acento' : 'text-suave hover:text-texto'} [&+&]:border-l [&+&]:border-borde`}>{p ? p.toUpperCase() : 'auto'}</button>
            ))}
          </div>
          <p className="text-suave">{plazo ? `Métricas a ${anos(plazo)}; los fondos sin ese historial no tienen nota.` : 'Auto: el plazo más largo de cada fondo (5 años, o 3), como la nota guardada y las señales.'}</p>
          <h2 className="mt-2 text-[11px] uppercase tracking-widest text-suave">Pesos de la nota</h2>
          {BLOQUES.map((k) => (
            <label key={k} className={`grid grid-cols-[1fr_auto] gap-x-2 ${k === 'diversificacion' && !div ? 'text-suave' : ''}`}>
              <span>{NOMBRE_BLOQUE[k]}</span><span className="tabular text-right">{k === 'diversificacion' && !div ? '—' : `${Math.round((100 * pesos[k]) / (totalPesos || 1))} %`}</span>
              <input type="range" min={0} max={50} value={pesos[k]} disabled={k === 'diversificacion' && !div} aria-label={`Peso de ${NOMBRE_BLOQUE[k]}`}
                onChange={(e) => setPesos((p) => ({ ...p, [k]: +e.target.value }))} className="col-span-2 accent-acento" />
            </label>
          ))}
          <p className="text-suave">{div ? 'Diversificación: 1 − correlación media con los fondos de la cartera elegida (3 años), en percentil de su categoría.' : 'Sin cartera elegida, el peso de Diversificación se reparte entre los demás, igual que el de un bloque sin datos.'}</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={guardar} className="min-h-8 border border-borde px-3 hover:text-acento">guardar perfil</button>
            <button onClick={() => setPesos(PESOS_DEFECTO)} className="min-h-8 border border-borde px-3 text-suave hover:text-texto">por defecto</button>
          </div>
        </section>
        {elegido && <Desglose f={elegido} plazo={plazo} pocos={pocos(elegido)} pesos={pesos} seguido={seguidos.has(elegido.isin)} seguir={seguirFondo} />}
      </aside>
    </div>
  )
}

const numero = (v: string) => {
  const x = Number(v.replace(',', '.'))
  return v.trim() === '' || !isFinite(x) ? undefined : x
}

/** Campo numérico que guarda lo escrito tal cual («0,» mientras se teclea «0,5») y avisa con el número. */
function CampoNumero({ valor, cambiar }: { valor: number | undefined; cambiar: (v: number | undefined) => void }) {
  const [texto, setTexto] = useState(valor == null ? '' : String(valor).replace('.', ','))
  useEffect(() => { // cambio desde fuera (perfil, quitar filtros)
    if (numero(texto) !== valor) setTexto(valor == null ? '' : String(valor).replace('.', ','))
  }, [valor]) // eslint-disable-line react-hooks/exhaustive-deps
  return <input inputMode="decimal" value={texto} onChange={(e) => { setTexto(e.target.value); cambiar(numero(e.target.value)) }} className={control} />
}

function Tabla({ filas, sel, setSel, seguidos, seguir, conCategoria, orden, setOrden, pocos, plazo }: {
  filas: Puntuado[]; sel: string | null; setSel: (i: string) => void; seguidos: Set<string>; seguir: (i: string) => void; conCategoria: boolean
  orden: Orden; setOrden: (o: Orden) => void; pocos: (f: Puntuado) => number; plazo: Plazo | ''
}) {
  const cabecera = (o: Orden, texto: string, clase = '') => (
    <th className={`font-normal ${clase}`} aria-sort={orden === o ? (o === 'ter' ? 'ascending' : 'descending') : 'none'}>
      <button onClick={() => setOrden(o)} className={`uppercase tracking-widest ${orden === o ? 'text-acento' : 'hover:text-texto'}`}>{texto}{orden === o ? (o === 'ter' ? ' ↑' : ' ↓') : ''}</button>
    </th>
  )
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[44rem] text-right [&_tr>*+*]:pl-3">
        <thead className="text-[11px] uppercase tracking-widest text-suave">
          <tr className="border-b border-borde">
            <th className="w-8 py-1 font-normal">#</th>
            <th className="text-left font-normal">Fondo</th>
            {cabecera('nota', 'Nota', 'w-36 text-left')}
            {cabecera('ter', 'TER')}
            {cabecera('r3', '3A anual')}
            {cabecera('r5', '5A anual')}
            <th className="font-normal">Patrim.</th>
            <th className="w-8 font-normal"><span className="sr-only">Seguir</span></th>
          </tr>
        </thead>
        <tbody className="tabular">
          {filas.map((f, i) => (
            <tr key={f.isin} onClick={() => setSel(f.isin)} className={`cursor-pointer border-b border-borde/50 ${sel === f.isin ? 'bg-panel' : 'hover:bg-panel/50'}`}>
              <td className="py-1 text-suave">{f.nota == null && orden === 'nota' ? '' : i + 1}</td>
              <td className="text-left">
                <a href={`#/fondo/${f.isin}`} onClick={(e) => e.stopPropagation()} className="hover:text-acento">{f.nombre}</a>
                {f.myinvestor && <span className="text-suave" title="Se puede comprar en MyInvestor"> · MI</span>}
                {(f.divisa !== 'EUR' || cubierta(f.nombre)) && <span className="text-suave"> · {f.divisa}{cubierta(f.nombre) && ' cubierta'}</span>}
                {conCategoria && <span className="block text-suave">{f.categoria}</span>}
              </td>
              <td className="text-left">
                {f.nota == null ? <span className="text-suave">{plazo ? `sin ${anos(plazo)}` : 'sin historial'}</span> : (
                  <span className="inline-flex items-center gap-2">
                    <span className="w-7 text-right text-acento">{Math.round(f.nota)}</span>
                    <span aria-hidden className="inline-block h-1.5 w-20 bg-borde/60"><span className="block h-1.5 bg-acento" style={{ width: `${f.nota}%` }} /></span>
                    {f.solo3a && <span className="text-suave" title="Menos de 5 años: métricas a 3 años">3A</span>}
                    {pocos(f) > 0 && <span className="text-aviso" title={`Su categoría solo tiene ${pocos(f)} fondos en el universo: el percentil dice poco`}>de {pocos(f)}</span>}
                  </span>
                )}
              </td>
              <td>{f.ter == null ? '—' : `${cifra(f.ter)} %`}</td>
              {[f.r3, f.r5].map((r, j) => <td key={j} className={r == null ? 'text-suave' : r >= 0 ? 'text-sube' : 'text-baja'}>{r == null ? '—' : pct(r)}</td>)}
              <td className="text-suave">{millones(f.patrimonio_meur)}</td>
              <td>
                <button onClick={(e) => { e.stopPropagation(); if (!seguidos.has(f.isin)) seguir(f.isin) }} aria-label={seguidos.has(f.isin) ? 'En seguimiento' : 'Añadir a seguimiento'}
                  className={`min-h-7 min-w-7 ${seguidos.has(f.isin) ? 'text-aviso' : 'text-suave hover:text-acento'}`}>{seguidos.has(f.isin) ? '★' : '+'}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Desglose({ f, plazo, pocos, pesos, seguido, seguir }: { f: Puntuado; plazo: Plazo | ''; pocos: number; pesos: Pesos; seguido: boolean; seguir: (i: string) => void }) {
  return (
    <section className="flex flex-col gap-2 border-t border-borde pt-4">
      <h2 className="text-[11px] uppercase tracking-widest text-suave">{f.nota == null ? 'Sin nota' : `Por qué ${Math.round(f.nota)}`}</h2>
      <p><a href={`#/fondo/${f.isin}`} className="hover:text-acento">{f.nombre}</a><br />
        <span className="text-suave">{f.isin} · {f.gestion ?? 'gestión sin dato'} · TER {f.ter == null ? '—' : `${cifra(f.ter)} %`} · SRRI {f.srri ?? '—'}</span></p>
      {f.nota == null ? <p className="text-suave">{plazo ? `Menos de ${anos(plazo)} de historial: no tiene nota a ese plazo.` : 'Menos de 3 años de historial: no tiene nota.'}</p> : (
        <TablaNota bloques={f.bloques} pesos={pesos} nota={f.nota} />
      )}
      {pocos > 0 && <p className="text-aviso">Su categoría ({f.categoria}) solo tiene {pocos} fondos en el universo: los percentiles se calculan frente a ellos y la nota dice poco.</p>}
      {f.solo3a && <p className="text-suave">Menos de 5 años: métricas a 3 años y, en los activos, consistencia solo con el ratio de información.</p>}
      <button onClick={() => seguir(f.isin)} disabled={seguido}
        className="min-h-9 border border-acento bg-panel px-3 text-left text-acento disabled:border-borde disabled:text-suave">{seguido ? '★ en seguimiento' : 'añadir a seguimiento'}</button>
      <button disabled className="min-h-9 border border-borde px-3 text-left text-suave">comparar (fase 4)</button>
      <button disabled className="min-h-9 border border-borde px-3 text-left text-suave">probar en una cartera (fase 4)</button>
    </section>
  )
}
