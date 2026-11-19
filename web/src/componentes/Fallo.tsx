/** Error de lectura con su salida: «Reintentar» vuelve a cargar la página (todo se lee de nuevo). */
export default function Fallo({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-baja">
      <span>{children}</span>
      <button onClick={() => location.reload()} className="boton min-h-7 text-[12px]">Reintentar</button>
    </p>
  )
}
