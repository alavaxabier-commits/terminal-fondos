import type { RefSerie } from '../calculo/cartera'
import type { Composicion } from '../calculo/exposicion'
import type { Punto } from '../calculo/series'
import { supabase } from './supabase'

export type Fondo = {
  isin: string
  nombre: string
  gestora: string | null
  categoria: string | null
  divisa: string | null
  ter: number | null
  duracion_efectiva?: number | null
  srri: number | null
  patrimonio_meur: number | null
  fecha_lanzamiento: string | null
  indice_id: string | null
  en_universo: boolean
  fund_id?: string | null
  gestion?: 'activa' | 'indexada' | null
  inversion_minima?: number | null
  calidad_media?: string | null
  gestores?: { nombre: string; desde: string | null }[] | null // equipo gestor actual (ficha de detalle de Morningstar)
  vencimiento_efectivo?: number | null
}

export type Indice = { id: string; nombre: string; proxy_isin: string | null; componentes: { id: string; peso: number }[] | null }
export type Referencia = { metodo: 'indice' | 'media_categoria' | 'ninguna'; indice: Indice | null }
export type Metrica = { ventana: string; nombre: string; valor: number; percentil: number | null }

function error(e: { message: string } | null) {
  if (e) throw new Error(e.message)
}

/** Búsqueda por nombre o ISIN: primero los del universo y los de más patrimonio. */
export async function buscar(texto: string): Promise<Fondo[]> {
  const t = texto.replace(/[^\p{L}\p{N} .&-]/gu, '').trim()
  if (t.length < 2) return []
  const { data, error: e } = await supabase
    .from('fondo')
    .select('isin,nombre,gestora,categoria,divisa,ter,srri,patrimonio_meur,fecha_lanzamiento,indice_id,en_universo')
    .or(`nombre.ilike."*${t}*",isin.ilike."${t.toUpperCase()}*"`)
    .order('en_universo', { ascending: false })
    .order('patrimonio_meur', { ascending: false, nullsFirst: false })
    .limit(20)
  error(e)
  return (data ?? []) as Fondo[]
}

export async function fondo(isin: string): Promise<Fondo | null> {
  const { data, error: e } = await supabase.from('fondo').select('*').eq('isin', isin).maybeSingle()
  error(e)
  return data as Fondo | null
}

async function indices(ids: string[]): Promise<Indice[]> {
  if (!ids.length) return []
  const { data, error: e } = await supabase.from('indice').select('id,nombre,proxy_isin,componentes').in('id', ids)
  error(e)
  return (data ?? []) as Indice[]
}

/** Referencia del fondo: su índice propio o el de su categoría (o la media de la categoría, o ninguna). */
export async function referencia(f: Fondo): Promise<Referencia> {
  let metodo: Referencia['metodo'] = 'ninguna'
  let id = f.indice_id
  if (id) metodo = 'indice'
  else if (f.categoria) {
    const { data, error: e } = await supabase.from('categoria_referencia').select('metodo,indice_id').eq('categoria', f.categoria).maybeSingle()
    error(e)
    if (data) {
      metodo = data.metodo as Referencia['metodo']
      id = data.indice_id as string | null
    }
  }
  const [indice] = id ? await indices([id]) : []
  return { metodo, indice: indice ?? null }
}

export { indices }

/** Todos los valores de una serie (la API devuelve como mucho 1.000 filas por petición: se pide por páginas). */
async function paginado(tabla: string, columnaValor: string, filtro: [string, string]): Promise<Punto[]> {
  const out: Punto[] = []
  const pagina = 1000
  for (let desde = 0; ; desde += pagina) {
    const { data, error: e } = await supabase
      .from(tabla)
      .select(`fecha,${columnaValor}`)
      .eq(filtro[0], filtro[1])
      .order('fecha')
      .range(desde, desde + pagina - 1)
    error(e)
    const filas = (data ?? []) as unknown as Record<string, string | number>[]
    for (const r of filas) out.push({ fecha: String(r.fecha), valor: Number(r[columnaValor]) })
    if (filas.length < pagina) return out
  }
}

