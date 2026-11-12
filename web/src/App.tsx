import type { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import Buscador from './componentes/Buscador'
import { supabase } from './datos/supabase'
import Cartera from './pantallas/Cartera'
import Entrar from './pantallas/Entrar'
import Ficha from './pantallas/Ficha'
import Inicio from './pantallas/Inicio'

/** Ruta mínima por el hash: #/fondo/ISIN o inicio. Sin librería de rutas. */
function useRuta(): string {
  const [ruta, setRuta] = useState(location.hash)
  useEffect(() => {
    const cambia = () => setRuta(location.hash)
    addEventListener('hashchange', cambia)
    return () => removeEventListener('hashchange', cambia)
  }, [])
  return ruta
}

export default function App() {
  const [sesion, setSesion] = useState<Session | null | undefined>(undefined)
  const ruta = useRuta()

  useEffect(() => {
    // Al volver del enlace del correo, la dirección trae la sesión en el hash (#access_token=…): se limpia.
    const limpiar = () => {
      if (/access_token|error_description/.test(location.hash)) history.replaceState(null, '', location.pathname + '#/')
    }
    supabase.auth.getSession().then(({ data }) => { setSesion(data.session); limpiar() })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => { setSesion(s); limpiar() })
    return () => data.subscription.unsubscribe()
  }, [])

  if (sesion === undefined) return <p className="p-6 text-suave">Cargando…</p>
  if (!sesion) return <Entrar />

  const fondo = ruta.match(/^#\/fondo\/([A-Z0-9]{12})$/)?.[1]
  const cartera = ruta.match(/^#\/cartera\/(\d+)$/)?.[1]
  return (
    <div className="mx-auto flex min-h-full max-w-6xl flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-borde bg-fondo/95 px-4 py-2 backdrop-blur">
        <a href="#/" className="shrink-0 font-bold tracking-widest text-acento">
          TERMINAL<span className="hidden sm:inline"> DE FONDOS</span>
        </a>
        <Buscador />
        <button
          onClick={() => supabase.auth.signOut()}
          className="shrink-0 text-suave hover:text-texto"
          title="Cerrar sesión"
        >
          salir
        </button>
      </header>
      <main className="flex-1 px-4 py-4">{fondo ? <Ficha key={fondo} isin={fondo} /> : cartera ? <Cartera key={cartera} id={+cartera} /> : <Inicio />}</main>
    </div>
  )
}
