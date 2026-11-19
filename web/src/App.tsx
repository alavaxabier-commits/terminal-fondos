import type { Session } from '@supabase/supabase-js'
import { Fragment, useEffect, useState } from 'react'
import { PANTALLAS } from './calculo/ordenes'
import { estadoDescargas, type Tarea } from './calculo/vigilancia'
import Bandeja from './componentes/Bandeja'
import Buscador from './componentes/Buscador'
import CambiarContrasena from './componentes/CambiarContrasena'
import { escribiendo } from './componentes/teclas'
import { leerTema, ponerTema, type Tema } from './componentes/tema'
import { rutaCon, useBandeja } from './datos/bandeja'
import { tamanoBase, vigilancia } from './datos/consultas'
import { revisar, type Revision as DatosRevision } from './datos/revision'
import { supabase } from './datos/supabase'
import Cartera from './pantallas/Cartera'
import Comparar from './pantallas/Comparar'
import Entrar from './pantallas/Entrar'
import Ficha from './pantallas/Ficha'
import Inicio from './pantallas/Inicio'
import Cinta from './componentes/Cinta'
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
      if (escribiendo(e)) return
      const fondo = ruta.match(/^#\/fondo\/([A-Z0-9]{12})$/)?.[1]
      const cartera = ruta.match(/^#\/cartera\/(\d+)$/)?.[1]
      const destino = ({ '1': '#/', '3': '#/screener', '4': '#/seguimiento', r: '#/revision', c: fondo ? rutaCon(fondo) : '#/comparar', m: cartera && `#/simular/${cartera}` } as Record<string, string | undefined>)[e.key]
      if (destino) location.hash = destino
    }
    addEventListener('keydown', tecla)
    return () => removeEventListener('keydown', tecla)
  }, [ruta])
}

// Lo que se ve con «?»: los atajos de toda la app.
const ATAJOS: [string, string][] = [
  ['/', 'barra de órdenes: fondo, cartera o pantalla (↑↓ mover, Intro abrir, Esc cerrar)'],
  ['1 · 3 · 4 · r', 'inicio · screener · seguimiento · revisión'],
  ['c', 'comparador (con la ficha de un fondo abierta, lo añade)'],
  ['m', 'simulador (con una cartera abierta)'],
  ['a', 'añadir fondos en el comparador (filtros y nota del screener)'],
  ['j / ↓ · k / ↑', 'mover la selección en screener y seguimiento'],
  ['Intro · s · b', 'abrir la ficha · seguir · poner o quitar del comparador'],
  ['← / →', 'pestañas de la ficha y del comparador'],
  ['?', 'esta ayuda (Esc la cierra)'],
]

export type Estado = { descargas: Tarea[] | null; base: Awaited<ReturnType<typeof tamanoBase>>; revision: DatosRevision | null; error: string }