export const valores = (isin: string) => paginado('valor_liquidativo', 'valor', ['isin', isin])
export const tiposCambio = (divisa: string) => paginado('tipo_cambio', 'por_eur', ['divisa', divisa])

export async function metricas(isin: string): Promise<Metrica[]> {
  const { data, error: e } = await supabase.from('metrica').select('ventana,nombre,valor,percentil').eq('isin', isin)
  error(e)
  return (data ?? []) as Metrica[]
}

/** Fondos que hacen de índice: atajos en la pantalla de inicio. */
export async function sustitutos(): Promise<{ indice: string; isin: string; nombre: string }[]> {
  const { data, error: e } = await supabase.from('indice').select('nombre,proxy_isin').not('proxy_isin', 'is', null).order('nombre')
  error(e)
  const filas = (data ?? []) as { nombre: string; proxy_isin: string }[]
  return filas.map((r) => ({ indice: r.nombre, isin: r.proxy_isin, nombre: r.nombre }))
}

export type { Rebalanceo } from '../calculo/metricas'
import type { Bandas, Rebalanceo } from '../calculo/metricas'
export type Cartera = { id: number; nombre: string; objetivo: string | null; rebalanceo: Rebalanceo; banda: number; banda_tipo: Bandas['tipo']; revision: Bandas['revision']; referencia: string | null } // para 'bandas'; referencia: id del índice elegido o null
export type CarteraFondo = { peso: number; fondo: Fondo }

export async function carteras(): Promise<Cartera[]> {
  const { data, error: e } = await supabase.from('cartera').select('id,nombre,objetivo,rebalanceo,banda,banda_tipo,revision,referencia').eq('archivada', false).order('nombre')
  error(e)
  return (data ?? []) as Cartera[]
}

/** Una cartera con sus fondos (de más a menos peso). */
export async function cartera(id: number): Promise<{ cartera: Cartera; fondos: CarteraFondo[] } | null> {
  const { data, error: e } = await supabase
    .from('cartera')
    .select('id,nombre,objetivo,rebalanceo,banda,banda_tipo,revision,referencia,cartera_fondo(peso,fondo(*))')
    .eq('id', id)
    .maybeSingle()
  error(e)
  if (!data) return null
  const { cartera_fondo, ...c } = data as unknown as Cartera & { cartera_fondo: { peso: string; fondo: Fondo }[] }
  const fondos = cartera_fondo.map((x) => ({ peso: Number(x.peso), fondo: x.fondo })).sort((a, b) => b.peso - a.peso)
  return { cartera: { ...c, banda: Number(c.banda) }, fondos }
}

/** Todas las clases de un fondo (también las de fuera del universo), de menor a mayor TER. */
export async function clases(fundId: string): Promise<Fondo[]> {
  const { data, error: e } = await supabase.from('fondo').select('isin,nombre,divisa,ter,en_universo,inversion_minima')
    .eq('fund_id', fundId).order('ter', { nullsFirst: false }).limit(50)
  error(e)
  return (data ?? []) as Fondo[]
}

/** Puestos de cada fondo en su categoría en las últimas 8 semanas (nota guardada): una llamada, ≈2 s. */
export async function puestos(): Promise<Map<string, import('../calculo/jornada').Puestos>> {
  const { data, error: e } = await supabase.rpc('puestos_semanales')
  error(e)
  return new Map(Object.entries((data ?? {}) as Record<string, import('../calculo/jornada').Puestos>))
}

/** En qué carteras (no archivadas) está cada fondo: para la tinta de cartera y el «once» del Screener. */
export async function fondosEnCarteras(): Promise<Map<string, { id: number; nombre: string }[]>> {
  const { data, error: e } = await supabase.from('cartera_fondo').select('isin,cartera!inner(id,nombre,archivada)').eq('cartera.archivada', false)
  error(e)
  const m = new Map<string, { id: number; nombre: string }[]>()
  for (const x of (data ?? []) as unknown as { isin: string; cartera: { id: number; nombre: string } }[])
    m.set(x.isin, [...(m.get(x.isin) ?? []), { id: x.cartera.id, nombre: x.cartera.nombre }])
  return m
}

