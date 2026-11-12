import { useState } from 'react'
import { supabase } from '../datos/supabase'

/** Entrada sin contraseña: correo → enlace en el correo → dentro. No crea usuarios nuevos.
 *  (En el plan gratuito de Supabase la plantilla del correo no se puede editar, así que va el enlace por defecto.) */
export default function Entrar() {
  const [correo, setCorreo] = useState('')
  const [enviado, setEnviado] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [ocupado, setOcupado] = useState(false)

  async function pedirEnlace(e: React.FormEvent) {
    e.preventDefault()
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
        <form onSubmit={pedirEnlace} className="w-full max-w-sm space-y-4">
          <h1 className="font-bold tracking-widest text-acento">TERMINAL DE FONDOS</h1>
          <input type="email" required autoFocus placeholder="correo" value={correo}
                 onChange={(e) => setCorreo(e.target.value)} className={campo} autoComplete="email" />
          <button disabled={ocupado} className={boton}>Enviar enlace</button>
          {mensaje && <p className="text-baja">{mensaje}</p>}
        </form>
      )}
    </div>
  )
}
