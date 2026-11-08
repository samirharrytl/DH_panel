'use server'

import { revalidatePath } from 'next/cache'
import { exigirUsuario } from '@/lib/auth'
import { crearClienteServidor } from '@/lib/supabase/server'
import { casilla, deError, entero, exito, fallo, numero, texto, type Resultado } from '@/lib/acciones'
import { localAIso } from '@/lib/formato'
import { enviarAviso, type AvisoCita } from '@/lib/avisos-cita'

// Acciones comunes a citas con propietarios y visitas de interesados (HU-14 y HU-26)

function refrescar(leadId?: string | null) {
  revalidatePath('/agenda')
  revalidatePath('/')
  if (leadId) revalidatePath(`/leads/${leadId}`)
}

// HU-14: la función SQL valida tipo, Baja, ciclo y dirección, y pasa el lead a "Cita agendada"
export async function agendarCita(_: Resultado | null, f: FormData): Promise<Resultado> {
  await exigirUsuario()
  const leadId = texto(f, 'lead_id')
  const inicio = texto(f, 'inicio')
  if (!leadId || !inicio) return fallo('Indica la fecha y hora')
  const supabase = await crearClienteServidor()
  const { error } = await supabase.rpc('agendar_cita', {
    p_lead_id: leadId,
    p_inicio: localAIso(inicio),
    p_direccion: texto(f, 'direccion'),
    p_distrito: texto(f, 'distrito'),
    p_duracion_min: entero(f, 'duracion_min') ?? 60,
    p_acceso_llave: texto(f, 'acceso_llave'),
    p_acceso_codigo: texto(f, 'acceso_codigo'),
    p_acceso_dni: casilla(f, 'acceso_dni'),
    p_acceso_otros: texto(f, 'acceso_otros'),
    p_notas: texto(f, 'notas'),
  })
  if (error) return deError(error)
  refrescar(leadId)
  revalidatePath('/leads')
  return exito('Cita agendada. Envía la confirmación por WhatsApp.')
}

// HU-15: crea o actualiza la ficha del inmueble en "En captación"; las fotos se suben en esa ficha
export async function registrarResultadoCita(_: Resultado | null, f: FormData): Promise<Resultado> {
  await exigirUsuario()
  const citaId = texto(f, 'cita_id')
  const precio = numero(f, 'precio')
  if (!citaId) return fallo('Cita no indicada')
  if (!precio || precio <= 0) return fallo('Registra el precio acordado')
  const supabase = await crearClienteServidor()
  const { data: inmuebleId, error } = await supabase.rpc('registrar_resultado_cita', {
    p_cita_id: citaId,
    p_resultado: texto(f, 'resultado'),
    p_tipo: texto(f, 'tipo'),
    p_direccion: texto(f, 'direccion'),
    p_distrito: texto(f, 'distrito'),
    p_precio: precio,
    p_conservacion: texto(f, 'conservacion'),
    p_metraje: numero(f, 'metraje'),
    p_dormitorios: entero(f, 'dormitorios'),
    p_banos: entero(f, 'banos'),
    p_cocheras: entero(f, 'cocheras') ?? 0,
    p_ascensor: casilla(f, 'ascensor'),
    p_descripcion: texto(f, 'descripcion'),
  })
  if (error) return deError(error)
  refrescar(texto(f, 'lead_id'))
  revalidatePath('/inmuebles')
  return exito('Resultado registrado: el inmueble quedó En captación', { inmuebleId })
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

// Confirmación al agendar y recordatorios 24 horas antes y el mismo día, por WhatsApp
export async function enviarAvisoCita(citaId: string, aviso: AvisoCita): Promise<Resultado> {
  await exigirUsuario()
  const r = await enviarAviso(await crearClienteServidor(), citaId, aviso)
  if (!r.ok) return fallo(r.error)
  refrescar(r.leadId)
  return exito(r.advertencia ?? 'Mensaje enviado')
}