/** Carteras (no archivadas) en las que está un fondo, con su peso. */
export async function carterasDe(isin: string): Promise<{ id: number; nombre: string; peso: number }[]> {
  const { data, error: e } = await supabase.from('cartera_fondo').select('peso,cartera!inner(id,nombre,archivada)')
    .eq('isin', isin).eq('cartera.archivada', false)
  error(e)
  return ((data ?? []) as unknown as { peso: string; cartera: { id: number; nombre: string } }[])
    .map((x) => ({ id: x.cartera.id, nombre: x.cartera.nombre, peso: Number(x.peso) }))
}

/** Métricas de varios fondos a la vez (la tabla de una cartera). */
export async function metricasDe(isins: string[]): Promise<(Metrica & { isin: string })[]> {
  const out: (Metrica & { isin: string })[] = []
  for (let desde = 0; ; desde += 1000) { // unas 70 por fondo: con más de 14 fondos pasa de una página
    const { data, error: e } = await supabase.from('metrica').select('isin,ventana,nombre,valor,percentil').in('isin', isins)
      .order('isin').order('ventana').order('nombre').range(desde, desde + 999)
    error(e)
    out.push(...((data ?? []) as (Metrica & { isin: string })[]))
    if ((data ?? []).length < 1000) return out
  }
}

/** Composición (X-Ray) de varios fondos: desgloses y posiciones, como los guarda la descarga. */
export async function composiciones(isins: string[]): Promise<{ isin: string; fecha_cartera: string | null; datos: Composicion }[]> {
  const { data, error: e } = await supabase.from('composicion').select('isin,fecha_cartera,datos').in('isin', isins)
  error(e)
  return (data ?? []) as { isin: string; fecha_cartera: string | null; datos: Composicion }[]
}

/** Qué referencia usa cada categoría (para saber la de cada fondo de una cartera). */
export async function categoriasReferencia(): Promise<Map<string, { metodo: Referencia['metodo']; indice_id: string | null }>> {
  const { data, error: e } = await supabase.from('categoria_referencia').select('categoria,metodo,indice_id')
  error(e)
  return new Map(((data ?? []) as { categoria: string; metodo: Referencia['metodo']; indice_id: string | null }[]).map((r) => [r.categoria, r]))
}

/** Clave de la serie de referencia de un fondo, como en fondos/calculo.py ('indice:<id>' o 'media:<categoría>'). */
export function claveReferencia(f: Fondo, cats: Awaited<ReturnType<typeof categoriasReferencia>>): string | null {
  if (f.indice_id) return `indice:${f.indice_id}`
  const c = f.categoria ? cats.get(f.categoria) : undefined
  if (c?.metodo === 'indice' && c.indice_id) return `indice:${c.indice_id}`
  if (c?.metodo === 'media_categoria') return `media:${f.categoria}`
  return null
}

/** Series de referencia ya hechas por Python (semanal y de cierre de mes). */
export async function referenciaSeries(claves: string[]): Promise<Map<string, RefSerie>> {
  if (!claves.length) return new Map()
  const { data, error: e } = await supabase.from('referencia_serie').select('clave,semanas,valores_semana,meses,valores_mes').in('clave', claves)
  error(e)
  type Fila = { clave: string; semanas: string[]; valores_semana: number[]; meses: string[]; valores_mes: number[] }
  return new Map(((data ?? []) as Fila[]).map((r) => [r.clave, {
    semanal: new Map(r.semanas.map((f, i) => [f, Number(r.valores_semana[i])])),
    meses: new Map(r.meses.map((f, i) => [f, Number(r.valores_mes[i])])),
  }]))
}

// ------------------------------------------------------------------ edición de carteras (solo el propietario, por RLS)
export type CarteraEditable = Omit<Cartera, 'id'>
export type Cambio = { fecha: string; sale: string | null; entra: string | null; motivo: string | null }

/** Crea una cartera (con un número al final si el nombre ya existe) y devuelve su id. */
export async function crearCartera(c: CarteraEditable, fondos: { isin: string; peso: number }[] = []): Promise<number> {
  for (let n = 1; n <= 20; n++) {
    const nombre = n === 1 ? c.nombre : `${c.nombre} ${n}`
    const { data, error: e } = await supabase.from('cartera').insert({ ...c, nombre }).select('id').single()
    if (e?.code === '23505') continue // nombre repetido
    error(e)
    const id = (data as { id: number }).id
    if (fondos.length) error((await supabase.from('cartera_fondo').insert(fondos.map((f) => ({ cartera_id: id, ...f })))).error)
    return id
  }
  throw new Error('Ya hay muchas carteras con ese nombre')
}

