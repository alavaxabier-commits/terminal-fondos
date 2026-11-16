import { useState } from 'react'
import { supabase } from '../datos/supabase'

const MINIMO = 12

/** Pone o cambia la contraseña de la cuenta (ya dentro, con sesión). Diálogo pequeño; Esc o fuera lo cierra. */
export default function CambiarContrasena({ cerrar }: { cerrar: () => void }) {
  const [clave, setClave] = useState('')
  const [repetida, setRepetida] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [hecho, setHecho] = useState(false)
  const [ocupado, setOcupado] = useState(false)

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (clave.length < MINIMO) return setMensaje(`Usa al menos ${MINIMO} caracteres.`)
    if (clave !== repetida) return setMensaje('Las dos contraseñas no coinciden.')
    setOcupado(true)
    setMensaje('')
    const { error } = await supabase.auth.updateUser({ password: clave })
    setOcupado(false)
    if (error) setMensaje(/same|different/i.test(error.message) ? 'Es la misma contraseña que ya tienes.' : `No se ha guardado: ${error.message}`)
    else setHecho(true)
  }

  const campo = 'w-full border border-borde bg-fondo px-3 py-2 text-texto outline-none focus:border-acento'
  return (
    <div role="dialog" aria-modal="true" aria-label="Contraseña" onClick={cerrar} onKeyDown={(e) => e.key === 'Escape' && cerrar()}
      className="fixed inset-0 z-30 flex items-center justify-center bg-fondo/80 p-4">
      <form onSubmit={guardar} onClick={(e) => e.stopPropagation()} className="w-full max-w-sm space-y-3 border border-borde bg-panel p-4">
        <h2 className="text-lg">Contraseña</h2>
        {hecho ? (
          <>
            <p>Contraseña guardada. A partir de ahora puedes entrar con ella.</p>
            <button type="button" autoFocus onClick={cerrar} className="boton-pri">Cerrar</button>
          </>
        ) : (
          <>
            <input type="password" autoFocus required placeholder="nueva contraseña" aria-label="Nueva contraseña" value={clave}
              onChange={(e) => setClave(e.target.value)} className={campo} autoComplete="new-password" />
            <input type="password" required placeholder="repítela" aria-label="Repite la contraseña" value={repetida}
              onChange={(e) => setRepetida(e.target.value)} className={campo} autoComplete="new-password" />
            <p className="text-[12px] text-suave">Al menos {MINIMO} caracteres y que no la uses en otro sitio.</p>
            {mensaje && <p className="text-baja">{mensaje}</p>}
            <div className="flex gap-2">
              <button disabled={ocupado} className="boton-pri">Guardar contraseña</button>
              <button type="button" onClick={cerrar} className="boton">Cancelar</button>
            </div>
          </>
        )}
      </form>
    </div>
  )
}
