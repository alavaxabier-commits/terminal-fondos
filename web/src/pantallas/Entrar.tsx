import { useState } from 'react'
import { supabase } from '../datos/supabase'

/** Entrada sin contraseña: correo → código de 6 cifras → dentro. No crea usuarios nuevos. */
export default function Entrar() {
  const [correo, setCorreo] = useState('')
  const [codigo, setCodigo] = useState('')
  const [paso, setPaso] = useState<'correo' | 'codigo'>('correo')
  const [mensaje, setMensaje] = useState('')
  const [ocupado, setOcupado] = useState(false)

  async function pedirCodigo(e: React.FormEvent) {
    e.preventDefault()
    setOcupado(true)
    setMensaje('')
    const { error } = await supabase.auth.signInWithOtp({ email: correo.trim(), options: { shouldCreateUser: false } })
    setOcupado(false)
    if (error) setMensaje('No se ha podido enviar el código. ¿Es el correo correcto?')
    else {
      setPaso('codigo')
      setMensaje('Te hemos enviado un código a tu correo.')
    }
  }

  async function verificar(e: React.FormEvent) {
    e.preventDefault()
    setOcupado(true)
    const { error } = await supabase.auth.verifyOtp({ email: correo.trim(), token: codigo.trim(), type: 'email' })
    setOcupado(false)
    if (error) setMensaje('Código incorrecto o caducado.')
  }

  const campo = 'w-full border border-borde bg-panel px-3 py-2 text-texto outline-none focus:border-acento'
  const boton = 'w-full border border-acento px-3 py-2 text-acento hover:bg-acento hover:text-fondo disabled:opacity-50'
  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <form onSubmit={paso === 'correo' ? pedirCodigo : verificar} className="w-full max-w-sm space-y-4">
        <h1 className="font-bold tracking-widest text-acento">TERMINAL DE FONDOS</h1>
        {paso === 'correo' ? (
          <input type="email" required autoFocus placeholder="correo" value={correo}
                 onChange={(e) => setCorreo(e.target.value)} className={campo} autoComplete="email" />
        ) : (
          <input inputMode="numeric" required autoFocus placeholder="código de 6 cifras" value={codigo}
                 onChange={(e) => setCodigo(e.target.value)} className={campo} autoComplete="one-time-code" maxLength={10} />
        )}
        <button disabled={ocupado} className={boton}>{paso === 'correo' ? 'Enviar código' : 'Entrar'}</button>
        {mensaje && <p className="text-suave">{mensaje}</p>}
        {paso === 'codigo' && (
          <button type="button" className="text-suave underline" onClick={() => { setPaso('correo'); setCodigo('') }}>
            cambiar de correo
          </button>
        )}
      </form>
    </div>
  )
}
