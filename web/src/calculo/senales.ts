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
