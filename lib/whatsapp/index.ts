import 'server-only'
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'

// Integración con la API oficial de WhatsApp Cloud (Meta), conexión directa.
// WHATSAPP_MODE=simulado (por defecto) no llama a Meta: los envíos se registran como enviados y los
// mensajes entrantes se simulan desde el chat del panel. WHATSAPP_MODE=meta usa las credenciales.

export type ModoWhatsApp = 'simulado' | 'meta'
export type ResultadoEnvio = { ok: true; waId: string } | { ok: false; error: string }
export type Boton = { id: string; titulo: string }

const VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v23.0'

export function modoWhatsApp(): ModoWhatsApp {
  return process.env.WHATSAPP_MODE === 'meta' ? 'meta' : 'simulado'
}

function credenciales() {
  const token = process.env.WHATSAPP_TOKEN
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!token || !phoneId) throw new Error('Faltan WHATSAPP_TOKEN o WHATSAPP_PHONE_NUMBER_ID para el modo meta')
  return { token, phoneId }
}

// Errores frecuentes de la Cloud API traducidos
function traducirError(codigo: number | undefined, mensaje: string) {
  switch (codigo) {
    case 131047:
      return 'Pasaron más de 24 horas desde el último mensaje del cliente: solo se pueden enviar plantillas aprobadas.'
    case 131026:
      return 'El número no tiene WhatsApp o no puede recibir el mensaje.'
    case 132001:
      return 'La plantilla no existe en Meta o no está aprobada en ese idioma.'
    case 132000:
      return 'La cantidad de parámetros no coincide con la plantilla aprobada en Meta.'
    case 190:
      return 'El token de WhatsApp venció o no es válido.'
    case 131030:
      return 'Con el número de prueba de Meta solo se puede escribir a números registrados como destinatarios de prueba.'
    default:
      return `WhatsApp rechazó el mensaje: ${mensaje}`
  }
}

async function enviar(telefono: string, contenido: Record<string, unknown>): Promise<ResultadoEnvio> {
  if (modoWhatsApp() === 'simulado') {
    return { ok: true, waId: `sim.${randomUUID()}` }
  }
  try {
    const { token, phoneId } = credenciales()
    const r = await fetch(`https://graph.facebook.com/${VERSION}/${phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: telefono, ...contenido }),
      signal: AbortSignal.timeout(15_000),
    })
    const datos = await r.json().catch(() => ({}))
    if (!r.ok) return { ok: false, error: traducirError(datos?.error?.code, datos?.error?.message ?? r.statusText) }
    const waId = datos?.messages?.[0]?.id
    return waId ? { ok: true, waId } : { ok: false, error: 'WhatsApp no devolvió el identificador del mensaje' }
  } catch (e) {
    return { ok: false, error: `No se pudo conectar con WhatsApp: ${(e as Error).message}` }
  }
}

export const enviarTexto = (telefono: string, cuerpo: string) =>
  enviar(telefono, { type: 'text', text: { preview_url: true, body: cuerpo } })

export const enviarPlantilla = (telefono: string, nombre: string, idioma: string, parametros: string[]) =>
  enviar(telefono, {
    type: 'template',
    template: {
      name: nombre,
      language: { code: idioma },
      components: parametros.length
        ? [{ type: 'body', parameters: parametros.map((t) => ({ type: 'text', text: t || '-' })) }]
        : [],
    },
  })

// Mensaje con hasta 3 botones de respuesta rápida (solo dentro de la ventana de 24 horas)
export const enviarBotones = (telefono: string, cuerpo: string, botones: Boton[], imagenUrl?: string) =>
  enviar(telefono, {
    type: 'interactive',
    interactive: {
      type: 'button',
      ...(imagenUrl ? { header: { type: 'image', image: { link: imagenUrl } } } : {}),
      body: { text: cuerpo.slice(0, 1024) },
      action: { buttons: botones.slice(0, 3).map((b) => ({ type: 'reply', reply: { id: b.id, title: b.titulo.slice(0, 20) } })) },
    },
  })

// Firma X-Hub-Signature-256 de los webhooks de Meta
export function verificarFirma(cuerpo: string, firma: string | null) {
  const secreto = process.env.WHATSAPP_APP_SECRET
  if (!secreto || !firma?.startsWith('sha256=')) return false
  const esperada = Buffer.from(`sha256=${createHmac('sha256', secreto).update(cuerpo, 'utf8').digest('hex')}`)
  const recibida = Buffer.from(firma)
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida)
}

export type MensajeEntrante = {
  waId: string
  telefono: string
  nombre: string | null
  tipo: 'texto' | 'interactivo' | 'imagen' | 'documento' | 'audio' | 'otro'
  cuerpo: string
  fecha: string
  boton: string | null
}
export type EstadoEntrega = { waId: string; estado: 'enviado' | 'entregado' | 'leido' | 'fallido'; error: string | null }

const ESTADOS: Record<string, EstadoEntrega['estado']> = { sent: 'enviado', delivered: 'entregado', read: 'leido', failed: 'fallido' }

type CambioWebhook = {
  value?: {
    contacts?: { wa_id: string; profile?: { name?: string } }[]
    messages?: {
      id: string
      from: string
      timestamp: string
      type: string
      text?: { body: string }
      interactive?: { button_reply?: { id: string; title: string }; list_reply?: { id: string; title: string } }
      button?: { payload: string; text: string }
      image?: { caption?: string }
      document?: { filename?: string; caption?: string }
    }[]
    statuses?: { id: string; status: string; errors?: { title?: string; message?: string }[] }[]
  }
}

export function leerWebhook(payload: { entry?: { changes?: CambioWebhook[] }[] }) {
  const mensajes: MensajeEntrante[] = []
  const estados: EstadoEntrega[] = []
  for (const entrada of payload.entry ?? []) {
    for (const cambio of entrada.changes ?? []) {
      const v = cambio.value
      if (!v) continue
      const nombres = new Map(v.contacts?.map((c) => [c.wa_id, c.profile?.name ?? null]))
      for (const m of v.messages ?? []) {
        const respuesta = m.interactive?.button_reply ?? m.interactive?.list_reply
        const boton = respuesta?.id ?? m.button?.payload ?? null
        const cuerpo =
          m.text?.body ??
          respuesta?.title ??
          m.button?.text ??
          m.image?.caption ??
          m.document?.caption ??
          m.document?.filename ??
          `[${m.type}]`
        const tipo: MensajeEntrante['tipo'] =
          m.type === 'text'
            ? 'texto'
            : m.type === 'interactive' || m.type === 'button'
              ? 'interactivo'
              : m.type === 'image'
                ? 'imagen'
                : m.type === 'document'
                  ? 'documento'
                  : m.type === 'audio'
                    ? 'audio'
                    : 'otro'
        mensajes.push({
          waId: m.id,
          telefono: m.from,
          nombre: nombres.get(m.from) ?? null,
          tipo,
          cuerpo,
          fecha: new Date(Number(m.timestamp) * 1000).toISOString(),
          boton,
        })
      }
      for (const s of v.statuses ?? []) {
        const estado = ESTADOS[s.status]
        if (estado) estados.push({ waId: s.id, estado, error: s.errors?.[0]?.message ?? s.errors?.[0]?.title ?? null })
      }
    }
  }
  return { mensajes, estados }
}
