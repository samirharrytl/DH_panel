import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { diaLargo, fecha as fmtFecha, hora as fmtHora } from '@/lib/formato'
import { describirInmueble, enviarMensaje, variablesLead } from '@/lib/mensajeria'
import { mensajeError } from '@/lib/acciones'

export type AvisoCita = 'confirmacion' | '24h' | 'dia'

// Confirmación al agendar y recordatorios 24 horas antes y el mismo día, por WhatsApp. Lo usan el botón
// del panel (con la sesión del usuario) y el cron de recordatorios (con la clave secreta).
export async function enviarAviso(
  supabase: SupabaseClient,
  citaId: string,
  aviso: AvisoCita,
): Promise<{ ok: true; leadId: string; advertencia?: string } | { ok: false; error: string }> {
  const { data: cita } = await supabase
    .from('citas')
    .select('id, tipo, lead_id, inicio, direccion, distrito, estado, inmueble:inmuebles(codigo, tipo, distrito)')
    .eq('id', citaId)
    .maybeSingle()
  if (!cita) return { ok: false, error: 'Cita no encontrada' }
  if (cita.estado !== 'programada') return { ok: false, error: 'La cita ya no está programada' }
  const plantilla =
    aviso === 'confirmacion'
      ? cita.tipo === 'visita'
        ? 'visita_confirmacion'
        : 'cita_confirmacion'
      : aviso === '24h'
        ? 'recordatorio_24h'
        : 'recordatorio_mismo_dia'
  const { personaId, ...base } = await variablesLead(cita.lead_id, supabase)
  const inmueble = cita.inmueble as unknown as { codigo: string; tipo: string; distrito: string } | null
  const envio = await enviarMensaje({
    supabase,
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
  if (!envio.ok) return envio
  const { error } = await supabase.rpc('registrar_aviso_cita', { p_cita_id: citaId, p_aviso: aviso, p_mensaje_id: envio.mensajeId })
  if (error) return { ok: false, error: mensajeError(error) }
  return { ok: true, leadId: cita.lead_id, advertencia: envio.advertencia }
}
