'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { exigirUsuario } from '@/lib/auth'
import { crearClienteServidor } from '@/lib/supabase/server'
import { crearClienteAdmin } from '@/lib/supabase/admin'
import { deError, exito, fallo, texto, type Resultado } from '@/lib/acciones'
import { enviarMensaje, primerNombre, variablesLead } from '@/lib/mensajeria'
import { modoWhatsApp } from '@/lib/whatsapp'

function refrescar(leadId: string | null) {
  revalidatePath('/chats')
  if (leadId) revalidatePath(`/leads/${leadId}`)
}

// HU-12: chat con el lead desde el panel
export async function enviarDesdeChat(_: Resultado | null, f: FormData): Promise<Resultado> {
  await exigirUsuario()
  const personaId = texto(f, 'persona_id')
  const leadId = texto(f, 'lead_id')
  const plantilla = texto(f, 'plantilla')
  const cuerpo = texto(f, 'texto')
  if (!personaId) return fallo('Falta la persona')
  if (!plantilla && !cuerpo) return fallo('Escribe un mensaje o elige una plantilla')

  let variables = {}
  if (plantilla) {
    if (leadId) {
      const { personaId: _p, ...v } = await variablesLead(leadId)
      variables = v
    } else {
      const supabase = await crearClienteServidor()
      const { data } = await supabase.from('personas').select('nombre').eq('id', personaId).single()
      variables = { nombre: primerNombre(data?.nombre) }
    }
  }
  const envio = await enviarMensaje({
    personaId,
    leadId,
    plantilla: plantilla ?? undefined,
    texto: plantilla ? undefined : (cuerpo ?? undefined),
    variables,
  })
  if (!envio.ok) return fallo(envio.error)
  refrescar(leadId)
  return exito(envio.advertencia)
}

// Mientras no haya integración (o para lo conversado por otro medio), el asesor registra a mano los mensajes clave
export async function registrarManual(_: Resultado | null, f: FormData): Promise<Resultado> {
  await exigirUsuario()
  const personaId = texto(f, 'persona_id')
  const leadId = texto(f, 'lead_id')
  const cuerpo = texto(f, 'texto')
  const direccion = texto(f, 'direccion')
  if (!cuerpo) return fallo('Escribe el mensaje')
  if (direccion !== 'entrante' && direccion !== 'saliente') return fallo('Indica quién lo escribió')
  const supabase = await crearClienteServidor()
  const { error } = await supabase.rpc('registrar_mensaje', {
    p_persona_id: personaId,
    p_lead_id: leadId,
    p_direccion: direccion,
    p_cuerpo: cuerpo,
    p_origen: 'manual',
  })
  if (error) return deError(error)
  refrescar(leadId)
  return exito('Mensaje registrado')
}

// Solo en modo simulado: un mensaje del cliente como si llegara por el webhook
export async function simularEntrante(_: Resultado | null, f: FormData): Promise<Resultado> {
  await exigirUsuario()
  if (modoWhatsApp() !== 'simulado') return fallo('Solo disponible con WHATSAPP_MODE=simulado')
  const personaId = texto(f, 'persona_id')
  const cuerpo = texto(f, 'texto')
  const boton = texto(f, 'boton')
  if (!cuerpo) return fallo('Escribe el mensaje del cliente')
  const supabase = await crearClienteServidor()
  const { data: persona } = await supabase.from('personas').select('telefono, nombre').eq('id', personaId).maybeSingle()
  if (!persona) return fallo('No tienes acceso a esta persona')
  const { error } = await crearClienteAdmin().rpc('registrar_entrante_whatsapp', {
    p_telefono: persona.telefono,
    p_nombre: persona.nombre,
    p_cuerpo: cuerpo,
    p_wa_id: `sim.in.${randomUUID()}`,
    p_tipo: boton ? 'interactivo' : 'texto',
    p_fecha: new Date().toISOString(),
    p_payload: boton ? { boton } : {},
    p_origen: 'simulado',
  })
  if (error) return deError(error)
  refrescar(texto(f, 'lead_id'))
  return exito()
}

export async function marcarLeidos(personaId: string) {
  await exigirUsuario()
  const supabase = await crearClienteServidor()
  await supabase.rpc('marcar_mensajes_leidos', { p_persona_id: personaId })
}
