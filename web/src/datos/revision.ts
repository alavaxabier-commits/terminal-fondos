// Revisión de las carteras: señales de cada fondo y sus mejores alternativas. Junta consultas y cálculo
// (calculo/senales.ts); lo usan las pantallas Revisión, Cartera e Inicio.
import { riesgo, rendimientos, semanal } from '../calculo/metricas'
import { alternativas, evolucion, senales, type NotaSemanal, type Par, type Senal, type Umbrales } from '../calculo/senales'
import { serieEur } from './series'
import * as q from './consultas'

export type Alternativa = Par & { myinvestor: boolean; c: number | null }
export type FondoRevisado = {
  fondo: q.Fondo; peso: number; nota: ReturnType<typeof evolucion>; senales: Senal[]; alternativas: Alternativa[]
}
export type Revision = { carteras: { cartera: q.Cartera; fondos: FondoRevisado[] }[]; umbrales: Awaited<ReturnType<typeof q.umbrales>> }

// Los que podrían sustituir a un fondo: sus pares, solo de MyInvestor o de su divisa si los umbrales lo piden.
const candidatosDe = (f: { divisa: string | null }, pares: Par[], u: Umbrales, mi: Set<string>) =>
  pares.filter((p) => (!u.solo_myinvestor || mi.has(p.isin)) && (!(u.misma_divisa ?? 1) || p.divisa === f.divisa))

const correlacion = (a: Map<string, number>, b: Map<string, number>) => riesgo([a, b], [1, 1])?.matriz[0][1] ?? null

/** Revisa las carteras dadas (todas las no archivadas si no se dan). */
export async function revisar(ids?: number[]): Promise<Revision> {
  const [lista, umbrales] = await Promise.all([q.carteras(), q.umbrales()])
  const u = Object.fromEntries(umbrales.map((x) => [x.clave, x.valor])) as Umbrales
  const detalles = (await Promise.all(lista.filter((c) => !ids || ids.includes(c.id)).map((c) => q.cartera(c.id)))).filter((d) => d != null)
  const fondos = new Map(detalles.flatMap((d) => d.fondos.map((x) => [x.fondo.isin, x.fondo] as const)))
  const isins = [...fondos.keys()]
  const categorias = [...new Set([...fondos.values()].map((f) => f.categoria).filter((c): c is string => !!c))]
  const [notas, todosPares] = await Promise.all([q.notasDe(isins), q.pares(categorias)])
  const mi = await q.enMyinvestor(todosPares.map((p) => p.isin))
  const rend = new Map<string, Map<string, number>>()
  const cargarRend = async (isin: string, divisa: string | null) => {
    if (!rend.has(isin)) rend.set(isin, rendimientos(semanal(await serieEur(isin, divisa))))
    return rend.get(isin)!
  }
  await Promise.all([...fondos.values()].map((f) => cargarRend(f.isin, f.divisa)))

  const carteras = detalles.map(({ cartera, fondos: fs }) => {
    const r = riesgo(fs.map((x) => rend.get(x.fondo.isin)!), fs.map((x) => x.peso))
    return {
      cartera,
      fondos: fs.map(({ fondo, peso }, i): FondoRevisado => {
        const pares = todosPares.filter((p) => p.categoria === fondo.categoria)
        const candidatos = candidatosDe(fondo, pares, u, mi)
        const suyas = notas.filter((n) => n.isin === fondo.isin)
        const corr = fs.map((x, j) => ({ nombre: x.fondo.nombre, c: j === i ? null : r?.matriz[i][j] ?? null }))
        const s = senales({ isin: fondo.isin, ter: fondo.ter == null ? null : Number(fondo.ter), fund_id: fondo.fund_id ?? null }, suyas, pares, u, corr, candidatos)
        const alts = s.length ? alternativas({ isin: fondo.isin, fund_id: fondo.fund_id ?? null }, candidatos) : []
        return { fondo, peso, nota: evolucion(suyas, u.empeora_meses), senales: s, alternativas: alts.map((a) => ({ ...a, myinvestor: mi.has(a.isin), c: null })) }
      }),
    }
  })

  // alternativas: su correlación con el fondo al que sustituirían
  const marcados = carteras.flatMap((c) => c.fondos).filter((f) => f.alternativas.length)
  const divisas = new Map((await Promise.all(marcados.flatMap((f) => f.alternativas.map((a) => q.fondo(a.isin))))).map((f) => [f?.isin, f?.divisa ?? null]))
  await Promise.all(marcados.flatMap((f) => f.alternativas.map(async (a) => {
    a.c = correlacion(rend.get(f.fondo.isin)!, await cargarRend(a.isin, divisas.get(a.isin) ?? null))
  })))
  return { carteras, umbrales }
}

/** Señales de los fondos en seguimiento con sus notas, sin «Redundante» (no están en una cartera). */
export async function senalesSeguidos(fondos: { isin: string; categoria: string | null; divisa: string | null; ter: number | null; fund_id: string | null }[],
  notas: NotaSemanal[]): Promise<Map<string, Senal[]>> {
  const categorias = [...new Set(fondos.map((f) => f.categoria).filter((c): c is string => !!c))]
  const [umbrales, todosPares] = await Promise.all([q.umbrales(), q.pares(categorias)])
  const u = Object.fromEntries(umbrales.map((x) => [x.clave, x.valor])) as Umbrales
  const mi = u.solo_myinvestor ? await q.enMyinvestor(todosPares.map((p) => p.isin)) : new Set<string>()
  return new Map(fondos.map((f) => {
    const pares = todosPares.filter((p) => p.categoria === f.categoria)
    const ter = f.ter == null ? null : Number(f.ter)
    return [f.isin, senales({ isin: f.isin, ter, fund_id: f.fund_id }, notas.filter((n) => n.isin === f.isin), pares, u, [], candidatosDe(f, pares, u, mi))]
  }))
}
