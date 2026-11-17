import { cuandoNovedad, type Novedad } from '../calculo/novedades'

/** Novedades en lista: qué pasa, con qué fondo (con la tinta de sus carteras, si se pasa) y cuándo. */
export default function ListaNovedades({ lista, conFondo = false, tintas, enlace }: {
  lista: Novedad[]; conFondo?: boolean; tintas?: Map<string, string[]>; enlace?: (n: Novedad) => React.ReactNode
}) {
  return (
    <ul>
      {lista.map((n) => (
        <li key={n.isin + n.tipo + (n.fecha ?? '')} className={`grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-0.5 border-b border-borde py-2.5 last:border-b-0 ${conFondo ? 'md:grid-cols-[9.5rem_minmax(0,16rem)_minmax(0,1fr)_6rem_auto]' : 'md:grid-cols-[9.5rem_minmax(0,1fr)_6rem_auto]'}`}>
          <span className="estrecha text-[13px] font-bold uppercase tracking-[0.04em] text-aviso">{n.titulo}</span>
          {conFondo && (
            <a href={`#/fondo/${n.isin}`} className="flex min-w-0 items-baseline gap-1.5 hover:text-acento max-md:order-first max-md:col-span-2">
              {tintas?.get(n.isin)?.map((t) => <i key={t} aria-hidden="true" className="inline-block h-2.5 w-2.5 shrink-0 translate-y-px" style={{ background: t }} />)}
              <span className="truncate font-medium">{n.nombre}</span>
            </a>
          )}
          <span className="max-md:col-span-2 max-md:order-last">{n.texto}</span>
          <span className="text-[12px] text-suave">{cuandoNovedad(n)}</span>
          {enlace && <span className="text-[13px] whitespace-nowrap">{enlace(n)}</span>}
        </li>
      ))}
    </ul>
  )
}
