'use server'

import { revalidatePath } from 'next/cache'
import { exigirUsuario } from '@/lib/auth'
import { crearClienteServidor } from '@/lib/supabase/server'
import { deError, entero, exito, fallo, texto, type Resultado } from '@/lib/acciones'
import { localAIso } from '@/lib/formato'
import { INTERES_VISITA } from '@/lib/catalogos'
import { enviarMensaje, variablesLead, describirInmueble } from '@/lib/mensajeria'

function refrescar(leadId: string | null, inmuebleId?: string | null) {
  revalidatePath('/agenda')
  revalidatePath('/')
  revalidatePath('/leads')
  if (leadId) revalidatePath(`/leads/${leadId}`)
  if (inmuebleId) revalidatePath(`/inmuebles/${inmuebleId}`)
}

// HU-26: la función SQL exige el nivel financiero del parámetro y copia los datos de acceso del inmueble
export async function agendarVisita(_: Resultado | null, f: FormData): Promise<Resultado> {
  await exigirUsuario()
  const leadId = texto(f, 'lead_id')
  const inmuebleId = texto(f, 'inmueble_id')
  const inicio = texto(f, 'inicio')
  if (!leadId || !inmuebleId) return fallo('Elige el inmueble')
  if (!inicio) return fallo('Indica la fecha y hora')
  const supabase = await crearClienteServidor()
  const { error } = await supabase.rpc('agendar_visita', {
    p_lead_id: leadId,
    p_inmueble_id: inmuebleId,
    p_inicio: localAIso(inicio),
    p_duracion_min: entero(f, 'duracion_min') ?? 45,
    p_notas: texto(f, 'notas'),
  })
  if (error) return deError(error)
  refrescar(leadId, inmuebleId)
  return exito('Visita agendada. Envía la confirmación por WhatsApp.')
}

export async function marcarVisitaRealizada(citaId: string, leadId: string): Promise<Resultado> {
  await exigirUsuario()
  const supabase = await crearClienteServidor()
  const { error } = await supabase.rpc('marcar_visita_realizada', { p_cita_id: citaId })
  if (error) return deError(error)
  refrescar(leadId)
  return exito('Visita realizada. Pídele su opinión.')
}

// HU-27: la opinión queda ligada a la visita y al inmueble (alimenta los insights del propietario)
export async function registrarOpinionVisita(_: Resultado | null, f: FormData): Promise<Resultado> {
  await exigirUsuario()
  const leadId = texto(f, 'lead_id')
  const interes = texto(f, 'interes')
  const calificacion = entero(f, 'calificacion')
  if (!interes || !(interes in INTERES_VISITA)) return fallo('Indica su nivel de interés')
  if (calificacion !== null && (calificacion < 1 || calificacion > 5)) return fallo('La calificación va de 1 a 5')
  const supabase = await crearClienteServidor()
  const { error } = await supabase.rpc('registrar_opinion_visita', {
    p_cita_id: texto(f, 'cita_id'),
    p_calificacion: calificacion,
    p_interes: interes,
    p_le_gusto: texto(f, 'le_gusto'),
    p_no_le_gusto: texto(f, 'no_le_gusto'),
    p_comentario: texto(f, 'comentario'),
  })
  if (error) return deError(error)
  refrescar(leadId, texto(f, 'inmueble_id'))
  return exito('Opinión registrada')
}

// Pedido de opinión por WhatsApp con la plantilla "opinion_visita"
export async function pedirOpinionVisita(citaId: string): Promise<Resultado> {
  await exigirUsuario()
  const supabase = await crearClienteServidor()
  const { data: cita } = await supabase
    .from('citas')
    .select('lead_id, inmueble:inmuebles(codigo, tipo, distrito)')
    .eq('id', citaId)
    .maybeSingle()
  if (!cita) return fallo('Visita no encontrada')
  const inmueble = cita.inmueble as unknown as { codigo: string; tipo: string; distrito: string } | null
  const { personaId, ...variables } = await variablesLead(cita.lead_id)
  const envio = await enviarMensaje({
    personaId,
    leadId: cita.lead_id,
    plantilla: 'opinion_visita',
    variables: { ...variables, inmueble: inmueble ? describirInmueble(inmueble) : variables.inmueble },
    metadata: { cita_id: citaId },
  })
  if (!envio.ok) return fallo(envio.error)
  refrescar(cita.lead_id)
  return exito(envio.advertencia ?? 'Pedido de opinión enviado')
}
