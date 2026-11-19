import { useEffect, useState, type ReactNode } from 'react'
import { alternar, MAX_BANDEJA, useBandeja } from '../datos/bandeja'
import { cargar, Evolucion, Pct, type Cats, type Extra } from './TarjetaFondo'

export type CifraPanel = [etiqueta: string, valor: number | null, percentil: number | null, formato: (v: number) => string, conSigno?: boolean]
const tono = (v: number | null) => (v == null ? '' : v >= 0 ? 'text-sube' : 'text-baja')

/** Panel del fondo elegido en Seguimiento: datos, evolución frente a su referencia, nota, cifras frente a su categoría,
 *  lo que añada la pantalla (`children`: señales, tu nota, dejar de seguir) y los botones de comparar y ficha. */
export default function DetalleFondo({ isin, nombre, divisa, datos, cats, nota, cifras, children }: {
  isin: string; nombre: string; divisa: string | null; datos: string[]; cats: Cats | null; nota: ReactNode; cifras: CifraPanel[]; children?: ReactNode
}) {
  const [extra, setExtra] = useState<Extra | null>(null)
  const bandeja = useBandeja()
  const enBandeja = bandeja.some((x) => x.isin === isin)
  const seccion = 'flex flex-col gap-2 border-t border-borde pt-3'

  useEffect(() => {
    let vigente = true // al moverse deprisa por la lista, la respuesta de un fondo anterior no pisa la del actual
    setExtra(null)
    cargar({ isin, divisa }, cats).then((x) => vigente && setExtra(x)).catch(() => vigente && setExtra({ serie: [], ref: [], nombreRef: '', carteras: [] }))
    return () => { vigente = false }
  }, [isin, divisa, cats])

  return (
    <section aria-label="Detalle del fondo" className="flex flex-col gap-3 rounded-lg border border-borde bg-panel p-4 text-[13px]">
      <div className="space-y-1.5">
        <a href={`#/fondo/${isin}`} className="block text-xl font-semibold leading-tight tracking-tight hover:text-acento">{nombre}</a>
        <div className="flex flex-wrap gap-1 text-[11px] text-suave">
          {datos.map((d) => <span key={d} className="rounded-sm bg-borde/50 px-2">{d}</span>)}
        </div>
      </div>
      {nota}
      <div className={seccion}><Evolucion extra={extra} /></div>
      {cifras.length > 0 && (
        <div className={seccion}>
          <div className="flex items-baseline justify-between gap-2"><h3 className="text-[12px] font-medium text-suave">Frente a su categoría</h3><span className="text-[11px] text-suave">percentil · 100 = mejor</span></div>
          {cifras.map(([et, v, p, fmt, signo]) => (
            <div key={et} className="grid grid-cols-[minmax(0,1fr)_4rem_4.5rem_1.75rem] items-center gap-2">
              <span className="truncate text-suave">{et}</span>
              <span className={`text-right tabular ${signo ? tono(v) : ''}`}>{v == null ? '—' : fmt(v)}</span>
              <Pct p={v == null ? null : p} />
            </div>
          ))}
        </div>
      )}
      {children && <div className={seccion}>{children}</div>}
      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => alternar({ isin, nombre })} disabled={!enBandeja && bandeja.length >= MAX_BANDEJA} aria-pressed={enBandeja}
          title={!enBandeja && bandeja.length >= MAX_BANDEJA ? `Como mucho ${MAX_BANDEJA} fondos en el comparador` : undefined}
          className={`boton min-h-8 px-2.5 text-[12.5px] ${enBandeja ? 'text-acento' : 'text-texto'}`}>{enBandeja ? '− Comparar' : '+ Comparar'}</button>
        <a href={`#/fondo/${isin}`} className="boton min-h-8 px-2.5 text-[12.5px]">Ficha</a>
      </div>
      <p className="text-[11px] text-suave">j/k mover · Intro ficha · b comparar · x dejar de seguir</p>
    </section>
  )
}
