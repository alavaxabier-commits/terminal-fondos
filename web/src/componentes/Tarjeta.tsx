/** Bloque de contenido: borde fino, fondo de panel y, si lo lleva, título con serifa y algo a la derecha. */
export default function Tarjeta({ titulo, extra, children, className = '' }: { titulo?: string; extra?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-borde bg-panel p-4 ${className}`}>
      {titulo && <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3"><h2 className="font-ancha text-xl">{titulo}</h2>{extra}</div>}
      {children}
    </section>
  )
}
