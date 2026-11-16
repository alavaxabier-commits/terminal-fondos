import { useEffect, useMemo, useState } from 'react'
import { cifra, hoy, pct } from '../calculo/formato'
import { aPesosTipo, BLOQUES, NOMBRE_BLOQUE, PESOS_TIPO_DEFECTO, PLAZOS, pesosEfectivos, type Bloque, type PesosTipo, type Plazo, type Tipo } from '../calculo/nota'
import { cifraDe, COLUMNAS, cubierta, DE_MONETARIOS, grupo, grupos, indexada, NOMBRE_GRUPO, mediana, MIN_CATEGORIA, ordenar, pasa, percentilDe, puntuar, tipoActivo, TIPOS, type Filtros, type Modo, type Orden, type Puntuado } from '../calculo/screener'
import Franja from '../componentes/Franja'
import Tarjeta from '../componentes/Tarjeta'
import TarjetaFondo from '../componentes/TarjetaFondo'
import type { Senal } from '../calculo/senales'
import { revisar } from '../datos/revision'
import { useTeclasLista } from '../componentes/teclas'
import { alternar } from '../datos/bandeja'
import * as q from '../datos/consultas'

const POR_PAGINA = 100
const control = 'rounded-md border border-borde bg-panel px-2 py-1 text-texto outline-none focus:border-acento'
const tono = (v: number | null | undefined) => (v == null ? 'text-suave' : v >= 0 ? 'text-sube' : 'text-baja')
/** Color de cada bloque de la nota: el mismo en los pesos, en la barra de cada fondo y en la leyenda. Seis bloques no caben en
 *  una paleta legible (dataviz): el acento en dos intensidades alternas, separados por un hueco, y el nombre en la leyenda y el orden. */
const FUERTE = 'var(--color-acento)', FLOJO = 'color-mix(in srgb, var(--color-acento) 45%, var(--color-panel))'
const COLOR_BLOQUE: Record<Bloque, string> = {
  riesgo: FUERTE, consistencia: FLOJO, coste: FUERTE, proteccion: FLOJO, rentabilidad: FUERTE, tir: FLOJO, diversificacion: 'var(--color-gris)',
}

