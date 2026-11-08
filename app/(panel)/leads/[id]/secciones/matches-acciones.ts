'use server'

import { revalidatePath } from 'next/cache'
import { exigirUsuario } from '@/lib/auth'
import { crearClienteServidor } from '@/lib/supabase/server'
import { deError, exito, fallo, lista, mensajeError, texto, type Resultado } from '@/lib/acciones'
import { RESPUESTAS_MATCH } from '@/lib/catalogos'
import { enviarMensaje, variablesLead } from '@/lib/mensajeria'
import { lineaInmueble } from './matches-formato'
import { enviarBotonesOpciones, type InmuebleEnvio } from './matches-envio'

// HU-22: envío de hasta N opciones (parámetro match_max_opciones) con la plantilla "match"
export async function enviarMatches(_: Resultado | null, f: FormData): Promise<Resultado> {
  await exigirUsuario()
  const leadId = texto(f, 'lead_id')
  const ids = [...new Set(lista(f, 'inmueble'))]
  // HU-24: la novedad de un inmueble nuevo usa el mismo envío con su plantilla y su tope de frecuencia
  const tipo = texto(f, 'tipo') === 'novedad' ? 'novedad' : 'match'
  if (!leadId) return fallo('Lead no válido')
  if (!ids.length) return fallo('Elige al menos un inmueble')
  const supabase = await crearClienteServidor()

  const { data: errorValidacion, error } = await supabase.rpc('validar_envio_match', {
    p_lead_id: leadId,
    p_tipo: tipo,
    p_cantidad: ids.length,
  })
  if (error) return deError(error)
  if (errorValidacion) return fallo(String(errorValidacion))

  const { data: filas } = await supabase
    .from('inmuebles')
    .select('id, codigo, tipo, distrito, precio, dormitorios, metraje, estado')
    .in('id', ids)
  const porId = new Map(((filas ?? []) as (InmuebleEnvio & { estado: string })[]).map((i) => [i.id, i]))
  const inmuebles = ids.map((id) => porId.get(id)).filter((i) => i !== undefined)
  if (inmuebles.length !== ids.length || inmuebles.some((i) => i.estado !== 'en_cartera')) {
    return fallo('Uno de los inmuebles ya no está en cartera. Actualiza la página y vuelve a elegir.')
  }

  const { personaId, ...variables } = await variablesLead(leadId)
  const opciones = inmuebles.map((i, n) => `${n + 1}. ${lineaInmueble(i)}`).join('\n')
  const envio = await enviarMensaje({
    personaId,
    leadId,
    plantilla: tipo === 'novedad' ? 'novedades' : 'match',
    variables: { ...variables, opciones },
    metadata: { inmuebles: ids },
  })
  if (!envio.ok) return fallo(envio.error)

  const { data: envioId, error: errorRegistro } = await supabase.rpc('registrar_envio_match', {
    p_lead_id: leadId,
    p_inmuebles: ids,
    p_tipo: tipo,
    p_mensaje_id: envio.mensajeId,
  })
  if (errorRegistro) return fallo(`El mensaje se envió, pero no se pudo registrar el envío: ${mensajeError(errorRegistro)}`)

  const botones = await enviarBotonesOpciones({ envioId: String(envioId), personaId, leadId, inmuebles })
  revalidatePath(`/leads/${leadId}`)
  revalidatePath(`/inmuebles/${ids[0]}`)

  const partes = [envio.advertencia ?? `${ids.length === 1 ? 'Opción enviada' : `${ids.length} opciones enviadas`}.`]
  if (!botones) partes.push('Ventana de 24 horas cerrada: registra sus respuestas a mano.')
  else if (botones.error) partes.push(`Algunas opciones no salieron con botones: ${botones.error}`)
  else partes.push('Cada opción salió aparte con botones de respuesta rápida.')
  return exito(partes.join(' '))
}

// HU-23: respuesta registrada por el asesor (las de los botones las guarda el webhook)
export async function registrarRespuestaMatch(opcionId: string, leadId: string, respuesta: string): Promise<Resultado> {
  await exigirUsuario()
  if (!(respuesta in RESPUESTAS_MATCH)) return fallo('Respuesta no válida')
  const supabase = await crearClienteServidor()
  const { error } = await supabase.rpc('registrar_respuesta_match', { p_opcion_id: opcionId, p_respuesta: respuesta })
  if (error) return deError(error)
  revalidatePath(`/leads/${leadId}`)
  return exito(`Respuesta registrada: ${RESPUESTAS_MATCH[respuesta as keyof typeof RESPUESTAS_MATCH]}`)
}
