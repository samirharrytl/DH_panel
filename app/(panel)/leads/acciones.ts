'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { exigirAdmin, exigirUsuario } from '@/lib/auth'
import { crearClienteServidor } from '@/lib/supabase/server'
import { casilla, deError, exito, fallo, mensajeError, texto, type Resultado } from '@/lib/acciones'
import { enviarMensaje, variablesLead } from '@/lib/mensajeria'

// HU-05: registro de lead. Si el teléfono ya existe, se une al registro existente.
export async function registrarLead(_: Resultado | null, f: FormData): Promise<Resultado> {
  await exigirUsuario()
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.rpc('registrar_lead', {
    p_telefono: texto(f, 'telefono'),
    p_nombre: texto(f, 'nombre'),
    p_tipo: texto(f, 'tipo'),
    p_canal: texto(f, 'canal'),
    p_canal_detalle: texto(f, 'canal_detalle'),
    p_email: texto(f, 'email'),
    p_consentimiento_datos: casilla(f, 'consentimiento_datos'),
    p_consentimiento_marketing: casilla(f, 'consentimiento_marketing'),
    p_asesor_id: texto(f, 'asesor_id'),
    p_nota: texto(f, 'nota'),
  })
  if (error) return deError(error)
  const r = data as { lead_id: string; resultado: string; visible: boolean; asesor_nombre: string | null }

  if (!r.visible) {
    return exito(
      `Este número ya está registrado y lo atiende ${r.asesor_nombre ?? 'otro asesor'}. Se unió a su registro y se le avisó.`,
    )
  }
  const inmueble = texto(f, 'inmueble_id')
  if (inmueble) {
    const { error: e } = await supabase.rpc('asociar_inmueble_interes', { p_lead_id: r.lead_id, p_inmueble_id: inmueble })
    if (e) return fallo(`El lead se registró, pero no se pudo asociar el inmueble: ${mensajeError(e)}`)
  }
  const codigo = texto(f, 'codigo_publicacion')
  if (codigo) {
    const { error: e } = await supabase.rpc('atribuir_publicacion', { p_lead_id: r.lead_id, p_codigo: codigo })
    if (e) return fallo(`El lead se registró, pero el código de publicación no es válido: ${mensajeError(e)}`)
  }
  revalidatePath('/leads')
  redirect(`/leads/${r.lead_id}?registro=${r.resultado}`)
}

// HU-09
export async function cambiarEstado(_: Resultado | null, f: FormData): Promise<Resultado> {
  await exigirUsuario()
  const leadId = texto(f, 'lead_id')
  const supabase = await crearClienteServidor()
  const { error } = await supabase.rpc('cambiar_estado_lead', {
    p_lead_id: leadId,
    p_estado: texto(f, 'estado'),
    p_nota: texto(f, 'nota'),
  })
  if (error) return deError(error)
  revalidatePath(`/leads/${leadId}`)
  return exito('Estado actualizado')
}

export async function agregarNota(_: Resultado | null, f: FormData): Promise<Resultado> {
  const usuario = await exigirUsuario()
  const leadId = texto(f, 'lead_id')
  const nota = texto(f, 'texto')
  if (!nota) return fallo('Escribe la nota')
  const supabase = await crearClienteServidor()
  const { error } = await supabase.from('notas').insert({ lead_id: leadId, texto: nota, autor_id: usuario.id })
  if (error) return deError(error)
  revalidatePath(`/leads/${leadId}`)
  return exito('Nota guardada')
}

// HU-10
export async function asignarLead(_: Resultado | null, f: FormData): Promise<Resultado> {
  await exigirAdmin()
  const leadId = texto(f, 'lead_id')
  const supabase = await crearClienteServidor()
  const { error } = await supabase.rpc('asignar_lead', { p_lead_id: leadId, p_asesor_id: texto(f, 'asesor_id') })
  if (error) return deError(error)
  revalidatePath(`/leads/${leadId}`)
  revalidatePath('/leads')
  return exito('Lead asignado')
}

// HU-11
export async function darBaja(_: Resultado | null, f: FormData): Promise<Resultado> {
  await exigirUsuario()
  const leadId = texto(f, 'lead_id')
  const supabase = await crearClienteServidor()
  const { error } = await supabase.rpc('dar_baja', { p_lead_id: leadId, p_motivo: texto(f, 'motivo') })
  if (error) return deError(error)
  revalidatePath(`/leads/${leadId}`)
  return exito('Lead en Baja: no recibirá más mensajes')
}

export async function reactivarLead(_: Resultado | null, f: FormData): Promise<Resultado> {
  await exigirUsuario()
  const leadId = texto(f, 'lead_id')
  const supabase = await crearClienteServidor()
  const { error } = await supabase.rpc('reactivar_lead', { p_lead_id: leadId, p_nota: texto(f, 'nota') })
  if (error) return deError(error)
  revalidatePath(`/leads/${leadId}`)
  return exito('Lead reactivado')
}

export async function actualizarConsentimiento(_: Resultado | null, f: FormData): Promise<Resultado> {
  await exigirUsuario()
  const leadId = texto(f, 'lead_id')
  const supabase = await crearClienteServidor()
  const { error } = await supabase.rpc('actualizar_consentimiento', {
    p_lead_id: leadId,
    p_datos: casilla(f, 'consentimiento_datos'),
    p_marketing: casilla(f, 'consentimiento_marketing'),
  })
  if (error) return deError(error)
  revalidatePath(`/leads/${leadId}`)
  return exito('Consentimiento actualizado')
}