export default function App() {
  const [sesion, setSesion] = useState<Session | null | undefined>(undefined)
  const [estado, setEstado] = useState<Estado>({ descargas: null, base: null, revision: null, error: '' })
  const [ayuda, setAyuda] = useState(false)
  const [contrasena, setContrasena] = useState(false)
  const [tema, setTema] = useState<Tema>(leerTema)
  const ruta = useRuta()
  const bandeja = useBandeja()
  useAtajos(ruta)

  // Estado de las descargas, de la base y de las revisiones: una vez por visita, para la barra de estado y para Inicio.
  const usuario = sesion?.user.id
  useEffect(() => {
    if (!usuario) return
    const pon = (x: Partial<Estado>) => setEstado((e) => ({ ...e, ...x }))
    const falla = (e: Error) => pon({ error: e.message })
    vigilancia().then((l) => pon({ descargas: estadoDescargas(l, new Date()) })).catch(falla)
    tamanoBase().then((base) => pon({ base })).catch(falla)
    revisar().then((revision) => pon({ revision })).catch(falla)
  }, [usuario])

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAyuda(false)
      else if (e.key === '?' && !escribiendo(e)) setAyuda((a) => !a)
    }
    addEventListener('keydown', tecla)
    return () => removeEventListener('keydown', tecla)
  }, [])

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
  // el Screener tiene tabla y ficha lado a lado: usa hasta 96 rem (cabecera, contenido y pie, alineados)
  const ancho = ruta === '#/screener' ? 'max-w-[96rem]' : 'max-w-7xl'
  const inicio = !fondo && !cartera && !simular && !comparar && !['#/screener', '#/seguimiento', '#/revision'].includes(ruta)
  return (
    <div className="flex min-h-full flex-col">
      {/* Cabecera de liga: banda negra a todo el ancho; la pantalla actual, subrayada en amarillo. */}
      {/* Su alto (cambia en el móvil, donde las pantallas bajan a otra fila) en --alto-cabecera: lo usan las cabeceras pegadas. */}
      <header className="sticky top-0 z-10 bg-cabecera text-sobre-cabecera" ref={(el) => {
        if (!el) return
        const o = new ResizeObserver(() => document.documentElement.style.setProperty('--alto-cabecera', `${el.offsetHeight}px`))
        o.observe(el)
        return () => o.disconnect()
      }}>
        <div className={`mx-auto flex min-h-12 ${ancho} flex-wrap items-center gap-x-5 gap-y-2 px-4`}>
          <a href="#/" className="estrecha shrink-0 text-[19px] font-extrabold uppercase leading-none tracking-[0.01em]">
            <span className="hidden sm:inline">Terminal de fondos</span><span className="sm:hidden">Fondos</span>
          </a>
          <nav aria-label="Pantallas" className="pantallas order-last flex min-h-11 w-full min-w-0 self-stretch overflow-x-auto md:order-none md:w-auto">
            {PANTALLAS.map(([h, t]) => {
              const actual = (ruta || '#/') === h || (h === '#/comparar' && !!comparar)
              return (
                <a key={h} href={h} aria-current={actual ? 'page' : undefined}
                  className={`flex items-center whitespace-nowrap px-3 text-[14px] ${actual ? 'font-semibold shadow-[inset_0_-3px_0_var(--color-once)]' : 'opacity-75 hover:opacity-100'}`}>{t[0].toUpperCase() + t.slice(1)}</a>
              )
            })}
          </nav>
          <Buscador />
          <button onClick={() => { const t = tema === 'claro' ? 'oscuro' : 'claro'; setTema(t); ponerTema(t, true) }}
            aria-label={tema === 'claro' ? 'Pasar a tema oscuro' : 'Pasar a tema claro'} title={tema === 'claro' ? 'Tema oscuro' : 'Tema claro'}
            className="grid h-8 w-8 shrink-0 place-items-center opacity-75 hover:opacity-100">
            {/* En claro, la luna (lleva al oscuro); en oscuro, el sol. */}
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              {tema === 'claro'
                ? <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
                : <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>}
            </svg>
          </button>
          <button onClick={() => setContrasena(true)} aria-label="Contraseña" className="grid min-h-8 min-w-8 shrink-0 place-items-center text-[13px] opacity-75 hover:opacity-100" title="Poner o cambiar la contraseña">
            {/* en el móvil, iconos: el buscador necesita el sitio */}
            <span className="hidden sm:inline">Contraseña</span>
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 sm:hidden" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="15" r="4" /><path d="m10.8 12.2 9.2-9.2M17 6l3 3M14 9l2 2" /></svg>
          </button>
          <button onClick={() => supabase.auth.signOut()} aria-label="Salir" className="grid min-h-8 min-w-8 shrink-0 place-items-center text-[13px] opacity-75 hover:opacity-100" title="Cerrar sesión">
            <span className="hidden sm:inline">Salir</span>
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 sm:hidden" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" /></svg>
          </button>
        </div>
      </header>
      {inicio && <Cinta />}
      <main className={`mx-auto w-full flex-1 space-y-5 px-4 py-5 ${ancho}`}>
        {!comparar && <Bandeja />}
        {fondo ? <Ficha key={fondo} isin={fondo} /> : cartera ? <Cartera key={cartera} id={+cartera} />
          : simular ? <Simular key={simular[0]} id={+simular[1]} sale={simular[2]} entra={simular[3]} />
          : comparar ? <Comparar isins={comparar[1] ? [...new Set(comparar[1].split(',').filter((i) => /^[A-Z0-9]{12}$/.test(i)))].slice(0, 5) : bandeja.map((x) => x.isin)} /> : ruta === '#/screener' ? <Screener /> : ruta === '#/seguimiento' ? <Seguimiento /> : ruta === '#/revision' ? <Revision /> : <Inicio estado={estado} />}
      </main>
      <BarraEstado estado={estado} ancho={ancho} />
      {contrasena && <CambiarContrasena cerrar={() => setContrasena(false)} />}
      {ayuda && (
        <div role="dialog" aria-modal="true" aria-label="Atajos de teclado" onClick={() => setAyuda(false)} className="fixed inset-0 z-30 flex items-center justify-center bg-fondo/80 p-4">
          <section onClick={(e) => e.stopPropagation()} className="w-full max-w-lg border border-borde bg-panel p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="rotulo">Atajos</h2>
              <button onClick={() => setAyuda(false)} aria-label="Cerrar la ayuda" className="min-h-7 min-w-7 text-suave hover:text-texto">✕</button>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              {ATAJOS.map(([k, v]) => <Fragment key={k}><dt className="estrecha font-bold text-acento">{k}</dt><dd>{v}</dd></Fragment>)}
            </dl>
            <p className="mt-2 text-suave">Las teclas de una letra no actúan mientras se escribe en un campo.</p>
          </section>
        </div>
      )}
    </div>
  )
}