// Lo elegido se guarda en la pestaña (sessionStorage) para encontrarlo igual al volver de una ficha.
const CLAVE = 'screener'
type Guardado = { pesos: PesosTipo; tipoPesos: Tipo; filtros: Filtros; modo: Modo; carteraId: number | ''; excluirSuyos: boolean; sel: string | null; mostrar: number; orden: Orden; plazo: Plazo | ''; y: number }
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
  const [pesos, setPesos] = useState<PesosTipo>(() => aPesosTipo(g.pesos))
  // tipo de activo cuyos pesos se editan: el del filtro si hay uno
  const [tipoPesos, setTipoPesos] = useState<Tipo>(g.tipoPesos ?? 'renta variable')
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
  const [panel, setPanel] = useState<'filtros' | 'pesos' | null>(null)
  const [cats, setCats] = useState<Awaited<ReturnType<typeof q.categoriasReferencia>> | null>(null)
  const [senales, setSenales] = useState<Map<string, Senal[]>>(new Map())
  const [nombrePerfil, setNombrePerfil] = useState('')
  const [guardado, setGuardado] = useState('')
  // con el tipo monetario, el ranking cambia a la vista Monetarios (por defecto, por 3M); al salir, vuelve a la nota
  const monetarios = filtros.tipo === 'monetario'
  const ordenEf: Orden = monetarios ? (DE_MONETARIOS.includes(orden) || orden === 'ter' ? orden : 'm3') : DE_MONETARIOS.includes(orden) ? 'nota' : orden

  const falla = (e: Error) => setError(e.message)
  useEffect(() => {
    q.screener().then(setDatos).catch(falla)
    q.perfiles().then(setPerfiles).catch(falla)
    q.carteras().then(setCarteras).catch(falla)
    q.seguimiento().then((s) => setSeguidos(new Set(s.map((x) => x.isin)))).catch(falla)
    q.categoriasReferencia().then(setCats).catch(falla)
    // señales de revisión de los fondos de las carteras, para la tarjeta (si fallan, la tarjeta sale sin ellas)
    revisar().then((r) => {
      const m = new Map<string, Senal[]>()
      for (const c of r.carteras)
        for (const x of c.fondos) {
          const antes = m.get(x.fondo.isin) ?? [] // un fondo en dos carteras: cada señal una vez
          m.set(x.fondo.isin, [...antes, ...x.senales.filter((s) => !antes.some((t) => t.tipo === s.tipo))])
        }
      setSenales(m)
    }).catch(() => {})
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
  useEffect(() => escribir({ pesos, tipoPesos, filtros, modo, carteraId, excluirSuyos, sel, mostrar, orden, plazo }), [pesos, tipoPesos, filtros, modo, carteraId, excluirSuyos, sel, mostrar, orden, plazo])
  useEffect(() => { if (filtros.tipo) setTipoPesos(filtros.tipo) }, [filtros.tipo])
  useEffect(() => () => escribir({ y: scrollY }), []) // al salir (p. ej. a una ficha), dónde estaba la lista
  useEffect(() => { if (datos && g.y) scrollTo(0, g.y) }, [datos, g])

  // sin cartera elegida, Diversificación no tiene datos y su peso se reparte entre los demás bloques
  const puntuados = useMemo(() => {
    const excluir = excluirSuyos ? enCartera : new Set<string>()
    return datos ? ordenar(puntuar(datos.filter((f) => pasa(f, filtros, hoy(), excluir)), pesos, div, plazo || undefined), ordenEf) : []
  }, [datos, filtros, excluirSuyos, enCartera, pesos, div, ordenEf, plazo])
  // todo el universo con la misma nota, para las alternativas de la tarjeta (no dependen de los filtros)
  const todos = useMemo(() => (datos ? puntuar(datos, pesos, div, plazo || undefined) : []), [datos, pesos, div, plazo])
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
  const editados = pesos[tipoPesos]
  const totalPesos = BLOQUES.reduce((s, k) => s + (k === 'diversificacion' && !div ? 0 : editados[k]), 0)
  const pesoReal = (k: Bloque) => (k === 'diversificacion' && !div ? 0 : editados[k] / (totalPesos || 1))
  const elegido = puntuados.find((f) => f.isin === sel) ?? null
  const categorias = useMemo(() => {
    const n = new Map<string, number>()
    for (const f of datos ?? [])
      if (f.categoria && (!filtros.tipo || tipoActivo(f.categoria) === filtros.tipo) && (!filtros.grupo || grupo(f.categoria) === filtros.grupo))
        n.set(f.categoria, (n.get(f.categoria) ?? 0) + 1)
    return [...n].sort(([a], [b]) => a.localeCompare(b))
  }, [datos, filtros.tipo, filtros.grupo])
  // fondos de cada grupo del tipo elegido (en todo el universo), para las pastillas
  const porGrupo = useMemo(() => {
    const n = new Map<string, number>()
    for (const f of datos ?? []) if (filtros.tipo && tipoActivo(f.categoria) === filtros.tipo) { const g = grupo(f.categoria); if (g) n.set(g, (n.get(g) ?? 0) + 1) }
    return n
  }, [datos, filtros.tipo])
  const divisas = useMemo(() => [...new Set((datos ?? []).map((f) => f.divisa).filter(Boolean) as string[])].sort(), [datos])
  const filtrar = (x: Partial<Filtros>) => { setFiltros((f) => ({ ...f, ...x })); setMostrar(POR_PAGINA) }

  const aplicarPerfil = (id: string) => {
    const p = perfiles.find((x) => String(x.id) === id)
    if (!p) return
    setPesos(aPesosTipo(p.pesos))
    setFiltros(p.filtros as Filtros)
    setModo(p.modo as Modo)
  }
  const seguirFondo = (isin: string) => q.seguir(isin).then(() => setSeguidos((s) => new Set(s).add(isin))).catch(falla)

  // lo que se ve, en orden: la lista del teclado; sin selección (o si los filtros la quitan), la primera fila
  const visibles = listas.flatMap(([, filas]) => filas.slice(0, mostrar))
  const primera = visibles[0]?.isin
  const sigue = visibles.some((f) => f.isin === sel)
  useEffect(() => { if (primera && !sigue) setSel(primera) }, [primera, sigue])
  useTeclasLista(visibles.map((f) => f.isin), sel, setSel, {
    Enter: (i) => { location.hash = `#/fondo/${i}` },
    s: (i) => { if (!seguidos.has(i)) seguirFondo(i) },
    b: (i) => { const f = visibles.find((x) => x.isin === i); if (f) alternar(f) },
  })

  // filtros activos como pastillas: ✕ quita ese filtro (y los que dependen de él)
  const activos = ([
    [filtros.tipo, filtros.tipo, () => filtrar({ tipo: undefined, grupo: undefined, categoria: undefined })],
    [filtros.grupo, filtros.grupo, () => filtrar({ grupo: undefined, categoria: undefined })],
    [filtros.categoria, filtros.categoria, () => filtrar({ categoria: undefined })],
    [filtros.gestion, filtros.gestion, () => filtrar({ gestion: undefined })],
    [filtros.terMax, `TER ≤ ${cifra(filtros.terMax)} %`, () => filtrar({ terMax: undefined })],
    [filtros.srriMax, `SRRI ≤ ${filtros.srriMax}`, () => filtrar({ srriMax: undefined })],
    [filtros.anosMin, `≥ ${cifra(filtros.anosMin, 0)} años`, () => filtrar({ anosMin: undefined })],
    [filtros.patrimonioMin, `≥ ${cifra(filtros.patrimonioMin, 0)} M€`, () => filtrar({ patrimonioMin: undefined })],
    [filtros.divisa, filtros.divisa, () => filtrar({ divisa: undefined })],
    [filtros.soloMyinvestor, 'Solo MyInvestor', () => filtrar({ soloMyinvestor: undefined })],
    [carteraId, `Diversificar con ${carteras.find((c) => c.id === carteraId)?.nombre ?? 'su cartera'}`, () => { setCarteraId(''); setExcluirSuyos(false) }],
    [excluirSuyos, 'Sin los de la cartera', () => setExcluirSuyos(false)],
  ] as [unknown, string, () => void][]).filter(([v]) => v != null && v !== '' && v !== false)
  const quitarTodos = () => { setFiltros({}); setCarteraId(''); setExcluirSuyos(false); setMostrar(POR_PAGINA) }

  // la franja: cifras del resultado de los filtros (medianas de lo que pasa)
  const mi = puntuados.filter((f) => f.myinvestor).length
  const notas = puntuados.map((f) => f.nota)
  const ters = puntuados.map((f) => f.ter)
  const franja = monetarios ? [
    { etiqueta: 'Pasan los filtros', valor: cifra(puntuados.length, 0), pie: datos ? `de ${cifra(datos.length, 0)} fondos` : '' },
    { etiqueta: 'En MyInvestor', valor: cifra(mi, 0), pie: puntuados.length ? pct(mi / puntuados.length, 0, false) : '—' },
    { etiqueta: 'Rinde ahora, 3 meses (mediana)', valor: pct(mediana(puntuados.map((f) => cifraDe(f, '3m|rentabilidad'))), 2),
      pie: `mejor: ${pct(Math.max(...puntuados.map((f) => cifraDe(f, '3m|rentabilidad') ?? -Infinity)), 2)}` },
    { etiqueta: 'Por encima del €STR (mediana)', valor: pct(mediana(puntuados.map((f) => cifraDe(f, '3m|diferencial_estr'))), 2), pie: 'en % anual, neto de gastos' },
    { etiqueta: 'TER mediano', valor: ters.some((t) => t != null) ? `${cifra(mediana(ters))} %` : '—', pie: `mínimo ${cifra(Math.min(...ters.filter((t): t is number => t != null)))} %` },
  ] : [
    { etiqueta: 'Pasan los filtros', valor: cifra(puntuados.length, 0), pie: datos ? `de ${cifra(datos.length, 0)} fondos` : '' },
    { etiqueta: 'En MyInvestor', valor: cifra(mi, 0), pie: puntuados.length ? pct(mi / puntuados.length, 0, false) : '—' },
    { etiqueta: 'Nota mediana', valor: notas.some((n) => n != null) ? cifra(mediana(notas), 0) : '—', pie: notas.some((n) => n != null) ? `mejor: ${cifra(Math.max(...notas.filter((n): n is number => n != null)), 0)}` : '' },
    { etiqueta: 'TER mediano', valor: ters.some((t) => t != null) ? `${cifra(mediana(ters))} %` : '—', pie: ters.some((t) => t != null) ? `mínimo ${cifra(Math.min(...ters.filter((t): t is number => t != null)))} %` : '' },
    { etiqueta: '3 años, anual (mediana)', valor: pct(mediana(puntuados.map((f) => f.r3))), clase: tono(mediana(puntuados.map((f) => f.r3))), pie: 'de los que tienen 3 años' },
  ]

  const guardarPerfil = async () => {
    const nombre = nombrePerfil.trim()
    if (!nombre) return
    try {
      await q.guardarPerfil({ nombre, pesos, filtros, modo })
      setPerfiles(await q.perfiles())
      setNombrePerfil('')
      setGuardado(nombre)
    } catch (e) { falla(e as Error) }
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-x-8 gap-y-3">
        <div className="space-y-2">
          <p className="rotulo text-acento!">{monetarios ? 'Universo · vista monetarios: rendimiento reciente' : 'Universo · nota 0–100 dentro de su categoría'}</p>
          <h1 className="text-3xl! sm:text-4xl!">Screener</h1>
        </div>
        <div role="group" aria-label="Modo de ranking" className="flex gap-0.5 rounded-sm bg-borde/50 p-0.5 text-[12px]">
          {(['juntos', 'separados', 'indexados', 'activos'] as Modo[]).map((m) => (
            <button key={m} aria-pressed={modo === m} onClick={() => setModo(m)}
              className={`rounded-sm px-3 py-1 capitalize ${modo === m ? 'bg-panel text-texto ring-1 ring-borde' : 'text-suave hover:text-texto'}`}>{m}</button>
          ))}
        </div>
      </header>

      {datos ? <Franja cifras={franja} /> : <p className="text-suave">Cargando el universo…</p>}

      <div className="flex flex-wrap items-center gap-2">
        {perfiles.length > 0 && <span className="text-[12px] text-suave">Perfiles</span>}
        {perfiles.map((p) => (
          <button key={p.id} onClick={() => aplicarPerfil(String(p.id))}
            className="rounded-sm bg-borde/50 px-3 py-0.5 text-[12px] text-texto hover:bg-borde">{p.nombre}</button>
        ))}
        <span className="flex-1" />
        <button onClick={() => setPanel(panel === 'filtros' ? null : 'filtros')} aria-expanded={panel === 'filtros'}
          className={`flex min-h-8 items-center gap-1.5 rounded-sm px-4 ${panel === 'filtros' ? 'bg-acento text-sobre-acento' : 'bg-borde/50 text-texto hover:bg-borde'}`}>
          Filtros{activos.length > 0 && <span className={`grid h-[18px] min-w-[18px] place-items-center rounded-sm px-1 text-[11px] ${panel === 'filtros' ? 'bg-panel text-acento' : 'bg-acento text-sobre-acento'}`}>{activos.length}</span>}
        </button>
        <button onClick={() => setPanel(panel === 'pesos' ? null : 'pesos')} aria-expanded={panel === 'pesos'}
          className={`min-h-8 rounded-sm px-4 ${panel === 'pesos' ? 'bg-acento text-sobre-acento' : 'bg-borde/50 text-texto hover:bg-borde'}`}>
          Pesos · plazo {plazo ? plazo.toUpperCase() : 'auto'}
        </button>
      </div>

      {activos.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {activos.map(([, t, quitar]) => (
            <span key={t} className="flex items-center gap-1.5 rounded-sm bg-acento/12 px-2.5 py-0.5 text-[12px] text-acento">
              <span className="first-letter:uppercase">{t}</span>
              <button onClick={quitar} aria-label={`Quitar el filtro ${t}`} className="opacity-70 hover:text-baja hover:opacity-100">✕</button>
            </span>
          ))}
          <button onClick={quitarTodos} className="rounded-sm px-2 text-[12px] text-suave hover:text-texto">Quitar todos</button>
        </div>
      )}

      {panel === 'filtros' && (
        <Tarjeta>
          <div aria-label="Filtros" className="space-y-4">
            <div className="grid grid-cols-[minmax(0,1fr)] gap-x-8 gap-y-3 lg:grid-cols-[minmax(0,1fr)_19rem]">
              <div className="space-y-2.5">
                <h3 className="text-[12px] font-medium text-suave">Qué fondo</h3>
                <div className="grid grid-cols-[minmax(0,1fr)] items-baseline gap-x-4 gap-y-1.5 sm:grid-cols-[8rem_minmax(0,1fr)]">
                  <span className="text-[13px]">Tipo de activo</span>
                  <div className="flex flex-wrap gap-1.5">
                    {TIPOS.map((x) => <Opcion key={x} on={filtros.tipo === x} onClick={() => filtrar({ tipo: filtros.tipo === x ? undefined : x, grupo: undefined, categoria: undefined })}>{x}</Opcion>)}
                  </div>
                  {filtros.tipo && grupos(filtros.tipo).length > 0 && (
                    <>
                      <span className="text-[13px]">{NOMBRE_GRUPO[filtros.tipo]}</span>
                      <div className="flex flex-wrap gap-1.5">
                        {grupos(filtros.tipo).filter((g) => porGrupo.get(g)).map((g) => (
                          <Opcion key={g} on={filtros.grupo === g} onClick={() => filtrar({ grupo: filtros.grupo === g ? undefined : g, categoria: undefined })}>
                            {g === 'otros' ? 'resto' : g} <span className="opacity-60">{porGrupo.get(g)}</span>
                          </Opcion>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-2 lg:pt-6">
                <Campo etiqueta={`Categoría (${categorias.length})`}>
                  <select value={filtros.categoria ?? ''} onChange={(e) => filtrar({ categoria: e.target.value || undefined })} className={`${control} max-w-44`}>
                    <option value="">todas</option>
                    {categorias.map(([c, n]) => <option key={c} value={c}>{c} ({n})</option>)}
                  </select>
                </Campo>
                <Campo etiqueta="Gestión">
                  <select value={filtros.gestion ?? ''} onChange={(e) => filtrar({ gestion: (e.target.value || undefined) as Filtros['gestion'] })} className={control}>
                    <option value="">indexada y activa</option>
                    <option value="indexada">indexada</option>
                    <option value="activa">activa</option>
                  </select>
                </Campo>
              </div>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)] gap-x-8 gap-y-5 border-t border-borde pt-4 sm:grid-cols-3">
            <Grupo titulo="Coste y riesgo">
              <Campo etiqueta="TER máximo (%)"><CampoNumero valor={filtros.terMax} cambiar={(v) => filtrar({ terMax: v })} /></Campo>
              <Campo etiqueta="SRRI máximo">
                <span className="flex gap-0.5" role="group" aria-label="SRRI máximo">
                  {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                    <button key={i} onClick={() => filtrar({ srriMax: filtros.srriMax === i ? undefined : i })} aria-pressed={filtros.srriMax === i}
                      className={`grid h-5 w-5 place-items-center rounded-sm text-[11px] ${filtros.srriMax === i ? 'bg-acento text-sobre-acento' : filtros.srriMax != null && i < filtros.srriMax ? 'bg-acento/25 text-texto' : 'bg-borde/60 text-suave hover:text-texto'}`}>{i}</button>
                  ))}
                </span>
              </Campo>
              <Campo etiqueta="Antigüedad mínima (años)"><CampoNumero valor={filtros.anosMin} cambiar={(v) => filtrar({ anosMin: v })} /></Campo>
              <Campo etiqueta="Patrimonio mínimo (M€)"><CampoNumero valor={filtros.patrimonioMin} cambiar={(v) => filtrar({ patrimonioMin: v })} /></Campo>
            </Grupo>
            <Grupo titulo="Dónde y en qué divisa">
              <Campo etiqueta="Solo MyInvestor">
                <Opcion on={!!filtros.soloMyinvestor} onClick={() => filtrar({ soloMyinvestor: filtros.soloMyinvestor ? undefined : true })}>{filtros.soloMyinvestor ? 'sí' : 'no'}</Opcion>
              </Campo>
              <Campo etiqueta="Divisa">
                <select value={filtros.divisa ?? ''} onChange={(e) => filtrar({ divisa: e.target.value || undefined })} className={control}>
                  <option value="">todas</option>
                  {divisas.map((d) => <option key={d}>{d}</option>)}
                </select>
              </Campo>
            </Grupo>
            <Grupo titulo="Frente a una cartera">
              <Campo etiqueta="Diversificar con">
                <select value={carteraId} onChange={(e) => setCarteraId(e.target.value ? +e.target.value : '')} className={`${control} max-w-40`}>
                  <option value="">ninguna</option>
                  {carteras.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </Campo>
              <Campo etiqueta="Excluir los que ya tiene">
                <Opcion on={excluirSuyos} disabled={carteraId === ''} onClick={() => setExcluirSuyos(!excluirSuyos)}>{excluirSuyos ? 'sí' : 'no'}</Opcion>
              </Campo>
              <p className="text-[12px] text-suave">Con una cartera, la nota suma el bloque Diversificación.</p>
            </Grupo>
            </div>
          </div>
        </Tarjeta>
      )}
      {avisoDiv && <p role="status" className="text-[13px] text-aviso">{avisoDiv}</p>}

      {panel === 'pesos' && (
        <Tarjeta titulo="Pesos de la nota" extra={<div className="flex flex-wrap items-center gap-2">
          <label className="text-[12px] text-suave">Tipo{' '}
            <select value={tipoPesos} onChange={(e) => setTipoPesos(e.target.value as Tipo)} aria-label="Tipo de activo cuyos pesos se editan" className={`${control} text-[12px]`}>
              {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <div role="group" aria-label="Plazo de las métricas de la nota" className="flex gap-0.5 rounded-sm bg-borde/50 p-0.5 text-[12px]">
            {(['', ...PLAZOS] as const).map((p) => (
              <button key={p} aria-pressed={plazo === p} onClick={() => setPlazo(p)}
                className={`rounded-sm px-3 py-0.5 ${plazo === p ? 'bg-panel text-texto ring-1 ring-borde' : 'text-suave hover:text-texto'}`}>{p ? p.toUpperCase() : 'Auto'}</button>
            ))}
          </div></div>}>
          <div className="mb-3 flex h-2.5 gap-0.5 overflow-hidden rounded-sm bg-borde/60" aria-hidden="true">
            {BLOQUES.map((k) => <span key={k} style={{ width: `${pesoReal(k) * 100}%`, background: COLOR_BLOQUE[k] }} />)}
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            {BLOQUES.map((k) => (
              <label key={k} className={`grid grid-cols-[10px_1fr_auto] items-center gap-x-2 gap-y-1 text-[13px] ${k === 'diversificacion' && !div ? 'text-suave' : ''}`}>
                <i aria-hidden="true" className="h-2.5 w-2.5 rounded-sm" style={{ background: COLOR_BLOQUE[k] }} />
                <span>{NOMBRE_BLOQUE[k]}</span><span className="text-right tabular">{k === 'diversificacion' && !div ? '—' : `${Math.round(pesoReal(k) * 100)} %`}</span>
                <input type="range" min={0} max={50} value={editados[k]} disabled={k === 'diversificacion' && !div} aria-label={`Peso de ${NOMBRE_BLOQUE[k]}`}
                  onChange={(e) => setPesos((p) => ({ ...p, [tipoPesos]: { ...p[tipoPesos], [k]: +e.target.value } }))} className="col-start-2 col-end-4 accent-acento" />
              </label>
            ))}
          </div>
          <p className="mt-3 text-[12px] text-suave">
            Cada tipo de activo tiene sus pesos: estos son los de {tipoPesos}{filtros.tipo ? '' : ' (con todos los tipos a la vista, cada fondo usa los de su tipo)'}.{' '}
            {plazo ? `Métricas a ${anos(plazo)}; los fondos sin ese historial no tienen nota.` : 'Plazo auto: el más largo de cada fondo (5 años, o 3), como la nota guardada y las señales.'}{' '}
            {div ? 'Diversificación: 1 − correlación media con los fondos de la cartera elegida (3 años), en percentil de su categoría.' : 'Sin cartera elegida, el peso de Diversificación se reparte entre los demás.'}
          </p>
          <form onSubmit={(e) => { e.preventDefault(); guardarPerfil() }} className="mt-3 flex flex-wrap items-center gap-2 border-t border-borde pt-3">
            <label htmlFor="nombre-perfil" className="text-[13px] text-suave">Guardar como perfil</label>
            <input id="nombre-perfil" value={nombrePerfil} onChange={(e) => { setNombrePerfil(e.target.value); setGuardado('') }}
              placeholder="Nombre (si ya existe, se sustituye)" className={`${control} min-w-0 flex-1 sm:max-w-72`} />
            <button type="submit" disabled={!nombrePerfil.trim()} className="boton-pri">Guardar</button>
            <button type="button" onClick={() => setPesos(PESOS_TIPO_DEFECTO)} className="boton">Pesos por defecto (todos los tipos)</button>
            {guardado && <span role="status" className="text-[13px] text-sube">Guardado «{guardado}»: guarda pesos, filtros y modo.</span>}
          </form>
        </Tarjeta>
      )}
      {error && <p className="text-baja">{error}</p>}

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="min-w-0 space-y-4">
          {listas.map(([titulo, filas]) => (
            <Tarjeta key={titulo} titulo={titulo ? `${titulo} · ${filas.length}` : undefined}>
              {monetarios
                ? <TablaMonetarios filas={filas.slice(0, mostrar)} sel={sel} setSel={setSel} seguidos={seguidos} seguir={seguirFondo} conCategoria={!filtros.categoria} orden={ordenEf} setOrden={setOrden} />
                : <Tabla filas={filas.slice(0, mostrar)} sel={sel} setSel={setSel} seguidos={seguidos} seguir={seguirFondo} conCategoria={!filtros.categoria} orden={ordenEf} setOrden={setOrden} pocos={pocos} plazo={plazo} pesos={pesos} />}
              {filas.length > mostrar && (
                <button onClick={() => setMostrar((n) => n + POR_PAGINA)} className="boton mt-3 text-[13px]">Ver {Math.min(POR_PAGINA, filas.length - mostrar)} más</button>
              )}
            </Tarjeta>
          ))}
          <p className="text-[12px] text-suave">
            {monetarios
              ? 'Monetarios. Último mes, 2 y 3 meses: lo que ha ganado el fondo en ese tiempo, pasado a un año, para ver lo que rinde ahora (neto de gastos). «3 meses vs €STR»: puntos por encima del tipo del BCE. «12 meses»: lo que ha ganado de verdad en el último año. En clases de distribución el cupón no entra y la cifra sale baja. Pasa el cursor por una cifra para ver su percentil.'
              : 'La barra de la nota se reparte por bloques, con los colores de los pesos. 3A: métricas a 3 años · «de N»: categoría con pocos fondos · ★ ya en seguimiento. Al final, los fondos con menos de 3 años, sin nota. Sin gestión conocida, un fondo cuenta como activo.'}
          </p>
        </div>
        {elegido && (
          <aside className="lg:sticky lg:top-16 lg:max-h-[calc(100dvh-6.5rem)] lg:overflow-y-auto lg:overscroll-contain">
            <TarjetaFondo f={elegido} todos={todos} plazo={plazo} colores={COLOR_BLOQUE} monetario={monetarios} cats={cats} pocos={pocos(elegido)}
              seguido={seguidos.has(elegido.isin)} seguir={() => seguirFondo(elegido.isin)} senales={senales.get(elegido.isin) ?? []}
              elegir={(i) => { if (visibles.some((x) => x.isin === i)) setSel(i); else location.hash = `#/fondo/${i}` }} />
          </aside>
        )}
      </div>
    </div>
  )
}

/** Grupo del panel de filtros. */
const Grupo = ({ titulo, children }: { titulo: string; children: React.ReactNode }) => (
  <div className="flex flex-col gap-2">
    <h3 className="text-[12px] font-medium text-suave">{titulo}</h3>
    {children}
  </div>
)
/** Línea de filtro: etiqueta a la izquierda, control a la derecha. */
const Campo = ({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) => (
  <label className="flex items-center justify-between gap-3 border-b border-borde/70 pb-1.5 text-[13px]">
    <span>{etiqueta}</span>{children}
  </label>
)
/** Pastilla que se activa o desactiva. */
const Opcion = ({ on, onClick, disabled, children }: { on: boolean; onClick: () => void; disabled?: boolean; children: React.ReactNode }) => (
  <button type="button" onClick={onClick} aria-pressed={on} disabled={disabled}
    className={`rounded-sm px-2.5 py-0.5 text-[12px] first-letter:uppercase disabled:opacity-50 ${on ? 'bg-acento text-sobre-acento' : 'bg-borde/50 text-texto hover:bg-borde'}`}>{children}</button>
)

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
  return <input inputMode="decimal" value={texto} onChange={(e) => { setTexto(e.target.value); cambiar(numero(e.target.value)) }} className={`${control} w-20 text-right`} />
}

type PropsTabla = {
  filas: Puntuado[]; sel: string | null; setSel: (i: string) => void; seguidos: Set<string>; seguir: (i: string) => void; conCategoria: boolean
  orden: Orden; setOrden: (o: Orden) => void
}

/** Cabecera ordenable: la flecha dice hacia dónde (↑ de menor a mayor, para las cifras donde menos es mejor). */
function Cabecera({ o, texto, titulo, orden, setOrden, clase = '' }: { o: Orden; texto: string; titulo?: string; orden: Orden; setOrden: (o: Orden) => void; clase?: string }) {
  const sube = o !== 'nota' && COLUMNAS[o][1]
  return (
    <th className={`pb-1.5 pl-3 font-normal whitespace-nowrap ${clase}`} title={titulo} aria-sort={orden === o ? (sube ? 'ascending' : 'descending') : 'none'}>
      <button onClick={() => setOrden(o)} className={orden === o ? 'text-acento' : 'hover:text-texto'}>{texto}{orden === o ? (sube ? ' ↑' : ' ↓') : ''}</button>
    </th>
  )
}

/** Nombre, etiquetas y categoría de un fondo en la lista. */
function CeldaFondo({ f, conCategoria, extra }: { f: Puntuado; conCategoria: boolean; extra?: React.ReactNode }) {
  return (
    <td className="whitespace-normal py-2 pl-3 text-left">
      <a href={`#/fondo/${f.isin}`} onClick={(e) => e.stopPropagation()} className="hover:text-acento">{f.nombre}</a>
      {f.myinvestor && <span className="ml-1.5 rounded-sm bg-acento/15 px-1.5 align-[1px] text-[10px] text-acento" title="Se puede comprar en MyInvestor">MI</span>}
      {(f.divisa !== 'EUR' || cubierta(f.nombre)) && <span className="ml-1.5 rounded-sm bg-borde/60 px-1.5 align-[1px] text-[10px] text-suave">{f.divisa}{cubierta(f.nombre) && ' cubierta'}</span>}
      {extra}
      {conCategoria && <span className="block text-[12px] text-suave">{f.categoria}</span>}
    </td>
  )
}

function Fila({ f, i, sel, setSel, seguidos, seguir, children }: { f: Puntuado; i: number | null; sel: string | null; setSel: (i: string) => void; seguidos: Set<string>; seguir: (i: string) => void; children: React.ReactNode }) {
  const elegida = sel === f.isin
  return (
    <tr data-isin={f.isin} aria-selected={elegida} onClick={() => setSel(f.isin)}
      className={`cursor-pointer border-t border-borde/60 ${elegida ? 'bg-acento/8' : 'hover:bg-borde/25'}`}>
      <td className={`py-2 pl-1 text-left text-suave ${elegida ? 'shadow-[inset_2px_0_0_var(--color-acento)]' : ''}`}>{i ?? ''}</td>
      {children}
      <td className="pl-2">
        <button onClick={(e) => { e.stopPropagation(); if (!seguidos.has(f.isin)) seguir(f.isin) }} aria-label={seguidos.has(f.isin) ? 'En seguimiento' : 'Añadir a seguimiento'}
          className={`min-h-7 min-w-7 rounded-sm ${seguidos.has(f.isin) ? 'text-aviso' : 'text-suave hover:bg-borde/50 hover:text-acento'}`}>{seguidos.has(f.isin) ? '★' : '+'}</button>
      </td>
    </tr>
  )
}

/** Cifra con su percentil en la categoría al pasar el cursor. */
const ConPct = ({ v, p, texto, clase = '' }: { v: number | null; p: number | null; texto: string; clase?: string }) =>
  <td className={`pl-3 ${v == null ? 'text-suave' : clase}`} title={p == null ? undefined : `Percentil ${Math.round(p)} en su categoría (100 = mejor)`}>{v == null ? '—' : texto}</td>

function Tabla({ filas, sel, setSel, seguidos, seguir, conCategoria, orden, setOrden, pocos, plazo, pesos }: PropsTabla & { pocos: (f: Puntuado) => number; plazo: Plazo | ''; pesos: PesosTipo }) {
  const cab = { orden, setOrden }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[46rem] whitespace-nowrap text-right text-[13px] tabular">
        <thead className="text-[12px] text-suave">
          <tr>
            <th className="w-8 pb-1.5 pl-1 text-left font-normal">#</th>
            <th className="pb-1.5 pl-3 text-left font-normal">Fondo</th>
            <Cabecera o="nota" texto="Nota" clase="text-left" {...cab} />
            <Cabecera o="ter" texto="TER" {...cab} />
            <Cabecera o="r3" texto="3 años" titulo="Rentabilidad anualizada a 3 años" {...cab} />
            <Cabecera o="r5" texto="5 años" titulo="Rentabilidad anualizada a 5 años" {...cab} />
            <Cabecera o="v3" texto="Volat. 3a" titulo="Volatilidad a 3 años" {...cab} />
            <Cabecera o="s3" texto="Sharpe 3a" titulo="Sharpe a 3 años" {...cab} />
            <th className="relative w-8"><span className="sr-only">Seguir</span></th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => {
            const w = pesosEfectivos(f.bloques, pesos[tipoActivo(f.categoria)])
            return (
              <Fila key={f.isin} f={f} i={f.nota == null && orden === 'nota' ? null : i + 1} sel={sel} setSel={setSel} seguidos={seguidos} seguir={seguir}>
                <CeldaFondo f={f} conCategoria={conCategoria} extra={<>
                  {f.solo3a && <span className="ml-1.5 rounded-sm bg-aviso/15 px-1.5 align-[1px] text-[10px] text-aviso" title="Menos de 5 años: métricas a 3 años">3A</span>}
                  {pocos(f) > 0 && <span className="ml-1.5 rounded-sm bg-aviso/15 px-1.5 align-[1px] text-[10px] text-aviso" title={`Su categoría solo tiene ${pocos(f)} fondos en el universo: el percentil dice poco`}>de {pocos(f)}</span>}
                </>} />
                <td className="pl-3 text-left">
                  {f.nota == null ? <span className="text-[12px] text-suave">{plazo ? `sin ${anos(plazo)}` : 'sin historial'}</span> : (
                    <span className="inline-flex items-center gap-2">
                      <span className="cifra w-7 text-right text-xl leading-none">{Math.round(f.nota)}</span>
                      <span aria-hidden className="flex h-1.5 w-20 gap-px overflow-hidden rounded-sm bg-borde/60">
                        {BLOQUES.filter((k) => w[k]).map((k) => <span key={k} style={{ width: `${w[k]! * f.bloques[k]!}%`, background: COLOR_BLOQUE[k] }} />)}
                      </span>
                    </span>
                  )}
                </td>
                <td className="pl-3">{f.ter == null ? <span className="text-suave">—</span> : `${cifra(f.ter)} %`}</td>
                {[f.r3, f.r5].map((r, j) => <td key={j} className={`pl-3 ${tono(r)}`}>{r == null ? '—' : pct(r)}</td>)}
                <ConPct v={cifraDe(f, '3a|volatilidad')} p={percentilDe(f, '3a|volatilidad')} texto={pct(cifraDe(f, '3a|volatilidad'), 1, false)} />
                <ConPct v={cifraDe(f, '3a|sharpe')} p={percentilDe(f, '3a|sharpe')} texto={cifra(cifraDe(f, '3a|sharpe'))} />
              </Fila>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** Vista Monetarios: rendimiento reciente en lugar de la nota (especificación, «Vista Monetarios»). */
function TablaMonetarios({ filas, sel, setSel, seguidos, seguir, conCategoria, orden, setOrden }: PropsTabla) {
  const cab = { orden, setOrden }
  const c = (f: Puntuado, k: string) => [cifraDe(f, k), percentilDe(f, k)] as const
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[50rem] whitespace-nowrap text-right text-[13px] tabular">
        <thead className="text-[12px] text-suave">
          <tr className="text-[11px]">
            <th colSpan={2} />
            <th colSpan={3} className="border-b border-borde pb-1 pl-3 text-center font-normal">Lo que rinde ahora, en % anual</th>
            <th colSpan={5} />
          </tr>
          <tr>
            <th className="w-8 pb-1.5 pl-1 text-left font-normal">#</th>
            <th className="pb-1.5 pl-3 text-left font-normal">Fondo</th>
            <Cabecera o="m1" texto="Último mes" titulo="Lo que ha ganado el último mes, pasado a un año (% anual)" {...cab} />
            <Cabecera o="m2" texto="2 meses" titulo="Lo que ha ganado en los últimos 2 meses, pasado a un año (% anual)" {...cab} />
            <Cabecera o="m3" texto="3 meses" titulo="Lo que ha ganado en los últimos 3 meses, pasado a un año (% anual)" {...cab} />
            <Cabecera o="dif" texto="vs €STR" titulo="3 meses: puntos que rinde por encima (o por debajo) del €STR medio de esos 3 meses" {...cab} />
            <Cabecera o="m12" texto="12 meses" titulo="Lo que ha ganado de verdad en los últimos 12 meses" {...cab} />
            <Cabecera o="mneg" texto="Meses < 0" titulo="Meses naturales en pérdidas en los últimos 12; un monetario no debería tener ninguno" {...cab} />
            <Cabecera o="ter" texto="TER" {...cab} />
            <th className="relative w-8"><span className="sr-only">Seguir</span></th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => {
            const [dif, pDif] = c(f, '3m|diferencial_estr')
            const [neg, pNeg] = c(f, '12m|meses_negativos')
            return (
              <Fila key={f.isin} f={f} i={i + 1} sel={sel} setSel={setSel} seguidos={seguidos} seguir={seguir}>
                <CeldaFondo f={f} conCategoria={conCategoria} />
                {(['1m|rentabilidad', '2m|rentabilidad', '3m|rentabilidad'] as const).map((k) => {
                  const [v, p] = c(f, k)
                  return <ConPct key={k} v={v} p={p} texto={pct(v, 2, false)} clase={k === '3m|rentabilidad' ? 'font-medium' : ''} />
                })}
                <ConPct v={dif} p={pDif} texto={pct(dif, 2)} clase={tono(dif)} />
                <ConPct v={cifraDe(f, '1a|rentabilidad')} p={percentilDe(f, '1a|rentabilidad')} texto={pct(cifraDe(f, '1a|rentabilidad'), 2, false)} />
                <ConPct v={neg} p={pNeg} texto={cifra(neg, 0)} clase={neg ? 'text-baja' : ''} />
                <td className="pl-3">{f.ter == null ? <span className="text-suave">—</span> : `${cifra(f.ter)} %`}</td>
              </Fila>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
