// Series de precios para los gráficos (sin red). Fechas en ISO 'AAAA-MM-DD', que se ordenan como texto.

export type Punto = { fecha: string; valor: number }

/** Pasa a EUR con el tipo del BCE (unidades por 1 EUR) del día o del último día anterior con tipo. */
export function aEur(serie: Punto[], tipos: Punto[]): Punto[] {
  if (!tipos.length) return []
  const out: Punto[] = []
  let j = 0
  for (const p of serie) {
    while (j + 1 < tipos.length && tipos[j + 1].fecha <= p.fecha) j++
    if (tipos[j].fecha <= p.fecha) out.push({ fecha: p.fecha, valor: p.valor / tipos[j].valor })
  }
  return out
}

/** La serie desde `desde`, reescalada para que su primer valor sea 100. */
export function base100(serie: Punto[], desde: string): Punto[] {
  const tramo = serie.filter((p) => p.fecha >= desde)
  if (!tramo.length) return []
  const v0 = tramo[0].valor
  return tramo.map((p) => ({ fecha: p.fecha, valor: (p.valor / v0) * 100 }))
}

/** Índice combinado (p. ej. 60/40) rebalanceado en cada fecha común a todos sus componentes. */
export function combinar(componentes: { serie: Punto[]; peso: number }[]): Punto[] {
  if (!componentes.length || componentes.some((c) => !c.serie.length)) return []
  const mapas = componentes.map((c) => new Map(c.serie.map((p) => [p.fecha, p.valor])))
  const comunes = [...mapas[0].keys()].filter((f) => mapas.every((m) => m.has(f))).sort()
  const out: Punto[] = []
  let v = 100
  comunes.forEach((f, i) => {
    if (i > 0) {
      const prev = comunes[i - 1]
      v *= 1 + componentes.reduce((s, c, k) => s + c.peso * (mapas[k].get(f)! / mapas[k].get(prev)! - 1), 0)
    }
    out.push({ fecha: f, valor: v })
  })
  return out
}

/** Fecha ISO de hace `anos` años respecto a `hoy`. */
export function haceAnos(hoy: string, anos: number): string {
  const d = new Date(hoy + 'T00:00:00Z')
  d.setUTCFullYear(d.getUTCFullYear() - anos)
  return d.toISOString().slice(0, 10)
}

/** Primera fecha en que hay dato en todas las series (para que fondo e índice empiecen juntos). */
export function inicioComun(series: Punto[][], desde: string): string {
  const firsts = series.filter((s) => s.length).map((s) => s.find((p) => p.fecha >= desde)?.fecha ?? '9999')
  return firsts.length ? firsts.sort().at(-1)! : desde
}
