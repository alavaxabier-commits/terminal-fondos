/** Las cifras clave de la cabecera (ficha y cartera), en una franja a todo el ancho separadas por filetes. */
export default function Franja({ cifras }: { cifras: { etiqueta: string; valor: string; clase?: string; pie?: React.ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-2 border-y border-borde sm:grid-cols-3 lg:grid-cols-5">
      {cifras.map((c) => (
        <div key={c.etiqueta} className="flex flex-col gap-0.5 border-borde py-3 max-lg:border-t max-lg:first:border-t-0 lg:border-l lg:px-4 lg:first:border-l-0 lg:first:pl-0 max-sm:[&:nth-child(2)]:border-t-0 sm:max-lg:[&:nth-child(-n+3)]:border-t-0">
          <dt className="text-[12px] text-suave">{c.etiqueta}</dt>
          <dd className={`cifra text-3xl leading-tight tabular ${c.clase ?? ''}`}>{c.valor}</dd>
          {c.pie != null && <dd className="text-[12px] text-suave">{c.pie}</dd>}
        </div>
      ))}
    </dl>
  )
}
