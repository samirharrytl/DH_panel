'use server'

import { revalidatePath } from 'next/cache'
import { exigirUsuario } from '@/lib/auth'
import { crearClienteServidor } from '@/lib/supabase/server'
import { deError, exito, fallo, texto, type Resultado } from '@/lib/acciones'
import { localAIso, fecha as fmtFecha, hora as fmtHora, diaLargo } from '@/lib/formato'
import { describirInmueble, enviarMensaje, variablesLead } from '@/lib/mensajeria'

// Acciones comunes a citas con propietarios y visitas de interesados (HU-14 y HU-26)

function refrescar(leadId?: string | null) {
  revalidatePath('/agenda')
  revalidatePath('/')
  if (leadId) revalidatePath(`/leads/${leadId}`)
}

export async function reprogramarCita(_: Resultado | null, f: FormData): Promise<Resultado> {
  await exigirUsuario()
  const citaId = texto(f, 'cita_id')
  const inicio = texto(f, 'inicio')
  if (!citaId || !inicio) return fallo('Indica la nueva fecha y hora')
  const supabase = await crearClienteServidor()
  const { error } = await supabase.rpc('reprogramar_cita', {
    p_cita_id: citaId,
    p_inicio: localAIso(inicio),
    p_motivo: texto(f, 'motivo'),
  })
  if (error) return deError(error)
  refrescar(texto(f, 'lead_id'))
  return exito('Reprogramada. Envía la nueva confirmación.')
}

export async function cancelarCita(_: Resultado | null, f: FormData): Promise<Resultado> {
  await exigirUsuario()
  const supabase = await crearClienteServidor()
  const { error } = await supabase.rpc('cancelar_cita', {
    p_cita_id: texto(f, 'cita_id'),
    p_motivo: texto(f, 'motivo'),
    p_estado: texto(f, 'estado') === 'no_asistio' ? 'no_asistio' : 'cancelada',
  })
  if (error) return deError(error)
  refrescar(texto(f, 'lead_id'))
  return exito('Cita actualizada')
}

export type AvisoCita = 'confirmacion' | '24h' | 'dia'

// Confirmación al agendar y recordatorios 24 horas antes y el mismo día, por WhatsApp
export async function enviarAvisoCita(citaId: string, aviso: AvisoCita): Promise<Resultado> {
  await exigirUsuario()
  const supabase = await crearClienteServidor()
  const { data: cita } = await supabase
    .from('citas')
    .select('id, tipo, lead_id, inicio, direccion, distrito, estado, inmueble:inmuebles(codigo, tipo, distrito)')
    .eq('id', citaId)
    .maybeSingle()
  if (!cita) return fallo('Cita no encontrada')
  if (cita.estado !== 'programada') return fallo('La cita ya no está programada')
  const plantilla =
    aviso === 'confirmacion'
      ? cita.tipo === 'visita'
        ? 'visita_confirmacion'
        : 'cita_confirmacion'
      : aviso === '24h'
        ? 'recordatorio_24h'
        : 'recordatorio_mismo_dia'
  const { personaId, ...base } = await variablesLead(cita.lead_id)
  const inmueble = cita.inmueble as unknown as { codigo: string; tipo: string; distrito: string } | null
  const envio = await enviarMensaje({
    personaId,
    leadId: cita.lead_id,
    plantilla,
    variables: {
      ...base,
      fecha: aviso === 'confirmacion' ? diaLargo(cita.inicio) : fmtFecha(cita.inicio),
      hora: fmtHora(cita.inicio),
      direccion: [cita.direccion, cita.distrito].filter(Boolean).join(', '),
      inmueble: inmueble ? describirInmueble(inmueble) : base.inmueble,
    },
    metadata: { cita_id: cita.id, aviso },
  })
  if (!envio.ok) return fallo(envio.error)
  const { error } = await supabase.rpc('registrar_aviso_cita', {
    p_cita_id: citaId,
    p_aviso: aviso,
    p_mensaje_id: envio.mensajeId,
  })
  if (error) return deError(error)
  refrescar(cita.lead_id)
  return exito(envio.advertencia ?? 'Mensaje enviado')
}
