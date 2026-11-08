import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { crearClienteServidor } from '@/lib/supabase/server'
import { renderizar, variablesEnOrden, type Variables } from '@/lib/plantillas'
import { CANALES, TIPOS_INMUEBLE, etiqueta } from '@/lib/catalogos'
import { enviarBotones, enviarPlantilla, enviarTexto, modoWhatsApp, type Boton } from '@/lib/whatsapp'
import { mensajeError } from '@/lib/acciones'

export type EnvioPanel =
  | { ok: true; mensajeId: string; cuerpo: string; advertencia?: string }
  | { ok: false; error: string }

const VENTANA_MS = 24 * 3_600_000

// Envía un mensaje de WhatsApp desde el panel y lo guarda en el historial de la persona.
// Aplica las reglas: nunca a una persona en Baja, y fuera de la ventana de 24 horas solo plantillas
// aprobadas por Meta.
export async function enviarMensaje(opciones: {
  personaId: string
  leadId?: string | null
  plantilla?: string
  variables?: Variables
  texto?: string
  botones?: Boton[]
  imagenUrl?: string
  metadata?: Record<string, unknown>
  // Sin sesión de usuario (cron): cliente con la clave secreta
  supabase?: SupabaseClient
}): Promise<EnvioPanel> {
  const supabase = opciones.supabase ?? (await crearClienteServidor())
  const { data: persona } = await supabase
    .from('personas')
    .select('telefono, no_contactar, ultimo_entrante_at')
    .eq('id', opciones.personaId)
    .maybeSingle()
  if (!persona) return { ok: false, error: 'No tienes acceso a esta persona' }
  if (persona.no_contactar) return { ok: false, error: 'La persona pidió no ser contactada (Baja): no se le envían mensajes' }

  let cuerpo = opciones.texto?.trim() ?? ''
  let plantilla: { cuerpo: string; meta_nombre: string | null; meta_idioma: string; nombre: string } | null = null
  if (opciones.plantilla) {
    const { data } = await supabase
      .from('plantillas')
      .select('cuerpo, meta_nombre, meta_idioma, nombre')
      .eq('clave', opciones.plantilla)
      .maybeSingle()
    if (!data) return { ok: false, error: `No existe la plantilla "${opciones.plantilla}"` }
    plantilla = data
    cuerpo = renderizar(data.cuerpo, opciones.variables ?? {})
  }
  if (!cuerpo) return { ok: false, error: 'El mensaje está vacío' }

  const ventanaAbierta =
    !!persona.ultimo_entrante_at && Date.now() - new Date(persona.ultimo_entrante_at).getTime() < VENTANA_MS
  const simulado = modoWhatsApp() === 'simulado'
  let advertencia: string | undefined

  let envio
  let tipo = 'texto'
  if (ventanaAbierta) {
    if (opciones.botones?.length) {
      envio = await enviarBotones(persona.telefono, cuerpo, opciones.botones, opciones.imagenUrl)
      tipo = 'interactivo'
    } else {
      envio = await enviarTexto(persona.telefono, cuerpo)
    }
  } else {
    if (!plantilla) {
      return {
        ok: false,
        error: 'Pasaron más de 24 horas desde el último mensaje del cliente: solo se pueden enviar plantillas aprobadas por Meta.',
      }
    }
    if (!plantilla.meta_nombre) {
      if (!simulado) {
        return {
          ok: false,
          error: `Fuera de la ventana de 24 horas se necesita la plantilla aprobada en Meta. Configura su nombre en Configuración → Plantillas → "${plantilla.nombre}".`,
        }
      }
      advertencia = `Simulado: en producción "${plantilla.nombre}" necesita su plantilla aprobada en Meta para enviarse fuera de la ventana de 24 horas.`
    }
    const parametros = variablesEnOrden(plantilla.cuerpo).map((v) => String(opciones.variables?.[v] ?? '').trim() || '-')
    envio = await enviarPlantilla(persona.telefono, plantilla.meta_nombre ?? opciones.plantilla!, plantilla.meta_idioma, parametros)
    tipo = 'plantilla'
  }

  const { data: mensajeId, error } = await supabase.rpc('registrar_mensaje', {
    p_persona_id: opciones.personaId,
    p_lead_id: opciones.leadId ?? null,
    p_direccion: 'saliente',
    p_cuerpo: cuerpo,
    p_origen: 'panel',
    p_estado: envio.ok ? 'enviado' : 'fallido',
    p_tipo: tipo,
    p_plantilla_clave: opciones.plantilla ?? null,
    p_wa_id: envio.ok ? envio.waId : null,
    p_error: envio.ok ? null : envio.error,
    p_metadata: {
      ...(opciones.metadata ?? {}),
      ...(simulado ? { simulado: true } : {}),
      ...(advertencia ? { advertencia } : {}),
      ...(opciones.botones?.length ? { botones: opciones.botones } : {}),
    },
  })
  if (error) return { ok: false, error: mensajeError(error) }
  if (!envio.ok) return { ok: false, error: envio.error }
  return { ok: true, mensajeId: mensajeId as string, cuerpo, advertencia }
}