const LIMITE_MB = 500 // plan gratuito de Supabase
const mb = (bytes: number) => Math.round(bytes / 2 ** 20)
const cuando = (ts: string) => {
  const d = new Date(ts)
  return `${d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`
}

/** Barra de estado al pie: descargas (o sus alarmas, que se detallan en Inicio), espacio de la base y fondos a revisar. */
function BarraEstado({ estado: { descargas, base, revision, error }, ancho }: { estado: Estado; ancho: string }) {
  const mal = descargas?.some((t) => t.alarmas.length || t.atrasada)
  const ultima = descargas?.reduce((m, t) => (t.ts > m ? t.ts : m), '')
  const uso = base ? mb(base.total) / LIMITE_MB : 0
  const tono = uso >= 0.9 ? 'text-baja' : uso >= 0.8 ? 'text-aviso' : 'text-sube' // ámbar desde el 80 %, rojo desde el 90 %
  const aRevisar = revision?.carteras.reduce((n, c) => n + c.fondos.filter((f) => f.senales.length).length, 0) ?? 0
  return (
    <footer className="sticky bottom-0 z-10 border-t border-borde bg-panel text-[12px] text-suave">
      <div className={`mx-auto flex ${ancho} flex-wrap items-center gap-x-4 px-4 py-1`}>
      {mal ? <a href="#/" className="text-baja hover:underline">▲ alarmas en las descargas</a>
        : ultima ? <span title={descargas!.map((t) => `${t.tarea} ${cuando(t.ts)}`).join(' · ')}><span className="text-sube" aria-hidden="true">● </span>descargas {cuando(ultima)}</span>
        : <span>{descargas ? 'sin registro de descargas' : 'descargas …'}</span>}
      {base && (
        <span title={`${base.tablas.map((t) => `${t.tabla} ${mb(t.bytes)}`).join(', ')} MB`}>
          base <span className={tono}>{mb(base.total)}</span>/{LIMITE_MB} MB
        </span>
      )}
      {aRevisar > 0 && <a href="#/revision" className="text-aviso hover:underline">▲ {aRevisar} a revisar</a>}
      {error && <span className="text-baja" title={error}>▲ estado sin leer</span>}
      <span className="ml-auto hidden sm:inline">/ órdenes · j/k mover · ? ayuda</span>
      </div>
    </footer>
  )
}
