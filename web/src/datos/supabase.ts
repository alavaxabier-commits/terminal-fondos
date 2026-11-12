import { createClient } from '@supabase/supabase-js'

// Dirección y clave PÚBLICA del proyecto (pensada para ir en el navegador). Quién puede leer qué lo deciden
// las políticas RLS de la base: solo el propietario ve los datos.
const URL = 'https://ugobxrjfxzyrcbuxgefz.supabase.co'
const CLAVE_PUBLICA = 'sb_publishable_oT67u1KZp_CgI-v907LytQ_PkKj97fW'

export const supabase = createClient(URL, CLAVE_PUBLICA, {
  db: { schema: 'fondos' },
  auth: { persistSession: true, autoRefreshToken: true },
})
