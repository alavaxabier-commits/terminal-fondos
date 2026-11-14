import { quitarDeBandeja, useBandeja, vaciarBandeja } from '../datos/bandeja'

/** Franja con los candidatos apartados (tecla b o «+ a la bandeja») y el paso al comparador. Vacía, no se pinta. */
export default function Bandeja() {
  const fondos = useBandeja()
  if (!fondos.length) return null
  return (
    <section aria-label="Bandeja de candidatos" className="flex flex-wrap items-center gap-2 border border-borde bg-panel px-3 py-2">
      <h2 className="text-[11px] uppercase tracking-widest text-suave">Bandeja</h2>
      <ul className="flex flex-wrap gap-2">
        {fondos.map((f) => (
          <li key={f.isin} className="flex items-center gap-2 border border-borde bg-fondo px-2 py-0.5">
            <a href={`#/fondo/${f.isin}`} className="hover:text-acento">{f.nombre}</a>
            <button onClick={() => quitarDeBandeja(f.isin)} aria-label={`Quitar ${f.nombre} de la bandeja`} className="text-suave hover:text-baja">✕</button>
          </li>
        ))}
      </ul>
      <span className="ml-auto flex gap-2">
        <button onClick={() => { location.hash = `#/comparar/${fondos.map((f) => f.isin).join(',')}` }} disabled={fondos.length < 2}
          className="min-h-8 border border-acento px-3 text-acento disabled:border-borde disabled:text-suave">comparar {fondos.length}</button>
        <button onClick={vaciarBandeja} className="min-h-8 border border-borde px-3 text-suave hover:text-texto">vaciar</button>
      </span>
    </section>
  )
}
