'use server'

import { revalidatePath } from 'next/cache'
import { crearClienteServidor } from '@/lib/supabase/server'
import { exigirUsuario } from '@/lib/auth'

export async function marcarNotificacionesLeidas() {
  const usuario = await exigirUsuario()
  const supabase = await crearClienteServidor()
  await supabase
    .from('notificaciones')
    .update({ leida_at: new Date().toISOString() })
    .eq('usuario_id', usuario.id)
    .is('leida_at', null)
  revalidatePath('/', 'layout')
}
