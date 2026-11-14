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

// Dispositivo que recibe las notificaciones push del usuario (ver components/avisos-dispositivo.tsx)
export async function guardarSuscripcionPush(sub: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }) {
  await exigirUsuario()
  const { endpoint, keys } = sub ?? {}
  if (typeof endpoint !== 'string' || !endpoint.startsWith('https://') || typeof keys?.p256dh !== 'string' || typeof keys?.auth !== 'string' || !keys.p256dh || !keys.auth) {
    return { ok: false }
  }
  const supabase = await crearClienteServidor()
  const { error } = await supabase.rpc('guardar_suscripcion_push', { p_endpoint: endpoint, p_p256dh: keys.p256dh, p_auth: keys.auth })
  return { ok: !error }
}

export async function borrarSuscripcionPush(endpoint: string) {
  await exigirUsuario()
  const supabase = await crearClienteServidor()
  await supabase.from('suscripciones_push').delete().eq('endpoint', endpoint)
}