/** Guarda nombre, rebalanceo y fondos de una cartera y anota en el historial lo que cambia (en una transacción). */
export async function guardarCartera(id: number, c: CarteraEditable, fondos: { isin: string; peso: number }[], cambios: Omit<Cambio, 'fecha'>[]) {
  error((await supabase.rpc('guardar_cartera', { p_id: id, p_cartera: c, p_fondos: fondos, p_cambios: cambios })).error)
}

/** Índices que se pueden elegir como referencia de una cartera (todos tienen serie en referencia_serie). */
export async function indicesReferencia(): Promise<{ id: string; nombre: string }[]> {
  const { data, error: e } = await supabase.from('indice').select('id,nombre').order('nombre')
  error(e)
  return (data ?? []) as { id: string; nombre: string }[]
}

/** Serie del índice elegido para una cartera (null si usa la combinada de sus fondos). */
export async function refCartera(c: Pick<Cartera, 'referencia'>): Promise<RefSerie | null> {
  if (!c.referencia) return null
  return (await referenciaSeries([`indice:${c.referencia}`])).get(`indice:${c.referencia}`) ?? null
}

export async function elegirReferencia(id: number, referencia: string | null) {
  error((await supabase.from('cartera').update({ referencia }).eq('id', id)).error)
}

export async function archivarCartera(id: number) {
  error((await supabase.from('cartera').update({ archivada: true }).eq('id', id)).error)
}

export async function cambios(id: number): Promise<Cambio[]> {
  const { data, error: e } = await supabase.from('cartera_cambio').select('fecha,sale,entra,motivo').eq('cartera_id', id).order('id', { ascending: false }).limit(20)
  error(e)
  return (data ?? []) as Cambio[]
}

/** Líneas de vigilancia de las descargas de los últimos 15 días (fondos/vigilancia.py), para Inicio. */
export async function vigilancia(): Promise<{ ts: string; estado: string; mensaje: string }[]> {
  const desde = new Date(Date.now() - 15 * 864e5).toISOString()
  const { data, error: e } = await supabase.from('registro_descarga').select('ts,estado,mensaje')
    .eq('fuente', 'vigilancia').gte('ts', desde).order('ts', { ascending: false }).limit(200)
  error(e)
  return (data ?? []) as { ts: string; estado: string; mensaje: string }[]
}

/** Lo que ocupa la base (bytes) y sus 5 tablas mayores; null si no hay sesión del propietario. */
export async function tamanoBase(): Promise<{ total: number; tablas: { tabla: string; bytes: number }[] } | null> {
  const { data, error: e } = await supabase.rpc('tamano_base')
  error(e)
  return data
}

// ------------------------------------------------------------------ screener y seguimiento (fase 3)
export type FilaScreener = {
  isin: string; nombre: string; categoria: string | null; divisa: string | null; ter: number | null; srri: number | null
  gestion: 'activa' | 'indexada' | null; patrimonio_meur: number | null; fecha_lanzamiento: string | null
  myinvestor: boolean; pct: Record<string, number> | null; r5: number | null; r3: number | null
  cifras: Record<string, [number, number | null]> | null // valor y percentil: volatilidad, Sharpe, monetarios…
}

/** El universo entero con los percentiles de la nota (vista fondos.screener), de 1.000 en 1.000. */
export async function screener(): Promise<FilaScreener[]> {
  const out: FilaScreener[] = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error: e } = await supabase.from('screener').select('*').order('isin').range(desde, desde + 999)
    error(e)
    out.push(...((data ?? []) as FilaScreener[]))
    if ((data ?? []).length < 1000) return out
  }
}

export type Perfil = { id: number; nombre: string; pesos: import('../calculo/nota').PesosTipo; filtros: Record<string, unknown>; modo: string }

