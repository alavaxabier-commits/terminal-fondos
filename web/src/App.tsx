import type { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import Buscador from './componentes/Buscador'
import { supabase } from './datos/supabase'
import Cartera from './pantallas/Cartera'
import Comparar from './pantallas/Comparar'
import Entrar from './pantallas/Entrar'
import Ficha from './pantallas/Ficha'
import Inicio from './pantallas/Inicio'
import Revision from './pantallas/Revision'
import Screener from './pantallas/Screener'
import Seguimiento from './pantallas/Seguimiento'
import Simular from './pantallas/Simular'

/** Ruta mínima por el hash: #/fondo/ISIN, #/cartera/N, #/simular/N[/SALE/ENTRA], #/comparar/ISIN,… y las fijas. Sin librería de rutas. */
function useRuta(): string {
  const [ruta, setRuta] = useState(location.hash)
  useEffect(() => {
    const cambia = () => setRuta(location.hash)
    addEventListener('hashchange', cambia)
    return () => removeEventListener('hashchange', cambia)
  }, [])
  return ruta
}

/** Atajos de la especificación: 1 inicio, 3 screener, 4 seguimiento, r revisión, c comparador (con el fondo abierto),
 *  m simulador (con la cartera abierta). No actúan mientras se escribe en un campo. */
function useAtajos(ruta: string) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName ?? '')) return
      const fondo = ruta.match(/^#\/fondo\/([A-Z0-9]{12})$/)?.[1]
      const cartera = ruta.match(/^#\/cartera\/(\d+)$/)?.[1]
      const destino = ({ '1': '#/', '3': '#/screener', '4': '#/seguimiento', r: '#/revision', c: fondo ? `#/comparar/${fondo}` : '#/comparar', m: cartera && `#/simular/${cartera}` } as Record<string, string | undefined>)[e.key]
      if (destino) location.hash = destino
    }
    addEventListener('keydown', tecla)
    return () => removeEventListener('keydown', tecla)
  }, [ruta])
}

export default function App() {
  const [sesion, setSesion] = useState<Session | null | undefined>(undefined)
  const ruta = useRuta()
  useAtajos(ruta)

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
  const simular = ruta.match(/^#\/simular\/(\d+)(?:\/([A-Z0-9]{12})\/([A-Z0-9]{12}))?$/)
  const comparar = ruta.match(/^#\/comparar(?:\/([A-Z0-9,]*))?$/)
  return (
    <div className="mx-auto flex min-h-full max-w-7xl flex-col">
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-borde bg-fondo/95 px-4 py-2 backdrop-blur">
        <a href="#/" className="shrink-0 font-bold tracking-widest text-acento">
          TERMINAL<span className="hidden sm:inline"> DE FONDOS</span>
        </a>
        <nav aria-label="Pantallas" className="flex shrink-0 gap-1">
          {([['#/', 'inicio'], ['#/screener', 'screener'], ['#/seguimiento', 'seguimiento'], ['#/revision', 'revisión'], ['#/comparar', 'comparar']] as const).map(([h, t]) => (
            <a key={h} href={h} aria-current={((ruta || '#/') === h || (h === '#/comparar' && !!comparar)) ? 'page' : undefined}
              className={`px-2 py-1 ${(ruta || '#/') === h || (h === '#/comparar' && comparar) ? 'border border-borde bg-panel text-acento' : 'text-suave hover:text-texto'}`}>{t}</a>
          ))}
        </nav>
        <Buscador />
        <button
          onClick={() => supabase.auth.signOut()}
          className="shrink-0 text-suave hover:text-texto"
          title="Cerrar sesión"
        >
          salir
        </button>
      </header>
      <main className="flex-1 px-4 py-4">
        {fondo ? <Ficha key={fondo} isin={fondo} /> : cartera ? <Cartera key={cartera} id={+cartera} />
          : simular ? <Simular key={simular[0]} id={+simular[1]} sale={simular[2]} entra={simular[3]} />
          : comparar ? <Comparar isins={[...new Set((comparar[1] ?? '').split(',').filter((i) => /^[A-Z0-9]{12}$/.test(i)))].slice(0, 5)} /> : ruta === '#/screener' ? <Screener /> : ruta === '#/seguimiento' ? <Seguimiento /> : ruta === '#/revision' ? <Revision /> : <Inicio />}
      </main>
    </div>
  )
}
