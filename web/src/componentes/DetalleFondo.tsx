import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { base100, haceAnos, type Punto } from '../calculo/series'
import { alternar, MAX_BANDEJA, useBandeja } from '../datos/bandeja'
import { serieEur } from '../datos/series'
import Grafico from './Grafico'

/** Panel del fondo seleccionado en una lista (Screener, Seguimiento): nombre, línea de datos, nota, lo que añada cada
 *  pantalla (`children`), su evolución a 3 años en base 100 y los botones de seguir, bandeja y ficha. */
export default function DetalleFondo({ isin, nombre, divisa, linea, nota, children, seguido, seguir }: {
  isin: string; nombre: string; divisa: string | null; linea: string; nota: ReactNode; children?: ReactNode; seguido: boolean; seguir: () => void
}) {
  const [serie, setSerie] = useState<Punto[] | null>(null)
  const bandeja = useBandeja()
  const enBandeja = bandeja.some((x) => x.isin === isin)

  useEffect(() => {
    let vigente = true // al moverse deprisa por la lista, la respuesta de un fondo anterior no pisa la del actual
    setSerie(null)
    serieEur(isin, divisa).then((s) => vigente && setSerie(s)).catch(() => vigente && setSerie([]))
    return () => { vigente = false }
  }, [isin, divisa])
  const lineas = useMemo(() => (serie?.length ? [{ nombre: 'Base 100 · 3A', serie: base100(serie, haceAnos(serie.at(-1)!.fecha, 3)), color: 'acento' }] : []), [serie])

  const boton = 'min-h-8 border px-3'
  return (
    <section aria-label="Detalle del fondo" className="flex flex-col gap-3 border border-borde p-3">
      <div>
        <a href={`#/fondo/${isin}`} className="font-bold hover:text-acento">{nombre}</a>
        <p className="text-suave">{linea}</p>
      </div>
      {nota}
      {children}
      {serie == null ? <p className="h-48 text-suave">Cargando la serie…</p> : lineas.length ? <Grafico lineas={lineas} alto="h-48" /> : <p className="text-suave">Sin valores descargados.</p>}
      <div className="flex flex-wrap gap-2">
        <button onClick={seguir} disabled={seguido} className={`${boton} border-acento text-acento disabled:border-borde disabled:text-suave`}>{seguido ? '★ en seguimiento' : '★ seguir'}</button>
        <button onClick={() => alternar({ isin, nombre })} disabled={!enBandeja && bandeja.length >= MAX_BANDEJA} aria-pressed={enBandeja}
          title={!enBandeja && bandeja.length >= MAX_BANDEJA ? `Como mucho ${MAX_BANDEJA} fondos en la bandeja` : undefined}
          className={`${boton} border-borde hover:text-texto disabled:text-suave ${enBandeja ? 'text-acento' : 'text-suave'}`}>{enBandeja ? '− de la bandeja' : '+ a la bandeja'}</button>
        <a href={`#/fondo/${isin}`} className={`${boton} flex items-center border-borde text-suave hover:text-texto`}>abrir ficha</a>
      </div>
      <p className="text-[11px] text-suave">j/k mover · Intro ficha{seguido ? '' : ' · s seguir'} · b bandeja</p>
    </section>
  )
}