export async function perfiles(): Promise<Perfil[]> {
  const { data, error: e } = await supabase.from('perfil_screener').select('id,nombre,pesos,filtros,modo').order('id')
  error(e)
  return (data ?? []) as Perfil[]
}

/** Guarda un perfil por su nombre (si existe, lo sustituye). */
export async function guardarPerfil(p: Omit<Perfil, 'id'>) {
  error((await supabase.from('perfil_screener').upsert(p, { onConflict: 'nombre' })).error)
}

export type Seguido = { isin: string; alta: string; nota: string | null }

export async function seguimiento(): Promise<Seguido[]> {
  const { data, error: e } = await supabase.from('seguimiento').select('isin,alta,nota').order('alta', { ascending: false })
  error(e)
  return (data ?? []) as Seguido[]
}

export async function seguir(isin: string, nota: string | null = null) {
  error((await supabase.from('seguimiento').upsert({ isin, nota }, { onConflict: 'isin', ignoreDuplicates: true })).error)
}

/** Notas semanales de varios fondos (13 meses como mucho por fondo), de 1.000 en 1.000. */
export async function notasDe(isins: string[]): Promise<import('../calculo/senales').NotaSemanal[]> {
  if (!isins.length) return []
  const out: import('../calculo/senales').NotaSemanal[] = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error: e } = await supabase.from('nota_semanal').select('isin,fecha,nota,percentil').in('isin', isins)
      .order('isin').order('fecha').range(desde, desde + 999)
    error(e)
    out.push(...((data ?? []) as { isin: string; fecha: string; nota: string; percentil: string | null }[])
      .map((r) => ({ ...r, nota: Number(r.nota), percentil: r.percentil == null ? null : Number(r.percentil) })))
    if ((data ?? []).length < 1000) return out
  }
}

type FondoSeguido = Pick<Fondo, 'nombre' | 'categoria' | 'ter' | 'divisa' | 'gestion' | 'srri' | 'fund_id' | 'patrimonio_meur'>

/** Fondos en seguimiento con su ficha y si se pueden comprar en MyInvestor (catálogo, clase abierta). */
export async function seguidos(): Promise<(Seguido & { fondo: FondoSeguido; myinvestor: boolean })[]> {
  const { data, error: e } = await supabase.from('seguimiento').select('isin,alta,nota,fondo(nombre,categoria,ter,divisa,gestion,srri,fund_id,patrimonio_meur)').order('alta', { ascending: false })
  error(e)
  const filas = (data ?? []) as unknown as (Seguido & { fondo: FondoSeguido })[]
  const { data: mi, error: e2 } = await supabase.from('myinvestor').select('isin').eq('abierto', true).in('isin', filas.map((f) => f.isin))
  error(e2)
  const en = new Set(((mi ?? []) as { isin: string }[]).map((r) => r.isin))
  return filas.map((f) => ({ ...f, myinvestor: en.has(f.isin) }))
}

export async function cambiarNotaSeguimiento(isin: string, nota: string | null) {
  error((await supabase.from('seguimiento').update({ nota }).eq('isin', isin)).error)
}

export async function dejarDeSeguir(isin: string) {
  error((await supabase.from('seguimiento').delete().eq('isin', isin)).error)
}

/** Umbrales de las señales (tabla ajuste). */
export async function umbrales(): Promise<{ clave: string; valor: number; descripcion: string }[]> {
  const { data, error: e } = await supabase.from('ajuste').select('clave,valor,descripcion').order('clave')
  error(e)
  return ((data ?? []) as { clave: string; valor: string; descripcion: string }[]).map((r) => ({ ...r, valor: Number(r.valor) }))
}

export async function guardarUmbral(clave: string, valor: number) {
  error((await supabase.from('ajuste').update({ valor }).eq('clave', clave)).error)
}

