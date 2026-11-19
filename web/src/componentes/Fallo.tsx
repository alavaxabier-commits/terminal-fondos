import { Component } from 'react'

/** Error de lectura con su salida: «Reintentar» vuelve a cargar la página (todo se lee de nuevo). */
export default function Fallo({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-baja">
      <span>{children}</span>
      <button onClick={() => location.reload()} className="boton min-h-7 text-[12px]">Reintentar</button>
    </p>
  )
}

/** Un fallo al pintar se queda en su trozo con su «Reintentar», en lugar de dejar la web en blanco. `sin`: qué enseñar en su lugar. */
export class Barrera extends Component<{ children: React.ReactNode; sin?: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return this.props.sin !== undefined ? this.props.sin : <Fallo>No se ha podido pintar esta pantalla: {error.message}</Fallo>
  }
}
