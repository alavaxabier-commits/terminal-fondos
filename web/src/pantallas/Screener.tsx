import { useEffect, useMemo, useState } from 'react'
import { cifra, hoy, pct } from '../calculo/formato'
import { aPesosTipo, BLOQUES, GRUPOS_PESOS, NOMBRE_BLOQUE, PESOS_TIPO_DEFECTO, PLAZOS, type Bloque, type GrupoPesos, type PesosTipo, type Plazo } from '../calculo/nota'
import { cifraDe, COLUMNAS, cubierta, DE_MONETARIOS, deModo, grupo, grupos, indexada, NOMBRE_GRUPO, mediana, MIN_CATEGORIA, ordenar, pasa, percentilDe, puntuar, tipoActivo, TIPOS, type Filtros, type Modo, type Orden, type Puntuado } from '../calculo/screener'
import Franja from '../componentes/Franja'
import { movimiento, tintas, ultimaSemana, viejo, type Puestos } from '../calculo/jornada'
import Tarjeta from '../componentes/Tarjeta'
import TarjetaFondo from '../componentes/TarjetaFondo'
import type { Senal } from '../calculo/senales'
import { revisar } from '../datos/revision'
import { useTeclasLista } from '../componentes/teclas'
import { alternar } from '../datos/bandeja'
import * as q from '../datos/consultas'
import Fallo from '../componentes/Fallo'

