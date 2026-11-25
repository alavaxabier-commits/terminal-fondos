// Cuestionario de la nota 1–100 (lo calcula Python, `cuestionario` en fondos/nucleo/metricas.py; aquí solo se lee y se
// cuenta). Las preguntas, sus puntos y sus umbrales tienen que coincidir con PREGUNTAS de Python.
import { cifra, millones, pct } from './formato'

export type Clave = 'p1' | 'p2' | 'p3' | 'p4' | 'p5' | 'p6' | 'p7' | 'p8' | 'p9'
export type Frente = 'índice' | 'categoría' | 'fondo'
export type Pregunta = { clave: Clave; frente: Frente; texto: string; max: number; regla: string }

export const PREGUNTAS: Pregunta[] = [
  { clave: 'p1', frente: 'índice', max: 10, texto: '¿Bate a su índice después de gastos?', regla: 'sí: rentabilidad anual ≥ la del índice puro · a medias: hasta 1 punto por debajo' },
  { clave: 'p2', frente: 'índice', max: 10, texto: '¿Lo bate de forma consistente?', regla: 'sí: en ≥ 60 % de las ventanas de 3 años · a medias: ≥ 40 %' },
  { clave: 'p3', frente: 'índice', max: 10, texto: '¿Cae menos que el índice cuando baja el mercado?', regla: 'sí: captura bajista ≤ 90 · a medias: ≤ 100' },
  { clave: 'p4', frente: 'índice', max: 5, texto: '¿Su peor caída fue menor que la del índice?', regla: 'sí: cayó menos · a medias: hasta 3 puntos más' },
  { clave: 'p5', frente: 'categoría', max: 35, texto: '¿Es barato para su categoría?', regla: 'sí: TER en el 10 % más barato (35) · a medias: en el 25 % (25) o en la mitad barata (12,5)' },
  { clave: 'p6', frente: 'categoría', max: 5, texto: '¿Rinde bien para el riesgo que asume?', regla: 'sí: Sharpe en el 25 % mejor · a medias: en la mitad alta' },
  { clave: 'p7', frente: 'categoría', max: 5, texto: '¿Es regular año tras año?', regla: 'sí: ≥ 2/3 de sus años naturales en la mitad alta · a medias: ≥ la mitad (con 3 años o más)' },
  { clave: 'p8', frente: 'fondo', max: 10, texto: '¿Tiene tamaño suficiente?', regla: 'sí: ≥ 200 M€ · a medias: ≥ 50 M€' },
  { clave: 'p9', frente: 'fondo', max: 10, texto: '¿Tiene un equipo gestor estable?', regla: 'sí: el gestor más veterano lleva ≥ 5 años · a medias: ≥ 2' },
]

export type Respuesta = 'sí' | 'a medias' | 'no' | null
export type Cuestionario = { nota: number; puntos: number; posibles: number; plazo: number; puntosDe: Partial<Record<Clave, number>> }

/** Lo guardado en metrica (ventana 'cuestionario'), con claves 'cuestionario|p1'… o 'p1'… (vista screener); null sin nota. */
export function leer(valores: Map<string, number> | Record<string, number> | null | undefined): Cuestionario | null {
  if (!valores) return null
  const get = (k: string) => (valores instanceof Map ? valores.get(`cuestionario|${k}`) : valores[k]) ?? null
  const nota = get('nota')
  if (nota == null) return null
  const puntosDe: Partial<Record<Clave, number>> = {}
  for (const p of PREGUNTAS) { const x = get(p.clave); if (x != null) puntosDe[p.clave] = x }
  return { nota, puntos: get('puntos') ?? 0, posibles: get('posibles') ?? 0, plazo: get('plazo') ?? 5, puntosDe }
}

export function respuesta(p: Pregunta, puntos: number | undefined): Respuesta {
  if (puntos == null) return null
  return puntos >= p.max ? 'sí' : puntos > 0 ? 'a medias' : 'no'
}

/** La cifra que contesta cada pregunta, con las métricas del fondo ('ventana|nombre' → valor y percentil). */
export function dato(p: Pregunta, plazo: number, valor: (k: string) => number | null | undefined,
  percentil: (k: string) => number | null | undefined, patrimonio: number | null): string | null {
  const v = `${plazo}a`
  switch (p.clave) {
    case 'p1': return valor(`${v}|diferencia_seguimiento`) == null ? null : `${pct(valor(`${v}|diferencia_seguimiento`), 2)} al año`
    case 'p2': return valor('hist|consistencia') == null ? null : `${cifra(valor('hist|consistencia'), 0)} % de las ventanas`
    case 'p3': return valor(`${v}|captura_bajista`) == null ? null : `captura bajista ${cifra(valor(`${v}|captura_bajista`), 0)}`
    case 'p4': return valor(`${v}|caida_relativa`) == null ? null : `${pct(valor(`${v}|caida_relativa`), 1)} frente al índice`
    case 'p5': return percentil('hoy|ter') == null ? null : `percentil ${cifra(percentil('hoy|ter'), 0)}`
    case 'p6': return percentil(`${v}|sharpe`) == null ? null : `percentil ${cifra(percentil(`${v}|sharpe`), 0)}`
    case 'p8': return patrimonio == null ? null : millones(patrimonio)
    default: return null
  }
}
