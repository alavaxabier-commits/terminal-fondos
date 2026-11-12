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

export type Rebalanceo = 'anual' | 'trimestral' | 'ninguno'
export type Cartera = { id: number; nombre: string; objetivo: string | null; rebalanceo: Rebalanceo }
export type CarteraFondo = { peso: number; fondo: Fondo }

export async function carteras(): Promise<Cartera[]> {
  const { data, error: e } = await supabase.from('cartera').select('id,nombre,objetivo,rebalanceo').eq('archivada', false).order('nombre')
  error(e)
  return (data ?? []) as Cartera[]
}

/** Una cartera con sus fondos (de más a menos peso). */
export async function cartera(id: number): Promise<{ cartera: Cartera; fondos: CarteraFondo[] } | null> {
  const { data, error: e } = await supabase
    .from('cartera')
    .select('id,nombre,objetivo,rebalanceo,cartera_fondo(peso,fondo(*))')
    .eq('id', id)
    .maybeSingle()
  error(e)
  if (!data) return null
  const { cartera_fondo, ...c } = data as unknown as Cartera & { cartera_fondo: { peso: string; fondo: Fondo }[] }
  const fondos = cartera_fondo.map((x) => ({ peso: Number(x.peso), fondo: x.fondo })).sort((a, b) => b.peso - a.peso)
  return { cartera: c, fondos }
}

/** Métricas de varios fondos a la vez (la tabla de una cartera). */
export async function metricasDe(isins: string[]): Promise<(Metrica & { isin: string })[]> {
  const { data, error: e } = await supabase.from('metrica').select('isin,ventana,nombre,valor,percentil').in('isin', isins)
  error(e)
  return (data ?? []) as (Metrica & { isin: string })[]
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
export type CarteraEditable = { nombre: string; objetivo: string | null; rebalanceo: Rebalanceo }
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

/** Guarda nombre, rebalanceo y fondos de una cartera y anota en el historial lo que cambia. */
export async function guardarCartera(id: number, c: CarteraEditable, fondos: { isin: string; peso: number }[], cambios: Omit<Cambio, 'fecha'>[]) {
  error((await supabase.from('cartera').update(c).eq('id', id)).error)
  if (fondos.length) error((await supabase.from('cartera_fondo').upsert(fondos.map((f) => ({ cartera_id: id, ...f })))).error)
  const quedan = fondos.map((f) => f.isin)
  let borrar = supabase.from('cartera_fondo').delete().eq('cartera_id', id)
  if (quedan.length) borrar = borrar.not('isin', 'in', `(${quedan.join(',')})`)
  error((await borrar).error)
  if (cambios.length) error((await supabase.from('cartera_cambio').insert(cambios.map((x) => ({ cartera_id: id, ...x })))).error)
}

export async function archivarCartera(id: number) {
  error((await supabase.from('cartera').update({ archivada: true }).eq('id', id)).error)
}

export async function cambios(id: number): Promise<Cambio[]> {
  const { data, error: e } = await supabase.from('cartera_cambio').select('fecha,sale,entra,motivo').eq('cartera_id', id).order('id', { ascending: false }).limit(20)
  error(e)
  return (data ?? []) as Cambio[]
}