// Variables comunes de las plantillas para un lead
export async function variablesLead(leadId: string, cliente?: SupabaseClient): Promise<Variables & { personaId: string }> {
  const supabase = cliente ?? (await crearClienteServidor())
  const { data: l } = await supabase
    .from('leads')
    .select(
      'persona_id, tipo, canal, personas(nombre), asesor:perfiles!leads_asesor_id_fkey(nombre), inmueble:inmuebles!leads_inmueble_interes_id_fkey(codigo, tipo, distrito)',
    )
    .eq('id', leadId)
    .single()
  if (!l) throw new Error('Lead no encontrado')
  const persona = l.personas as unknown as { nombre: string } | null
  const asesor = l.asesor as unknown as { nombre: string } | null
  const inmueble = l.inmueble as unknown as { codigo: string; tipo: string; distrito: string } | null
  const { data: calif } =
    l.tipo === 'propietario'
      ? await supabase.from('calificacion_propietario').select('tipo_inmueble, distrito').eq('lead_id', leadId).maybeSingle()
      : { data: null }
  const { data: busqueda } =
    l.tipo === 'interesado'
      ? await supabase.from('busquedas').select('distritos, tipos').eq('lead_id', leadId).maybeSingle()
      : { data: null }

  // [tema]: dónde quedó el interés, para retomar la conversación (HU-06)
  let tema = 'lo que estabas buscando'
  if (inmueble) tema = `el ${describirInmueble(inmueble)}`
  else if (calif?.tipo_inmueble || calif?.distrito)
    tema = `la venta de tu ${etiqueta(TIPOS_INMUEBLE, calif.tipo_inmueble ?? 'otro').toLowerCase()}${calif.distrito ? ` en ${calif.distrito}` : ''}`
  else if (busqueda?.tipos?.length || busqueda?.distritos?.length)
    tema = `tu búsqueda de ${
      busqueda.tipos?.length ? busqueda.tipos.map((t: string) => etiqueta(TIPOS_INMUEBLE, t).toLowerCase()).join(' o ') : 'inmueble'
    }${busqueda.distritos?.length ? ` en ${busqueda.distritos.join(', ')}` : ''}`
  else if (l.tipo === 'propietario') tema = 'la venta de tu inmueble'

  return {
    personaId: l.persona_id,
    nombre: primerNombre(persona?.nombre),
    asesor: primerNombre(asesor?.nombre) || 'tu asesor de DepaHost',
    canal: etiqueta(CANALES, l.canal),
    inmueble: inmueble ? describirInmueble(inmueble) : null,
    distrito: inmueble?.distrito ?? calif?.distrito ?? busqueda?.distritos?.[0] ?? null,
    tema,
  }
}

export function primerNombre(nombre: string | null | undefined) {
  return (nombre ?? '').trim().split(/\s+/)[0] ?? ''
}

export function describirInmueble(i: { codigo: string; tipo: string; distrito: string }) {
  return `${etiqueta(TIPOS_INMUEBLE, i.tipo).toLowerCase()} en ${i.distrito} (${i.codigo})`
}
