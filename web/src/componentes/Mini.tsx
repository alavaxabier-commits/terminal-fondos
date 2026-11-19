/** Minigráfico de línea, sin ejes: solo la forma de la serie. `color`: token de estilos.css (acento, sube, baja…) o un var(…) ya hecho (la tinta de una cartera). */
export default function Mini({ valores, color = 'acento', area = false, className = 'h-6 w-20' }: { valores: number[]; color?: string; area?: boolean; className?: string }) {
  if (valores.length < 2) return <span className={`inline-block ${className}`} />
  const mn = Math.min(...valores), mx = Math.max(...valores), r = mx - mn || 1
  // Margen de 6 arriba y abajo para que el trazo no se corte en los extremos.
  const d = 'M' + valores.map((v, i) => `${((i / (valores.length - 1)) * 100).toFixed(2)},${(94 - ((v - mn) / r) * 88).toFixed(2)}`).join('L')
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" className={`block ${className}`} style={{ color: color.startsWith('var(') ? color : `var(--color-${color})` }}>
      {area && <path d={`${d}L100,100L0,100Z`} fill="currentColor" fillOpacity={0.1} />}
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
