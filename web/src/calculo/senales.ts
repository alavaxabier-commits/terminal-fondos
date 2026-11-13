// Evolución de la nota semanal y señales de revisión (especificación, sección 6). Sin red.

export type NotaSemanal = { isin: string; fecha: string; nota: number; percentil: number | null }

const restarMeses = (iso: string, meses: number) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() - meses)
  return d.toISOString().slice(0, 10)
}

/** Notas de un fondo (cualquier orden) → la última, su percentil y cuánto ha cambiado en la semana y en `meses` meses
 * (frente a la nota más antigua dentro de ese plazo). Sin notas, null. */
export function evolucion(notas: NotaSemanal[], meses = 12) {
  if (!notas.length) return null
  const s = [...notas].sort((a, b) => a.fecha.localeCompare(b.fecha))
  const ultima = s.at(-1)!
  const hace7 = new Date(Date.parse(`${ultima.fecha}T00:00:00Z`) - 7 * 864e5).toISOString().slice(0, 10)
  const semana = s.find((x) => x.fecha === hace7)
  const desde = restarMeses(ultima.fecha, meses)
  const inicio = s.find((x) => x.fecha >= desde && x.fecha < ultima.fecha)
  return {
    fecha: ultima.fecha, nota: ultima.nota, percentil: ultima.percentil,
    semana: semana ? ultima.nota - semana.nota : null,
    periodo: inicio ? ultima.nota - inicio.nota : null,
  }
}

// ------------------------------------------------------------------ señales de revisión
export type Umbrales = {
  nota_baja_percentil: number; empeora_puntos: number; empeora_meses: number
  mejor_puntos: number; caro_puntos_ter: number; redundante_correlacion: number; solo_myinvestor?: number
}
/** Un fondo con su nota de la última semana (los de su categoría son los «pares»). */
export type Par = { isin: string; nombre: string; categoria: string | null; ter: number | null; fund_id: string | null; nota: number; percentil: number | null }
export type Senal = { tipo: 'Nota baja' | 'Empeora' | 'Hay algo claramente mejor' | 'Caro' | 'Redundante'; motivo: string }

const n0 = (x: number) => Math.round(x)
const n2 = (x: number) => x.toFixed(2).replace('.', ',')

export function mediana(xs: number[]): number | null {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Las mejores alternativas de su categoría por nota (sin otras clases del mismo fondo). */
export function alternativas(f: { isin: string; fund_id: string | null }, pares: Par[], n = 3): Par[] {
  return pares.filter((p) => p.isin !== f.isin && !(f.fund_id && p.fund_id === f.fund_id))
    .sort((a, b) => b.nota - a.nota).slice(0, n)
}

/** Señales de un fondo de una cartera. `notas`: su nota semanal; `pares`: los fondos de su categoría con su nota de la
 * última semana (para la mediana del TER); `candidatos`: los que podrían sustituirlo (por defecto, los mismos pares);
 * `correlaciones`: con cada uno de los otros fondos de la cartera. */
export function senales(f: { isin: string; ter: number | null; fund_id: string | null }, notas: NotaSemanal[], pares: Par[], u: Umbrales,
  correlaciones: { nombre: string; c: number | null }[], candidatos: Par[] = pares): Senal[] {
  const out: Senal[] = []
  const e = evolucion(notas, u.empeora_meses)
  if (e?.percentil != null && e.percentil < u.nota_baja_percentil)
    out.push({ tipo: 'Nota baja', motivo: `Nota ${n0(e.nota)}: percentil ${n0(e.percentil)} de su categoría (umbral ${u.nota_baja_percentil}).` })
  if (e?.periodo != null && e.periodo <= -u.empeora_puntos)
    out.push({ tipo: 'Empeora', motivo: `Ha perdido ${n0(-e.periodo)} puntos de nota en ${u.empeora_meses} meses (umbral ${u.empeora_puntos}).` })
  if (e && f.ter != null) {
    const mejores = alternativas(f, candidatos, Infinity).filter((p) => p.nota >= e.nota + u.mejor_puntos && p.ter != null && p.ter <= f.ter!)
    if (mejores.length)
      out.push({ tipo: 'Hay algo claramente mejor', motivo: `${mejores[0].nombre} tiene ${n0(mejores[0].nota - e.nota)} puntos más de nota y un TER de ${n2(mejores[0].ter!)} %` +
        (mejores.length > 1 ? `; en total, ${mejores.length} fondos de su categoría con ${u.mejor_puntos} puntos más o más y TER igual o menor.` : '.') })
  }
  const med = mediana(pares.map((p) => p.ter).filter((t): t is number => t != null))
  if (f.ter != null && med != null && f.ter - med >= u.caro_puntos_ter - 1e-9)
    out.push({ tipo: 'Caro', motivo: `TER ${n2(f.ter)} % frente a una mediana de ${n2(med)} % en su categoría: +${n2(f.ter - med)} puntos (umbral ${n2(u.caro_puntos_ter)}).` })
  const juntos = correlaciones.filter((x) => x.c != null && x.c >= u.redundante_correlacion)
  if (juntos.length)
    out.push({ tipo: 'Redundante', motivo: `Correlación de ${juntos.map((x) => `${n2(x.c!)} con ${x.nombre}`).join(' y ')} (umbral ${n2(u.redundante_correlacion)}).` })
  return out
}