const POR_PAGINA = 100
type Gestion = 'todas' | 'indexada' | 'activa' | 'separados'
const GESTIONES: [Gestion, string, string][] = [['todas', 'Todas', ''], ['indexada', 'Indexadas', 'indexadas'], ['activa', 'Activas', 'activas'], ['separados', 'Separadas', 'separadas']]
type Panel = 'perfil' | 'liga' | 'cartera' | 'coste' | 'donde' | 'pesos' | null
/** Lo de la jornada que necesitan las filas: puestos de la nota guardada, carteras de cada fondo y la tinta de cada cartera. */
type Jornada = { puestos: Map<string, Puestos>; ultima: string; carteras: Map<string, { id: number; nombre: string }[]>; tinta: Map<number, string> }
const fechaCorta = (f: string) => new Date(f + 'T12:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
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
type Guardado = { pesos: PesosTipo; tipoPesos: GrupoPesos; filtros: Filtros; modo: Modo; carteraId: number | ''; excluirSuyos: boolean; sel: string | null; mostrar: number; orden: Orden; plazo: Plazo | ''; y: number }
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
  // pesos que se editan: los del tipo del filtro, o los de indexados si se filtra por ellos
  const [tipoPesos, setTipoPesos] = useState<GrupoPesos>(g.tipoPesos ?? 'renta variable')
  const [filtros, setFiltros] = useState<Filtros>(() => deModo(g.modo, g.filtros ?? { soloMyinvestor: true }).filtros)
  const [modo, setModo] = useState<Modo>(() => deModo(g.modo, g.filtros ?? { soloMyinvestor: true }).modo)
  const [carteraId, setCarteraId] = useState<number | ''>(g.carteraId ?? '')
  const [enCartera, setEnCartera] = useState<Set<string>>(new Set())
  const [excluirSuyos, setExcluirSuyos] = useState(g.excluirSuyos ?? false)
  const [div, setDiv] = useState<Map<string, number> | undefined>(undefined)
  const [avisoDiv, setAvisoDiv] = useState<string | null>(null)
  const [sel, setSel] = useState<string | null>(g.sel ?? null)
  const [mostrar, setMostrar] = useState(g.mostrar ?? POR_PAGINA)
  const [orden, setOrden] = useState<Orden>(g.orden ?? 'nota')
  const [plazo, setPlazo] = useState<Plazo | ''>(g.plazo ?? '')
  const [panel, setPanel] = useState<Panel>(null)
  const [cats, setCats] = useState<Awaited<ReturnType<typeof q.categoriasReferencia>> | null>(null)
  const [senales, setSenales] = useState<Map<string, Senal[]>>(new Map())
  const [puestos, setPuestos] = useState<Map<string, Puestos> | null>(null)
  const [errorJornada, setErrorJornada] = useState('')
  const [deCarteras, setDeCarteras] = useState<Map<string, { id: number; nombre: string }[]>>(new Map())
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
    // la jornada: si falla, la tabla sale sin puestos ni movimientos y se avisa encima de la tabla
    q.puestos().then(setPuestos).catch((e: Error) => { setPuestos(new Map()); setErrorJornada(e.message) })
    q.fondosEnCarteras().then(setDeCarteras).catch(falla)
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
  useEffect(() => { if (filtros.gestion === 'indexada') setTipoPesos('indexados'); else if (filtros.tipo) setTipoPesos(filtros.tipo) }, [filtros.tipo, filtros.gestion])
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
    : [['', puntuados]]
  // lo que pesa de verdad cada bloque: su barra entre la suma de las barras (sin Diversificación si no hay cartera)
  const editados = pesos[tipoPesos]
  const totalPesos = BLOQUES.reduce((s, k) => s + (k === 'diversificacion' && !div ? 0 : editados[k]), 0)
  const pesoReal = (k: Bloque) => (k === 'diversificacion' && !div ? 0 : editados[k] / (totalPesos || 1))
  const elegido = puntuados.find((f) => f.isin === sel) ?? null
  const jornada = useMemo<Jornada>(() => ({
    puestos: puestos ?? new Map(), ultima: ultimaSemana((puestos ?? new Map()).values()), carteras: deCarteras, tinta: tintas(carteras.map((c) => c.id)),
  }), [puestos, deCarteras, carteras])
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
    const x = deModo(p.modo, p.filtros as Filtros)
    setFiltros(x.filtros)
    setModo(x.modo)
  }
  useEffect(() => {
    if (!panel) return
    const fuera = (e: MouseEvent) => { if (!(e.target as Element).closest('[data-desplegable]')) setPanel(null) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setPanel(null) }
    addEventListener('mousedown', fuera); addEventListener('keydown', esc)
    return () => { removeEventListener('mousedown', fuera); removeEventListener('keydown', esc) }
  }, [panel])
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

  // gestión: un solo control para el filtro (indexadas o activas) y para verlas en dos tablas
  const gestionVista: Gestion = modo === 'separados' ? 'separados' : filtros.gestion ?? 'todas'
  const elegirGestion = (k: Gestion) => { setModo(k === 'separados' ? 'separados' : 'juntos'); filtrar({ gestion: k === 'indexada' || k === 'activa' ? k : undefined }) }
  // la barra: cada desplegable con lo que tiene puesto; en azul si tiene algo distinto de lo de por defecto
  const unir = (xs: unknown[]) => xs.filter(Boolean).join(' · ')
  const nombreCartera = carteras.find((c) => c.id === carteraId)?.nombre
  const mayorPeso = [...BLOQUES].sort((a, b) => pesoReal(b) - pesoReal(a))[0]
  const desplegables: { k: Exclude<Panel, null>; t: string; v: string; puesto: boolean; no?: boolean }[] = [
    { k: 'perfil', t: 'Perfil', v: perfiles.length ? `${perfiles.length} guardado${perfiles.length > 1 ? 's' : ''}` : 'ninguno', puesto: false },
    { k: 'liga', t: 'Categoría', v: unir([filtros.categoria, GESTIONES.find(([k]) => k === gestionVista)?.[2]]) || 'todas',
      puesto: !!(filtros.categoria || filtros.gestion) || modo !== 'juntos' },
    { k: 'cartera', t: 'Cartera', v: nombreCartera ? `${nombreCartera}${excluirSuyos ? ' · sin los suyos' : ''}` : 'ninguna', puesto: carteraId !== '' },
    { k: 'coste', t: 'Coste y riesgo', v: unir([filtros.terMax != null && `TER ≤ ${cifra(filtros.terMax)} %`, filtros.srriMax && `SRRI ≤ ${filtros.srriMax}`,
      filtros.anosMin != null && `≥ ${cifra(filtros.anosMin, 0)} años`, filtros.patrimonioMin != null && `≥ ${cifra(filtros.patrimonioMin, 0)} M€`]) || 'sin límites',
      puesto: filtros.terMax != null || !!filtros.srriMax || filtros.anosMin != null || filtros.patrimonioMin != null },
    { k: 'donde', t: 'Dónde', v: unir([filtros.soloMyinvestor && 'solo MyInvestor', filtros.divisa]) || 'todos', puesto: !!(filtros.soloMyinvestor || filtros.divisa) },
    { k: 'pesos', t: 'Pesos', v: monetarios ? 'no se usan en monetarios' : `${plazo ? plazo.toUpperCase() : 'auto'} · ${NOMBRE_BLOQUE[mayorPeso].toLowerCase()} ${Math.round(pesoReal(mayorPeso) * 100)} %`,
      puesto: !!plazo, no: monetarios },
  ]
  const abrir = (k: Panel) => setPanel(panel === k ? null : k)

  const existe = perfiles.find((p) => p.nombre === nombrePerfil.trim())
  const contenido: Record<Exclude<Panel, null>, React.ReactNode> = {
    perfil: (
      <div className="space-y-3">
        {perfiles.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {perfiles.map((p) => <button key={p.id} onClick={() => aplicarPerfil(String(p.id))} className="boton min-h-8 text-[13px]">{p.nombre}</button>)}
          </div>
        ) : <p className="text-[13px] text-suave">Aún no hay perfiles: guarda los filtros y los pesos de ahora.</p>}
        <form onSubmit={(e) => { e.preventDefault(); guardarPerfil() }} className="flex flex-wrap items-center gap-2 border-t border-borde pt-3">
          <label htmlFor="nombre-perfil" className="sr-only">Nombre del perfil</label>
          <input id="nombre-perfil" value={nombrePerfil} onChange={(e) => { setNombrePerfil(e.target.value); setGuardado('') }}
            placeholder="Nombre del perfil" className={`${control} min-w-0 flex-1`} />
          <button type="submit" disabled={!nombrePerfil.trim()} className="boton-pri">{existe ? 'Sustituir' : 'Guardar'}</button>
        </form>
        {existe && !guardado && <p role="status" className="text-[13px] text-aviso">Ya hay un perfil «{existe.nombre}»: se sustituirán sus pesos y filtros.</p>}
        {guardado && <p role="status" className="text-[13px] text-sube">Guardado «{guardado}»: guarda pesos y filtros.</p>}
      </div>
    ),
    liga: (
      <div className="space-y-2.5">
        <Campo etiqueta={`Categoría (${categorias.length})`}>
          <select value={filtros.categoria ?? ''} onChange={(e) => filtrar({ categoria: e.target.value || undefined })} className={`${control} max-w-52`}>
            <option value="">todas</option>
            {categorias.map(([c, n]) => <option key={c} value={c}>{c} ({n})</option>)}
          </select>
        </Campo>
        <div className="space-y-1.5">
          <span className="text-[13px]">Gestión</span>
          <div role="group" aria-label="Gestión" className="flex gap-0.5 rounded-sm bg-borde/50 p-0.5 text-[12px]">
            {GESTIONES.map(([k, t]) => (
              <button key={k} aria-pressed={gestionVista === k} onClick={() => elegirGestion(k)}
                className={`flex-1 rounded-sm px-2 py-1 ${gestionVista === k ? 'bg-panel text-texto ring-1 ring-borde' : 'text-suave hover:text-texto'}`}>{t}</button>
            ))}
          </div>
          <p className="text-[12px] text-suave">«Separadas»: dos tablas, indexados y activos. Sin gestión conocida, un fondo cuenta como activo.</p>
        </div>
      </div>
    ),
    cartera: (
      <div className="space-y-2.5">
        <Campo etiqueta="Diversificar con">
          <select value={carteraId} onChange={(e) => setCarteraId(e.target.value ? +e.target.value : '')} className={`${control} max-w-44`}>
            <option value="">ninguna</option>
            {carteras.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Excluir los que ya tiene">
          <Opcion on={excluirSuyos} disabled={carteraId === ''} onClick={() => setExcluirSuyos(!excluirSuyos)}>{excluirSuyos ? 'sí' : 'no'}</Opcion>
        </Campo>
        <p className="text-[12px] text-suave">Con una cartera, la nota suma el bloque Diversificación.</p>
      </div>
    ),
    coste: (
      <div className="space-y-2.5">
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
      </div>
    ),
    donde: (
      <div className="space-y-2.5">
        <Campo etiqueta="Solo MyInvestor">
          <Opcion on={!!filtros.soloMyinvestor} onClick={() => filtrar({ soloMyinvestor: filtros.soloMyinvestor ? undefined : true })}>{filtros.soloMyinvestor ? 'sí' : 'no'}</Opcion>
        </Campo>
        <Campo etiqueta="Divisa">
          <select value={filtros.divisa ?? ''} onChange={(e) => filtrar({ divisa: e.target.value || undefined })} className={control}>
            <option value="">todas</option>
            {divisas.map((d) => <option key={d}>{d}</option>)}
          </select>
        </Campo>
      </div>
    ),
    pesos: (
      <div className="space-y-3">
        <Campo etiqueta="Pesos de">
          <select value={tipoPesos} onChange={(e) => setTipoPesos(e.target.value as GrupoPesos)} aria-label="Pesos que se editan" className={control}>
            {GRUPOS_PESOS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Campo>
        <div role="group" aria-label="Plazo de las métricas de la nota" className="flex gap-0.5 rounded-sm bg-borde/50 p-0.5 text-[12px]">
          {(['', ...PLAZOS] as const).map((p) => (
            <button key={p} aria-pressed={plazo === p} onClick={() => setPlazo(p)}
              className={`flex-1 rounded-sm px-2 py-0.5 ${plazo === p ? 'bg-panel text-texto ring-1 ring-borde' : 'text-suave hover:text-texto'}`}>{p ? p.toUpperCase() : 'Auto'}</button>
          ))}
        </div>
        {BLOQUES.map((k) => (
          <label key={k} className={`grid grid-cols-[10px_1fr_auto] items-center gap-x-2 gap-y-1 text-[13px] ${k === 'diversificacion' && !div ? 'text-suave' : ''}`}>
            <i aria-hidden="true" className="h-2.5 w-2.5 rounded-sm" style={{ background: COLOR_BLOQUE[k] }} />
            <span>{NOMBRE_BLOQUE[k]}</span><span className="text-right tabular">{k === 'diversificacion' && !div ? '—' : `${Math.round(pesoReal(k) * 100)} %`}</span>
            <input type="range" min={0} max={50} value={editados[k]} disabled={k === 'diversificacion' && !div} aria-label={`Peso de ${NOMBRE_BLOQUE[k]}`}
              onChange={(e) => setPesos((p) => ({ ...p, [tipoPesos]: { ...p[tipoPesos], [k]: +e.target.value } }))} className="col-start-2 col-end-4 accent-acento" />
          </label>
        ))}
        <p className="text-[12px] text-suave">
          Cada fondo usa los pesos de su grupo (los indexados, los suyos); estos son los de {tipoPesos}.{' '}
          {plazo ? `Métricas a ${anos(plazo)}; los fondos sin ese historial no tienen nota.` : 'Plazo auto: el más largo de cada fondo (5 años, o 3), como la nota guardada.'}{' '}
          {div ? 'Diversificación: 1 − correlación media con la cartera elegida (3 años), en percentil de su categoría.' : 'Diversificación necesita una cartera (en «Cartera»).'}
        </p>
        <button type="button" onClick={() => setPesos(PESOS_TIPO_DEFECTO)} className="boton w-full text-[13px]">Pesos por defecto (todos los tipos)</button>
      </div>
    ),
  }
  const titulos: Record<Exclude<Panel, null>, string> = { perfil: 'Perfil', liga: 'Categoría', cartera: 'Frente a una cartera', coste: 'Coste y riesgo', donde: 'Dónde', pesos: 'Pesos de la nota' }
  // un desplegable no bloquea: la tabla se recalcula con él abierto; se cierra con ✕, Esc o al pulsar fuera
  // función, no componente: definido aquí dentro se volvería a montar en cada cambio y los campos perderían el foco
  const desplegable = (k: Exclude<Panel, null>, clase: string) => (
    <div data-desplegable role="dialog" aria-label={titulos[k]} className={`aparece z-20 border border-texto bg-panel p-4 ${clase}`}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="estrecha text-[17px] font-bold uppercase tracking-[0.02em]">{titulos[k]}</h2>
        <button onClick={() => setPanel(null)} aria-label="Cerrar" className="min-h-7 min-w-7 text-suave hover:text-texto">✕</button>
      </div>
      {contenido[k]}
    </div>
  )

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-3xl! sm:text-4xl!">Screener</h1>
        <p className="text-[13px] text-suave">{monetarios ? 'Vista monetarios: rendimiento reciente.' : 'Nota de 0 a 100 de cada fondo frente a los de su categoría.'}</p>
      </header>

      {/* Pestañas de liga: el tipo de activo (solo aquí). */}
      <div role="group" aria-label="Tipo de activo" className="flex gap-0.5 overflow-x-auto border-b-2 border-texto">
        {([undefined, ...TIPOS] as (Filtros['tipo'] | undefined)[]).map((t) => (
          <button key={t ?? 'todos'} aria-pressed={filtros.tipo === t} onClick={() => filtrar({ tipo: t, grupo: undefined, categoria: undefined })}
            className={`estrecha whitespace-nowrap px-3.5 pb-1 pt-1.5 text-[15px] font-bold uppercase ${filtros.tipo === t ? 'bg-texto text-fondo' : 'bg-borde/60 text-texto hover:bg-borde'}`}>
            {t ?? 'Todos'}
          </button>
        ))}
      </div>

      {/* Segundo nivel de la liga: el grupo del tipo elegido (región o estilo, tipo de bono, perfil), siempre a la vista. */}
      {filtros.tipo && grupos(filtros.tipo).length > 0 && (
        <div role="group" aria-label={NOMBRE_GRUPO[filtros.tipo]} className="-mt-2 flex flex-wrap items-center gap-1.5">
          <span className="rotulo mr-1">{NOMBRE_GRUPO[filtros.tipo]}</span>
          <Opcion on={!filtros.grupo} onClick={() => filtrar({ grupo: undefined, categoria: undefined })}>todos</Opcion>
          {grupos(filtros.tipo).filter((g) => porGrupo.get(g)).map((g) => (
            <Opcion key={g} on={filtros.grupo === g} onClick={() => filtrar({ grupo: filtros.grupo === g ? undefined : g, categoria: undefined })}>
              {g === 'otros' ? 'resto' : g} <span className="opacity-60">{porGrupo.get(g)}</span>
            </Opcion>
          ))}
        </div>
      )}

      {datos ? <Franja cifras={franja} /> : <p className="text-suave">Cargando el universo…</p>}

      {/* Filtros y pesos: un botón por grupo con lo que tiene puesto; cada uno abre su desplegable. */}
      <div role="toolbar" aria-label="Filtros y pesos" className="flex flex-wrap items-center gap-1.5">
        {desplegables.map((d) => (
          <div key={d.k} data-desplegable className="relative">
            <button onClick={() => abrir(d.k)} aria-expanded={panel === d.k} disabled={d.no}
              className={`flex min-h-8 max-w-[26rem] items-center gap-1.5 rounded-sm border px-2.5 text-[13px] disabled:opacity-60 ${panel === d.k ? 'border-texto bg-texto text-fondo'
                : d.puesto ? 'border-acento/30 bg-acento/10 text-acento hover:border-acento' : 'border-borde bg-panel text-texto hover:border-suave'}`}>
              <span className="opacity-80">{d.t}</span><span className="truncate font-semibold">{d.v}</span><span aria-hidden="true" className="text-[10px]">▾</span>
            </button>
            {panel === d.k && d.k !== 'pesos' && desplegable(d.k, 'absolute left-0 top-full mt-1 w-[22rem] max-w-[calc(100vw-2rem)]')}
          </div>
        ))}
        {activos.length > 0 && <button onClick={quitarTodos} className="px-2 text-[12px] text-suave hover:text-texto">Quitar filtros ({activos.length})</button>}
      </div>
      {avisoDiv && <p role="status" className="text-[13px] text-aviso">{avisoDiv}</p>}
      {error && <Fallo>No se ha podido leer: {error}</Fallo>}
      {errorJornada && <p role="status" className="text-[13px] text-baja">No se han podido leer los puestos de la semana ({errorJornada}): la tabla sale sin puestos ni movimiento.</p>}

      <div className="relative grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,1fr)_23rem]">
        {/* Pesos: encima de la ficha, para ver la tabla moverse mientras se afinan; en pantallas estrechas, encima de todo. */}
        {panel === 'pesos' && desplegable('pesos', 'lg:absolute lg:right-0 lg:top-0 lg:w-[23rem] lg:max-h-[calc(100dvh-6.5rem)] lg:overflow-y-auto')}
        <div className="min-w-0 space-y-4">
          <Leyenda monetarios={monetarios} />
          {listas.map(([titulo, filas]) => (
            <Tarjeta key={titulo} titulo={titulo ? `${titulo} · ${filas.length}` : undefined}>
              {monetarios
                ? <TablaMonetarios filas={filas.slice(0, mostrar)} sel={sel} setSel={setSel} seguidos={seguidos} seguir={seguirFondo} conCategoria={!filtros.categoria} orden={ordenEf} setOrden={setOrden} jornada={jornada} />
                : <Tabla filas={filas.slice(0, mostrar)} sel={sel} setSel={setSel} seguidos={seguidos} seguir={seguirFondo} conCategoria={!filtros.categoria} orden={ordenEf} setOrden={setOrden} pocos={pocos} plazo={plazo} jornada={jornada} cargandoJornada={puestos == null} />}
              {filas.length > mostrar && (
                <button onClick={() => setMostrar((n) => n + POR_PAGINA)} className="boton mt-3 text-[13px]">Ver {Math.min(POR_PAGINA, filas.length - mostrar)} más</button>
              )}
            </Tarjeta>
          ))}
          <p className="text-[12px] text-suave">
            {monetarios
              ? 'Monetarios. Último mes, 2 y 3 meses: lo que ha ganado el fondo en ese tiempo, pasado a un año, para ver lo que rinde ahora (neto de gastos). «3 meses vs €STR»: puntos por encima del tipo del BCE. «12 meses»: lo que ha ganado de verdad en el último año. En clases de distribución el cupón no entra y la cifra sale baja. Debajo de cada cifra, su percentil en la categoría.'
              : 'Al final, los fondos con menos de 3 años, sin nota. Sin gestión conocida, un fondo cuenta como activo. El desglose de la nota por bloques, en la ficha de la derecha.'}
            {' '}El puesto sale de la nota guardada cada lunes con los pesos por defecto, no de los de esta pantalla: por eso puede no seguir el orden de la lista.
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

/** Qué quiere decir cada marca de la tabla, a la vista y no solo al pasar el cursor. */
function Leyenda({ monetarios }: { monetarios: boolean }) {
  const marca = 'rounded-sm px-1 text-[11px]'
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-suave">
      <span><i aria-hidden="true" className="mr-1.5 inline-block h-2.5 w-4 bg-tuyo align-[-1px] outline outline-borde" />En tus carteras (■ color de cada una)</span>
      {!monetarios && <span><b className="estrecha text-texto">7.º</b>/22 puesto en su categoría · <b className="text-sube">▲</b><b className="text-baja">▼</b> en un mes · <s>tachado</s>: de otra semana</span>}
      <span><span className={`${marca} border border-acento/60 font-medium text-acento`}>MI</span> en MyInvestor</span>
      {!monetarios && <span><span className={`${marca} bg-aviso/15 text-aviso`}>3A</span> métricas a 3 años · <span className={`${marca} bg-aviso/15 text-aviso`}>de N</span> categoría con pocos fondos</span>}
      <span>pNN: percentil en la categoría (100 = mejor) · <span className="text-aviso">★</span> en seguimiento</span>
    </p>
  )
}

