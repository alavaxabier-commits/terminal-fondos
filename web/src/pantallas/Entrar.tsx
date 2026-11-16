import { useState } from 'react'
import { supabase } from '../datos/supabase'

/** Entrada con correo y contraseña; si no hay contraseña (o se ha olvidado), enlace por correo. No crea usuarios nuevos.
 *  La contraseña se pone o cambia ya dentro («contraseña» en la cabecera).
 *  (En el plan gratuito de Supabase la plantilla del correo no se puede editar, así que va el enlace por defecto.) */
export default function Entrar() {
  const [correo, setCorreo] = useState('')
  const [clave, setClave] = useState('')
  const [enviado, setEnviado] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [ocupado, setOcupado] = useState(false)

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    setOcupado(true)
    setMensaje('')
    const { error } = await supabase.auth.signInWithPassword({ email: correo.trim(), password: clave })
    setOcupado(false)
    // Sin sesión no hay más que hacer: con sesión, App cambia de pantalla sola.
    if (error) setMensaje(/rate|seconds|many/i.test(error.message)
      ? 'Demasiados intentos seguidos; espera un poco y vuelve a intentarlo.'
      : 'Correo o contraseña incorrectos. Si aún no tienes contraseña, pide un enlace.')
  }

  async function pedirEnlace() {
    if (!/^\S+@\S+\.\S+$/.test(correo.trim())) return setMensaje('Escribe tu correo para recibir el enlace.')
    setOcupado(true)
    setMensaje('')
    const { error } = await supabase.auth.signInWithOtp({
      email: correo.trim(),
      options: { shouldCreateUser: false, emailRedirectTo: location.origin },
    })
    setOcupado(false)
    if (error) setMensaje(/rate|seconds/i.test(error.message)
      ? 'Has pedido varios enlaces seguidos; espera un poco y vuelve a intentarlo.'
      : 'No se ha podido enviar el enlace. ¿Es el correo correcto?')
    else setEnviado(true)
  }

  const campo = 'w-full border border-borde bg-panel px-3 py-2 text-texto outline-none focus:border-acento'
  const boton = 'w-full border border-acento px-3 py-2 text-acento hover:bg-acento hover:text-fondo disabled:opacity-50'
  return (
    <div className="flex min-h-full items-center justify-center p-6">
      {enviado ? (
        <div className="w-full max-w-sm space-y-4">
          <h1 className="font-bold tracking-widest text-acento">TERMINAL DE FONDOS</h1>
          <p>Te hemos enviado un enlace a <span className="text-acento">{correo}</span>.</p>
          <p className="text-suave">Ábrelo en este mismo dispositivo. Si no llega en un par de minutos, mira en spam.</p>
          <button className="text-suave underline" onClick={() => setEnviado(false)}>volver</button>
        </div>
      ) : (
        <form onSubmit={entrar} className="w-full max-w-sm space-y-4">
          <h1 className="font-bold tracking-widest text-acento">TERMINAL DE FONDOS</h1>
          <input type="email" required autoFocus placeholder="correo" aria-label="Correo" value={correo}
                 onChange={(e) => setCorreo(e.target.value)} className={campo} autoComplete="email" />
          <input type="password" required placeholder="contraseña" value={clave} aria-label="Contraseña"
                 onChange={(e) => setClave(e.target.value)} className={campo} autoComplete="current-password" />
          <button disabled={ocupado} className={boton}>Entrar</button>
          <button type="button" disabled={ocupado} onClick={pedirEnlace} className="text-suave underline hover:text-texto disabled:opacity-50">
            Sin contraseña: enviarme un enlace
          </button>
          {mensaje && <p className="text-baja">{mensaje}</p>}
        </form>
      )}
    </div>
  )
}