export async function guardarContacto(_: Resultado | null, f: FormData): Promise<Resultado> {
  await exigirUsuario()
  const leadId = texto(f, 'lead_id')
  const supabase = await crearClienteServidor()
  const { error } = await supabase
    .from('personas')
    .update({
      nombre: texto(f, 'nombre') ?? undefined,
      email: texto(f, 'email'),
      horario_preferido: texto(f, 'horario_preferido'),
      medio_contacto: texto(f, 'medio_contacto'),
      genero: texto(f, 'genero'),
    })
    .eq('id', texto(f, 'persona_id'))
  if (error) return deError(error)
  const { error: e2 } = await supabase
    .from('leads')
    .update({ recibe_novedades: casilla(f, 'recibe_novedades') })
    .eq('id', leadId)
  if (e2) return deError(e2)
  revalidatePath(`/leads/${leadId}`)
  return exito('Datos guardados')
}

export async function guardarProximaAccion(_: Resultado | null, f: FormData): Promise<Resultado> {
  await exigirUsuario()
  const leadId = texto(f, 'lead_id')
  const fecha = texto(f, 'fecha')
  const supabase = await crearClienteServidor()
  const { error } = await supabase
    .from('leads')
    .update({
      proxima_accion: fecha ? (texto(f, 'accion') ?? 'Hacer seguimiento') : null,
      proxima_accion_at: fecha ? `${fecha}:00-05:00` : null,
    })
    .eq('id', leadId)
  if (error) return deError(error)
  revalidatePath(`/leads/${leadId}`)
  return exito('Próxima acción guardada')
}

// HU-08: el asesor marca que el lead respondió (por llamada u otro medio)
export async function registrarRespuesta(leadId: string): Promise<Resultado> {
  await exigirUsuario()
  const supabase = await crearClienteServidor()
  const { error } = await supabase.rpc('registrar_respuesta', { p_lead_id: leadId })
  if (error) return deError(error)
  revalidatePath(`/leads/${leadId}`)
  return exito('Respuesta registrada: se cancelaron los refuerzos pendientes')
}

// Día 0: bienvenida por WhatsApp, que crea la cadencia de refuerzos
export async function enviarBienvenida(leadId: string): Promise<Resultado> {
  await exigirUsuario()
  const supabase = await crearClienteServidor()
  const { data: lead } = await supabase.from('leads').select('tipo, bienvenida_at').eq('id', leadId).single()
  if (!lead) return fallo('Lead no encontrado')
  if (lead.bienvenida_at) return fallo('La bienvenida ya se envió')
  const { personaId, ...variables } = await variablesLead(leadId)
  const envio = await enviarMensaje({ personaId, leadId, plantilla: `bienvenida_${lead.tipo}`, variables })
  if (!envio.ok) return fallo(envio.error)
  const { error } = await supabase.rpc('registrar_bienvenida', { p_lead_id: leadId, p_mensaje_id: envio.mensajeId })
  if (error) return deError(error)
  revalidatePath(`/leads/${leadId}`)
  return exito(envio.advertencia ?? 'Bienvenida enviada')
}

// HU-06: mensaje para retomar la conversación con quien regresa
export async function enviarRetorno(leadId: string): Promise<Resultado> {
  await exigirUsuario()
  const { personaId, ...variables } = await variablesLead(leadId)
  const envio = await enviarMensaje({ personaId, leadId, plantilla: 'retorno', variables })
  if (!envio.ok) return fallo(envio.error)
  revalidatePath(`/leads/${leadId}`)
  return exito(envio.advertencia ?? 'Mensaje enviado')
}

// Novedades mensuales a leads en "No responde" que aceptaron marketing
export async function enviarNovedadesGenerales(leadId: string): Promise<Resultado> {
  await exigirUsuario()
  const supabase = await crearClienteServidor()
  const { data: lead } = await supabase.from('leads').select('estado, consentimiento_marketing').eq('id', leadId).single()
  if (!lead?.consentimiento_marketing) return fallo('El lead no aceptó recibir marketing')
  const { personaId, ...variables } = await variablesLead(leadId)
  const envio = await enviarMensaje({ personaId, leadId, plantilla: 'novedades_general', variables })
  if (!envio.ok) return fallo(envio.error)
  const { error } = await supabase.rpc('registrar_novedades_enviadas', { p_lead_id: leadId, p_mensaje_id: envio.mensajeId })
  if (error) return deError(error)
  revalidatePath(`/leads/${leadId}`)
  return exito(envio.advertencia ?? 'Novedades enviadas')
}

export async function enviarRefuerzo(refuerzoId: string): Promise<Resultado> {
  await exigirUsuario()
  const supabase = await crearClienteServidor()
  const { data: refuerzo } = await supabase.from('refuerzos').select('lead_id, numero').eq('id', refuerzoId).single()
  if (!refuerzo) return fallo('Refuerzo no encontrado')
  const { data: plantillas } = await supabase.from('plantillas').select('clave').eq('categoria', 'refuerzo').order('orden')
  const claves = plantillas?.map((p) => p.clave) ?? []
  const plantilla = claves.includes(`refuerzo_${refuerzo.numero}`) ? `refuerzo_${refuerzo.numero}` : claves.at(-1)
  if (!plantilla) return fallo('No hay plantillas de refuerzo')
  const { personaId, ...variables } = await variablesLead(refuerzo.lead_id)
  const envio = await enviarMensaje({ personaId, leadId: refuerzo.lead_id, plantilla, variables })
  if (!envio.ok) return fallo(envio.error)
  const { error } = await supabase.rpc('registrar_refuerzo', { p_refuerzo_id: refuerzoId, p_mensaje_id: envio.mensajeId })
  if (error) return deError(error)
  revalidatePath(`/leads/${refuerzo.lead_id}`)
  return exito(envio.advertencia ?? `Refuerzo ${refuerzo.numero} enviado`)
}
