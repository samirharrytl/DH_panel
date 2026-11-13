import { NextResponse, type NextRequest } from 'next/server'
import { crearClienteAdmin } from '@/lib/supabase/admin'

// Leads de los formularios del sitio web (landing en Astro), con la forma de `LeadCreateInput` del contrato
// openapi/depahost-api.json de la landing. El navegador llama directo, así que valida todo y responde CORS
// solo a los orígenes de WEB_ORIGINS.

const ORIGENES: Record<string, string> = {
  'saved-list': 'Guardó inmuebles',
  cart: 'Mis inmuebles',
  contact: 'Contacto',
  'intl-form': 'Formulario en inglés',
  'owner-sell': 'Quiere vender',
  // Alquileres: fuera del alcance del panel. Se responde 201 y no se registra (la landing sigue a WhatsApp)
  'owner-rent': '',
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function cors(request: NextRequest): Record<string, string> {
  const origen = request.headers.get('origin') ?? ''
  const permitidos = (process.env.WEB_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean)
  if (!permitidos.includes(origen)) return { Vary: 'Origin' }
  return {
    'Access-Control-Allow-Origin': origen,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    // El cliente de la landing envía con credentials: 'include'; sin esto el navegador bloquea la respuesta
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

const respuesta = (cuerpo: unknown, status: number, headers: Record<string, string>) => NextResponse.json(cuerpo, { status, headers })
const invalido = (headers: Record<string, string>, path: string, message: string) =>
  respuesta({ statusCode: 400, error: 'Bad Request', message, issues: [{ path, message }] }, 400, headers)
const recibo = (id: string | null, headers: Record<string, string>) =>
  respuesta({ id: id ?? crypto.randomUUID(), createdAt: new Date().toISOString() }, 201, headers)

const cadena = (v: unknown, max: number) => (typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : null)

async function captchaValido(token: unknown, ip: string | null) {
  const secreto = process.env.TURNSTILE_SECRET_KEY
  // shortcut: sin TURNSTILE_SECRET_KEY no se verifica (desarrollo); en producción debe estar definida
  if (!secreto) return true
  if (typeof token !== 'string' || !token) return false
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: new URLSearchParams({ secret: secreto, response: token, ...(ip ? { remoteip: ip } : {}) }),
  }).catch(() => null)
  return Boolean(r?.ok && ((await r.json()) as { success?: boolean }).success)
}

export function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(request) })
}

export async function POST(request: NextRequest) {
  const h = cors(request)
  let b: Record<string, unknown>
  try {
    b = await request.json()
    if (!b || typeof b !== 'object' || Array.isArray(b)) throw new Error()
  } catch {
    return respuesta({ statusCode: 400, error: 'Bad Request', message: 'JSON no válido' }, 400, h)
  }

  const origen = typeof b.source === 'string' ? b.source : ''
  if (!(origen in ORIGENES)) return invalido(h, 'source', 'Origen no válido')
  // Honeypot: un bot llenó el campo oculto; se responde como si nada
  if (b.website) return recibo(null, h)
  if (origen === 'owner-rent') return recibo(null, h)

  const nombre = cadena(b.name, 120)
  const telefono = cadena(b.phone, 20)
  const email = cadena(b.email, 200)
  const mensaje = b.message === undefined ? null : cadena(b.message, 2000)
  if (b.name !== undefined && (!nombre || nombre.length < 2)) return invalido(h, 'name', 'Escribe tu nombre')
  if (b.phone !== undefined && (!telefono || !/^\+?[0-9 ()-]{6,20}$/.test(telefono))) return invalido(h, 'phone', 'Celular no válido')
  if (nombre && !telefono) return invalido(h, 'phone', 'El celular es obligatorio')
  if (b.email !== undefined && b.email !== '' && (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return invalido(h, 'email', 'Correo no válido')

  const ids = b.propertyIds ?? []
  if (!Array.isArray(ids) || ids.length > 20 || !ids.every((id) => typeof id === 'string' && UUID.test(id))) {
    return invalido(h, 'propertyIds', 'Inmuebles no válidos')
  }

  const detalles = b.details && typeof b.details === 'object' && !Array.isArray(b.details) ? (b.details as Record<string, unknown>) : {}
  const lineas = Object.entries(detalles)
    .slice(0, 20)
    .filter(([, v]) => ['string', 'number', 'boolean'].includes(typeof v))
    .map(([k, v]) => `${k.slice(0, 50)}: ${String(v).slice(0, 500)}`)
  const utm = b.utm && typeof b.utm === 'object' ? (b.utm as Record<string, unknown>) : {}
  const utmTexto = ['source', 'medium', 'campaign', 'term', 'content']
    .flatMap((k) => (cadena(utm[k], 200) ? [`${k}=${cadena(utm[k], 200)}`] : []))
    .join(', ')

  if (telefono && !(await captchaValido(b.turnstileToken, request.headers.get('x-forwarded-for')?.split(',')[0] ?? null))) {
    return respuesta({ statusCode: 400, error: 'Bad Request', message: 'No pudimos verificar que no eres un robot. Inténtalo de nuevo.' }, 400, h)
  }
  // shortcut: sin límite de envíos por IP; el captcha cubre los formularios con datos personales. Si llega
  // spam por los clics anónimos de "Mis inmuebles", agregar un límite (p. ej. con Vercel Firewall).

  const nota = [
    `Llegó por el sitio web: ${ORIGENES[origen]}`,
    mensaje && `Mensaje: ${mensaje}`,
    ...lineas,
    utmTexto && `UTM: ${utmTexto}`,
  ]
    .filter(Boolean)
    .join('\n')

  const { data, error } = await crearClienteAdmin().rpc('registrar_lead_web', {
    p_origen: origen,
    p_nombre: nombre,
    p_telefono: telefono,
    p_email: email,
    p_inmuebles: ids,
    p_nota: telefono ? nota : null,
    p_consentimiento: b.consent === true,
    p_detalle: {
      canal_detalle: `Web · ${ORIGENES[origen]}${cadena(utm.source, 200) ? ` · ${cadena(utm.source, 200)}` : ''}`,
      ...(lineas.length ? { detalles: lineas } : {}),
      ...(utmTexto ? { utm: utmTexto } : {}),
    },
  })
  if (error) {
    // Las validaciones de la base (teléfono, nombre) se muestran tal cual
    if (/teléfono|nombre/i.test(error.message)) return invalido(h, /teléfono/i.test(error.message) ? 'phone' : 'name', error.message)
    console.error('registrar_lead_web', error)
    return respuesta({ statusCode: 500, error: 'Internal Server Error', message: 'No pudimos registrar tus datos' }, 500, h)
  }
  return recibo((data as string | null) ?? null, h)
}
