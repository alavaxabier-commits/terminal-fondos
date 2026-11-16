import { quitarDeBandeja, useBandeja, vaciarBandeja } from '../datos/bandeja'

/** Franja con los fondos del comparador («+ Comparar» o tecla b) y el paso a él. Vacía, no se pinta. */
export default function Bandeja() {
  const fondos = useBandeja()
  if (!fondos.length) return null
  return (
    <section aria-label="Fondos para comparar" className="flex flex-wrap items-center gap-2 rounded-lg border border-borde bg-panel px-3 py-2">
      <h2 className="etiqueta text-suave">Comparando {fondos.length}</h2>
      <ul className="flex flex-wrap gap-2">
        {fondos.map((f) => (
          <li key={f.isin} className="flex items-center gap-2 rounded border border-borde bg-fondo px-3 py-0.5">
            <a href={`#/fondo/${f.isin}`} className="hover:text-acento">{f.nombre}</a>
            <button onClick={() => quitarDeBandeja(f.isin)} aria-label={`Quitar ${f.nombre} del comparador`} className="text-suave hover:text-baja">✕</button>
          </li>
        ))}
      </ul>
      <span className="ml-auto flex gap-2">
        <a href={`#/comparar/${fondos.map((f) => f.isin).join(',')}`}
          className="flex min-h-8 items-center rounded bg-acento px-4 text-panel">ver comparación</a>
        <button onClick={vaciarBandeja} className="min-h-8 rounded bg-borde/50 px-4 text-suave hover:text-texto">vaciar</button>
      </span>
    </section>
  )
}
