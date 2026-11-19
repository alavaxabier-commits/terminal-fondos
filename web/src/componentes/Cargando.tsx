/** Hueco con la forma de lo que viene mientras carga (frontend-ui y dataviz: nada de pantallas en blanco ni saltos).
 *  `pagina`: título, franja de cifras y un bloque grande; si no, un bloque de la altura pedida. El texto lo leen los lectores de pantalla. */
export default function Cargando({ texto = 'Cargando…', pagina = false, alto = 'h-40' }: { texto?: string; pagina?: boolean; alto?: string }) {
  const hueco = 'bg-borde/50 motion-safe:animate-pulse'
  return (
    <div role="status" aria-busy="true" className="space-y-4">
      <span className="sr-only">{texto}</span>
      {pagina ? <>
        <div className={`h-4 w-48 ${hueco}`} />
        <div className={`h-9 w-2/3 max-w-xl ${hueco}`} />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">{[0, 1, 2, 3, 4].map((i) => <div key={i} className={`h-20 ${hueco}`} />)}</div>
        <div className={`h-80 ${hueco}`} />
      </> : <div className={`${alto} ${hueco}`} />}
    </div>
  )
}