/** Línea de un desplegable: etiqueta a la izquierda, control a la derecha. */
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
  orden: Orden; setOrden: (o: Orden) => void; jornada: Jornada
}

/** Cabecera ordenable: la flecha dice hacia dónde (↑ de menor a mayor, para las cifras donde menos es mejor). */
function Cabecera({ o, texto, titulo, orden, setOrden, clase = '' }: { o: Orden; texto: string; titulo?: string; orden: Orden; setOrden: (o: Orden) => void; clase?: string }) {
  const sube = o !== 'nota' && COLUMNAS[o][1]
  return (
    <th className={`pb-1.5 pl-3 font-normal whitespace-nowrap ${clase}`} title={titulo} aria-sort={orden === o ? (sube ? 'ascending' : 'descending') : 'none'}>
      <button onClick={() => setOrden(o)} className={`min-h-6 uppercase ${orden === o ? 'text-acento' : 'hover:text-texto'}`}>{texto}{orden === o ? (sube ? ' ↑' : ' ↓') : ''}</button>
    </th>
  )
}

/** Nombre, etiquetas y categoría de un fondo en la lista. */
function CeldaFondo({ f, conCategoria, extra, jornada }: { f: Puntuado; conCategoria: boolean; extra?: React.ReactNode; jornada: Jornada }) {
  return (
    <td className="whitespace-normal py-2 pl-3 text-left">
      {jornada.carteras.get(f.isin)?.map((c) => (
        <i key={c.id} title={`En la cartera ${c.nombre}`} aria-label={`En la cartera ${c.nombre}`} role="img"
          className="mr-1.5 inline-block h-2.5 w-2.5 align-[0px]" style={{ background: jornada.tinta.get(c.id) }} />
      ))}
      <a href={`#/fondo/${f.isin}`} onClick={(e) => e.stopPropagation()} className="hover:text-acento">{f.nombre}</a>
      {f.myinvestor && <span className="ml-1.5 rounded-sm border border-acento/60 px-1 align-[1px] text-[11px] font-medium text-acento" title="Se puede comprar en MyInvestor">MI</span>}
      {(f.divisa !== 'EUR' || cubierta(f.nombre)) && <span className="ml-1.5 rounded-sm bg-borde/60 px-1.5 align-[1px] text-[11px] text-suave">{f.divisa}{cubierta(f.nombre) && ' cubierta'}</span>}
      {extra}
      {conCategoria && <span className="block text-[12px] text-suave">{f.categoria}</span>}
    </td>
  )
}

