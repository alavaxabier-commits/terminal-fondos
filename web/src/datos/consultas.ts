import type { Punto } from '../calculo/series'
import { supabase } from './supabase'

export type Fondo = {
  isin: string
  nombre: string
  gestora: string | null
  categoria: string | null
  divisa: string | null
  ter: number | null
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
