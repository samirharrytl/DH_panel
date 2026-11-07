import 'server-only'
import { createClient } from '@supabase/supabase-js'

// Cliente con la clave secreta: salta RLS. Solo para crear usuarios, el webhook de WhatsApp y el cron.
export function crearClienteAdmin() {
  const clave = process.env.SUPABASE_SECRET_KEY
  if (!clave) throw new Error('Falta SUPABASE_SECRET_KEY en el entorno')
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, clave, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