/** Fila de la clasificación: amarillo si es tuyo, contorno azul si está elegida, filete fuerte cada cinco filas. */
function Fila({ f, i, k, sel, setSel, seguidos, seguir, jornada, children }: { f: Puntuado; i: number | null; k: number; sel: string | null; setSel: (i: string) => void; seguidos: Set<string>; seguir: (i: string) => void; jornada: Jornada; children: React.ReactNode }) {
  const elegida = sel === f.isin
  const tuyo = jornada.carteras.has(f.isin)
  // lo tuyo sigue en amarillo aunque esté elegido; la selección se marca con el contorno azul
  const fondo = tuyo ? 'bg-tuyo' : elegida ? 'bg-acento/15' : 'hover:bg-borde/30'
  return (
    <tr data-isin={f.isin} aria-current={elegida || undefined} onClick={() => setSel(f.isin)} onFocus={() => setSel(f.isin)}
      className={`cursor-pointer border-t ${k > 0 && k % 5 === 0 ? 'border-texto/60' : 'border-borde/70'} ${fondo} ${elegida ? 'outline-2 -outline-offset-2 outline-acento' : ''}`}>
      <td className={`estrecha py-2 pl-3 text-left text-[17px] font-extrabold leading-none ${elegida ? 'text-acento' : ''}`}>{i ?? ''}</td>
      {children}
      <td className="pl-2">
        <button onClick={(e) => { e.stopPropagation(); if (!seguidos.has(f.isin)) seguir(f.isin) }} aria-label={seguidos.has(f.isin) ? 'En seguimiento' : 'Añadir a seguimiento'}
          className={`min-h-7 min-w-7 rounded-sm ${seguidos.has(f.isin) ? 'text-aviso' : 'text-suave hover:bg-borde/50 hover:text-acento'}`}>{seguidos.has(f.isin) ? '★' : '+'}</button>
      </td>
    </tr>
  )
}