/** Fondos de unas categorías con su nota de la última semana guardada (para comparar y buscar alternativas). */
export async function pares(categorias: string[]): Promise<import('../calculo/senales').Par[]> {
  if (!categorias.length) return []
  const { data: ult, error: e } = await supabase.from('nota_semanal').select('fecha').order('fecha', { ascending: false }).limit(1)
  error(e)
  const fecha = (ult as { fecha: string }[] | null)?.[0]?.fecha
  if (!fecha) return []
  type Fila = { isin: string; nota: string; percentil: string | null; fondo: { nombre: string; categoria: string | null; divisa: string | null; ter: number | null; fund_id: string | null } }
  const out: import('../calculo/senales').Par[] = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error: e2 } = await supabase.from('nota_semanal').select('isin,nota,percentil,fondo!inner(nombre,categoria,divisa,ter,fund_id)')
      .eq('fecha', fecha).in('fondo.categoria', categorias).order('isin').range(desde, desde + 999)
    error(e2)
    const filas = (data ?? []) as unknown as Fila[]
    out.push(...filas.map((r) => ({ isin: r.isin, ...r.fondo, ter: r.fondo.ter == null ? null : Number(r.fondo.ter), nota: Number(r.nota), percentil: r.percentil == null ? null : Number(r.percentil) })))
    if (filas.length < 1000) return out
  }
}

/** De unos ISIN, los que se pueden comprar en MyInvestor (catálogo, clase abierta). */
export async function enMyinvestor(isins: string[]): Promise<Set<string>> {
  const out = new Set<string>()
  for (let i = 0; i < isins.length; i += 200) { // de 200 en 200: la lista va en la dirección de la petición
    const { data, error: e } = await supabase.from('myinvestor').select('isin').eq('abierto', true).in('isin', isins.slice(i, i + 200))
    error(e)
    for (const r of (data ?? []) as { isin: string }[]) out.add(r.isin)
  }
  return out
}

/** Percentil de diversificación de cada fondo frente a una cartera y con qué fondos de ella se calculó. */
export async function diversificacion(carteraId: number): Promise<{ percentiles: Map<string, number>; base: { isins: string[]; calculada_en: string } | null }> {
  const percentiles = new Map<string, number>()
  for (let desde = 0; ; desde += 1000) {
    const { data, error: e } = await supabase.from('diversificacion').select('isin,percentil').eq('cartera_id', carteraId)
      .not('percentil', 'is', null).order('isin').range(desde, desde + 999)
    error(e)
    for (const r of (data ?? []) as { isin: string; percentil: string }[]) percentiles.set(r.isin, Number(r.percentil))
    if ((data ?? []).length < 1000) break
  }
  return { percentiles, base: await baseDiversificacion(carteraId) }
}

/** Correlación y percentil de diversificación de unos fondos frente a todas las carteras (los que están fuera del universo no tienen). */
export async function diversificacionDe(isins: string[]): Promise<import('../calculo/encaje').Diversificacion[]> {
  if (!isins.length) return []
  const { data, error: e } = await supabase.from('diversificacion').select('cartera_id,isin,correlacion,percentil').in('isin', isins).limit(1000)
  error(e)
  return ((data ?? []) as { cartera_id: number; isin: string; correlacion: string; percentil: string | null }[])
    .map((r) => ({ ...r, correlacion: Number(r.correlacion), percentil: r.percentil == null ? null : Number(r.percentil) }))
}

/** Con qué fondos de una cartera se calculó su diversificación, y cuándo. */
export async function baseDiversificacion(carteraId: number): Promise<{ isins: string[]; calculada_en: string } | null> {
  const { data, error: e } = await supabase.from('diversificacion_base').select('isins,calculada_en').eq('cartera_id', carteraId).maybeSingle()
  error(e)
  return data as { isins: string[]; calculada_en: string } | null
}

/** Aviso si la diversificación de una cartera se calculó con otros fondos de los que tiene ahora (null si está al día). */
export function avisoDiversificacion(base: { isins: string[]; calculada_en: string } | null, isins: string[]): string | null {
  const ahora = [...isins].sort().join()
  if (base && base.isins.join() === ahora) return null
  return base
    ? `La cartera ha cambiado desde el ${new Date(base.calculada_en).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}: la diversificación del screener todavía usa sus fondos de entonces y se recalcula en la próxima descarga diaria (o lanzando «metricas» a mano).`
    : 'La diversificación de esta cartera aún no se ha calculado: estará tras la próxima descarga diaria (o lanzando «metricas» a mano).'
}
