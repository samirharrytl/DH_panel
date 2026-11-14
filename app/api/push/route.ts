import { NextResponse, type NextRequest } from 'next/server'
import webpush from 'web-push'
import { crearClienteAdmin } from '@/lib/supabase/admin'

// Envía un aviso de public.notificaciones como push a los dispositivos de su usuario. Lo llama la base
// (trigger notificaciones_push, con pg_net) con "Authorization: Bearer <CRON_SECRET>" y el cuerpo { id }.
export async function POST(request: NextRequest) {
  const secreto = process.env.CRON_SECRET
  if (!secreto || request.headers.get('authorization') !== `Bearer ${secreto}`) {
    return new NextResponse('No autorizado', { status: 401 })
  }
  const id = Number((await request.json().catch(() => null))?.id)
  if (!Number.isInteger(id)) return NextResponse.json({ ok: false, error: 'Falta el id' }, { status: 400 })

  const publica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privada = process.env.VAPID_PRIVATE_KEY
  const contacto = process.env.VAPID_SUBJECT
  if (!publica || !privada || !contacto) return NextResponse.json({ ok: true, enviados: 0, motivo: 'Sin claves VAPID' })

  const supabase = crearClienteAdmin()
  const { data: aviso, error } = await supabase
    .from('notificaciones')
    .select('usuario_id, titulo, cuerpo, enlace, perfiles!inner(activo)')
    .eq('id', id)
    .eq('perfiles.activo', true)
    .maybeSingle()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  // Un usuario desactivado (HU-02) no recibe nada: el filtro inner sobre perfiles no devuelve su aviso
  if (!aviso) return NextResponse.json({ ok: true, enviados: 0 })

  const { data: subs, error: errorSubs } = await supabase
    .from('suscripciones_push')
    .select('endpoint, p256dh, auth')
    .eq('usuario_id', aviso.usuario_id)
  // Si la tabla no está en la caché de PostgREST o falta un permiso, antes se veía como "0 enviados" sin pista
  if (errorSubs) return NextResponse.json({ ok: false, error: errorSubs.message }, { status: 500 })

  const carga = JSON.stringify({ titulo: aviso.titulo, cuerpo: aviso.cuerpo, enlace: aviso.enlace ?? '/' })
  const opciones = {
    vapidDetails: { subject: contacto, publicKey: publica, privateKey: privada },
    TTL: 86_400,
    urgency: 'high' as const,
  }
  let enviados = 0
  const vencidas: string[] = []
  const errores: { estado?: number; mensaje: string }[] = []
  await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, carga, opciones)
        enviados++
      } catch (e) {
        const estado = (e as { statusCode?: number }).statusCode
        // 404/410: el navegador anuló la suscripción (desinstaló la app, borró datos, quitó el permiso)
        if (estado === 404 || estado === 410) vencidas.push(s.endpoint)
        else {
          console.error('Push fallido', estado, (e as Error).message)
          // Se devuelve en la respuesta para poder diagnosticar desde net._http_response
          errores.push({ estado, mensaje: (e as Error).message })
        }
      }
    }),
  )
  if (vencidas.length) await supabase.from('suscripciones_push').delete().in('endpoint', vencidas)
  return NextResponse.json({
    ok: true,
    enviados,
    vencidas: vencidas.length,
    revisadas: subs?.length ?? 0,
    ...(errores.length ? { errores } : {}),
  })
}