/** Cifra con su percentil en la categoría debajo (100 = mejor). */
const ConPct = ({ v, p, texto, clase = '' }: { v: number | null; p: number | null; texto: string; clase?: string }) =>
  <td className={`pl-3 leading-tight ${v == null ? 'text-suave' : clase}`}>
    {v == null ? '—' : texto}
    {v != null && p != null && <span className="block text-[11px] font-normal text-suave"><span className="sr-only">percentil </span>p{Math.round(p)}</span>}
  </td>

/** Puesto en su categoría («7.º/22») y, debajo, los ganados o perdidos en un mes; tachado con su fecha si no es de esta semana. */
function CeldaSemana({ p, ultima }: { p: Puestos | undefined; ultima: string }) {
  if (!p) return <td className="pl-3 text-left text-suave">—</td>
  const v = viejo(p, ultima), m = movimiento(p)
  const puesto = <><span className="text-[15px] font-bold">{p.puestos.at(-1)}.º</span><span className="text-[12px] text-suave">/{p.de}</span></>
  if (v) return (
    <td className="estrecha pl-3 text-left leading-tight text-suave">
      <s>{puesto}</s><span className="block text-[12px] text-baja">del {fechaCorta(v)}</span>
    </td>
  )
  return (
    <td className="estrecha pl-3 text-left leading-tight">
      {puesto}
      <span className={`block text-[12px] font-bold ${m == null || m === 0 ? 'text-suave' : m > 0 ? 'text-sube' : 'text-baja'}`}>
        {m == null ? 'sin mes' : m > 0 ? `▲ ${m}` : m < 0 ? `▼ ${-m}` : '= igual'}
        <span className="sr-only">{m == null ? '' : m > 0 ? ' puestos ganados en un mes' : m < 0 ? ' puestos perdidos en un mes' : ' en un mes'}</span>
      </span>
    </td>
  )
}

