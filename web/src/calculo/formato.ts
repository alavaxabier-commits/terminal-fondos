// Formato de cifras en español (sin red).

/** Fecha de hoy, 'AAAA-MM-DD'. */
export const hoy = () => new Date().toISOString().slice(0, 10)

const num = (dec: number) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec })

/** 0.1234 → '+12,3 %'; null → '—'. */
export function pct(v: number | null | undefined, dec = 1, signo = true): string {
  if (v == null || !isFinite(v)) return '—'
  const t = num(dec).format(v * 100)
  return `${signo && v > 0 ? '+' : ''}${t} %`
}

/** 1.234 → '1,23'; null → '—'. */
export function cifra(v: number | null | undefined, dec = 2): string {
  if (v == null || !isFinite(v)) return '—'
  return num(dec).format(v)
}

/** 1536.31 (millones) → '1.536 M€'. */
export function millones(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return '—'
  return `${num(0).format(v)} M€`
}

/** '2026-11-06' → '06/11/2026'. */
export function fecha(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

/** Zona del percentil, la misma en toda la web (como el mapa de métricas): mejor cuarto en azul, peor cuarto en rojo, en medio neutro. */
export function colorPercentil(p: number | null | undefined): string {
  if (p == null) return 'text-suave'
  if (p >= 75) return 'text-acento'
  if (p < 25) return 'text-baja'
  return 'text-suave'
}
/** Fondo de la zona del percentil (tintes de liga). */
export const fondoPercentil = (p: number | null | undefined) => (p == null ? 'bg-panel' : p >= 75 ? 'bg-tinte-alta' : p < 25 ? 'bg-tinte-baja' : 'bg-borde/45')
