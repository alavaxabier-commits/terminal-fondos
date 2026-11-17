/** Bloque de contenido: borde fino, fondo de panel y, si lo lleva, título y algo a la derecha. */
export default function Tarjeta({ titulo, extra, children, className = '' }: { titulo?: string; extra?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-borde bg-panel p-5 shadow-[0_1px_2px_rgb(0_0_0/0.04)] ${className}`}>
      {titulo && <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3"><h2 className="text-[15px] font-semibold tracking-tight">{titulo}</h2>{extra}</div>}
      {children}
    </section>
  )
}
