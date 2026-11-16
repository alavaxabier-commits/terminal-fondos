import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { base100, haceAnos, type Punto } from '../calculo/series'
import { alternar, MAX_BANDEJA, useBandeja } from '../datos/bandeja'
import { serieEur } from '../datos/series'
import Grafico from './Grafico'
import Cargando from './Cargando'

/** Panel del fondo seleccionado en una lista (Screener, Seguimiento): nombre, línea de datos, nota, lo que añada cada
 *  pantalla (`children`), su evolución a 3 años en base 100 y los botones de seguir, comparar y ficha. */
export default function DetalleFondo({ isin, nombre, divisa, linea, nota, children, seguido, seguir, categoria }: {
  isin: string; nombre: string; divisa: string | null; linea: string; nota: ReactNode; children?: ReactNode; seguido: boolean; seguir: () => void
  categoria?: string | null
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

  return (
    <section aria-label="Detalle del fondo" className="flex flex-col gap-3 rounded-lg border border-borde bg-panel p-4 text-[13px]">
      <div className="space-y-1">
        {categoria && <p className="rotulo text-acento!">{categoria}</p>}
        <a href={`#/fondo/${isin}`} className="block text-xl font-semibold leading-tight tracking-tight hover:text-acento">{nombre}</a>
        <p className="text-[12px] text-suave">{linea}</p>
      </div>
      {nota}
      {children}
      <div>
        <p className="text-[11px] text-suave">Evolución 3 años · base 100</p>
        {serie == null ? <Cargando texto="Cargando la serie…" /> : lineas.length ? <Grafico lineas={lineas} alto="h-40" /> : <p className="text-suave">Sin valores descargados.</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={seguir} disabled={seguido} className={`boton-pri`}>{seguido ? '★ Siguiendo' : '★ Seguir'}</button>
        <button onClick={() => alternar({ isin, nombre })} disabled={!enBandeja && bandeja.length >= MAX_BANDEJA} aria-pressed={enBandeja}
          title={!enBandeja && bandeja.length >= MAX_BANDEJA ? `Como mucho ${MAX_BANDEJA} fondos en el comparador` : undefined}
          className={`boton ${enBandeja ? 'text-acento' : 'text-texto'}`}>{enBandeja ? '− Comparar' : '+ Comparar'}</button>
        <a href={`#/fondo/${isin}`} className={`boton`}>Abrir ficha</a>
      </div>
      <p className="text-[11px] text-suave">j/k mover · Intro ficha{seguido ? '' : ' · s seguir'} · b comparar</p>
    </section>
  )
}