/** En el móvil la columna del puesto queda fuera de la vista: el movimiento va junto a la nota. */
function MovilMovimiento({ p }: { p: Puestos | undefined }) {
  const m = p ? movimiento(p) : null
  if (!m) return null
  return <span className={`estrecha ml-1.5 text-[13px] font-bold sm:hidden ${m > 0 ? 'text-sube' : 'text-baja'}`}>{m > 0 ? `▲${m}` : `▼${-m}`}</span>
}

function Tabla({ filas, sel, setSel, seguidos, seguir, conCategoria, orden, setOrden, pocos, plazo, jornada, cargandoJornada }: PropsTabla & { pocos: (f: Puntuado) => number; plazo: Plazo | ''; cargandoJornada: boolean }) {
  const cab = { orden, setOrden }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[46rem] whitespace-nowrap text-right text-[13px] tabular">
        <thead className="rotulo">
          <tr>
            <th className="w-12 pb-1.5 pl-3 text-left font-normal" title="Lugar en esta lista, con el orden y los filtros de la pantalla (no es el puesto en la categoría)">Orden</th>
            <th className="pb-1.5 pl-3 text-left font-normal">Fondo</th>
            <th className="pb-1.5 pl-3 text-left font-normal" title="Puesto en su categoría con la nota guardada el lunes (pesos por defecto) y puestos ganados o perdidos desde hace 4 semanas">{cargandoJornada ? 'Puesto …' : 'Puesto'}</th>
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
            return (
              <Fila key={f.isin} f={f} i={f.nota == null && orden === 'nota' ? null : i + 1} k={i} sel={sel} setSel={setSel} seguidos={seguidos} seguir={seguir} jornada={jornada}>
                <CeldaFondo f={f} conCategoria={conCategoria} jornada={jornada} extra={<>
                  {f.nota != null && <span className="estrecha ml-1.5 text-[15px] font-extrabold sm:hidden">· {Math.round(f.nota)}</span>}
                  <MovilMovimiento p={jornada.puestos.get(f.isin)} />
                  {f.solo3a && <span className="ml-1.5 rounded-sm bg-aviso/15 px-1.5 align-[1px] text-[11px] text-aviso" title="Menos de 5 años: métricas a 3 años">3A</span>}
                  {pocos(f) > 0 && <span className="ml-1.5 rounded-sm bg-aviso/15 px-1.5 align-[1px] text-[11px] text-aviso" title={`Su categoría solo tiene ${pocos(f)} fondos en el universo: el percentil dice poco`}>de {pocos(f)}</span>}
                </>} />
                <CeldaSemana p={jornada.puestos.get(f.isin)} ultima={jornada.ultima} />
                <td className="pl-3 text-left">
                  {f.nota == null ? <span className="text-[12px] text-suave">{plazo ? `sin ${anos(plazo)}` : 'sin historial'}</span>
                    : <span className="cifra text-[21px] font-extrabold leading-none">{Math.round(f.nota)}</span>}
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
function TablaMonetarios({ filas, sel, setSel, seguidos, seguir, conCategoria, orden, setOrden, jornada }: PropsTabla) {
  const cab = { orden, setOrden }
  const c = (f: Puntuado, k: string) => [cifraDe(f, k), percentilDe(f, k)] as const
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[50rem] whitespace-nowrap text-right text-[13px] tabular">
        <thead className="rotulo">
          <tr className="text-[11px]">
            <th colSpan={2} />
            <th colSpan={3} className="border-b border-borde pb-1 pl-3 text-center font-normal">Lo que rinde ahora, en % anual</th>
            <th colSpan={5} />
          </tr>
          <tr>
            <th className="w-12 pb-1.5 pl-3 text-left font-normal" title="Lugar en esta lista, con el orden y los filtros de la pantalla (no es el puesto en la categoría)">Orden</th>
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
              <Fila key={f.isin} f={f} i={i + 1} k={i} sel={sel} setSel={setSel} seguidos={seguidos} seguir={seguir} jornada={jornada}>
                <CeldaFondo f={f} conCategoria={conCategoria} jornada={jornada} />
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
