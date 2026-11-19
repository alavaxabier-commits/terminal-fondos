/** Bloque de contenido: filete fino, papel de panel y, si lo lleva, título de liga (estrecha, mayúsculas) y algo a la derecha. */
export default function Tarjeta({ titulo, extra, children, className = '' }: { titulo?: string; extra?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`border border-borde bg-panel p-4 ${className}`}>
      {titulo && <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3"><h2 className="estrecha text-[17px] font-bold uppercase tracking-[0.02em]">{titulo}</h2>{extra}</div>}
      {children}
    </section>
  )
}
