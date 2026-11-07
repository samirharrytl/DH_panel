import { NextResponse, type NextRequest } from 'next/server'
import { crearClienteAdmin } from '@/lib/supabase/admin'
import { leerWebhook, verificarFirma } from '@/lib/whatsapp'

// Webhook de WhatsApp Cloud API. Meta lo llama con cada mensaje entrante y cada cambio de estado de
// entrega; todo se guarda en el historial de la persona.

// Verificación al suscribir el webhook en Meta
export function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams
  const token = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN
  if (p.get('hub.mode') === 'subscribe' && token && p.get('hub.verify_token') === token) {
    return new NextResponse(p.get('hub.challenge') ?? '', { status: 200 })
  }
  return new NextResponse('Prohibido', { status: 403 })
}

export async function POST(request: NextRequest) {
  const cuerpo = await request.text()
  if (!verificarFirma(cuerpo, request.headers.get('x-hub-signature-256'))) {
    return new NextResponse('Firma no válida', { status: 401 })
  }
  let payload
  try {
    payload = JSON.parse(cuerpo)
  } catch {
    return new NextResponse('JSON no válido', { status: 400 })
  }

  const { mensajes, estados } = leerWebhook(payload)
  const supabase = crearClienteAdmin()
  const errores: string[] = []

  for (const m of mensajes) {
    const { error } = await supabase.rpc('registrar_entrante_whatsapp', {
      p_telefono: m.telefono,
      p_nombre: m.nombre,
      p_cuerpo: m.cuerpo,
      p_wa_id: m.waId,
      p_tipo: m.tipo,
      p_fecha: m.fecha,
      p_payload: m.boton ? { boton: m.boton } : {},
      p_origen: 'whatsapp',
    })
    if (error) errores.push(`${m.waId}: ${error.message}`)
  }
  for (const s of estados) {
    const { error } = await supabase.rpc('actualizar_estado_whatsapp', { p_wa_id: s.waId, p_estado: s.estado, p_error: s.error })
    if (error) errores.push(`${s.waId}: ${error.message}`)
  }

  if (errores.length) {
    console.error('Webhook de WhatsApp con errores', errores)
    // 500 para que Meta reintente; registrar_entrante_whatsapp ignora duplicados por wa_id
    return NextResponse.json({ ok: false }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
