'use server'

import { revalidatePath } from 'next/cache'
import { exigirUsuario } from '@/lib/auth'
import { crearClienteServidor } from '@/lib/supabase/server'
import { deError, exito, fallo, numero, siNo, texto, type Resultado } from '@/lib/acciones'
import { enviarMensaje, variablesLead } from '@/lib/mensajeria'

function refrescar(leadId: string | null, inmuebleId?: string | null) {
  if (leadId) revalidatePath(`/leads/${leadId}`)
  if (inmuebleId) revalidatePath(`/inmuebles/${inmuebleId}`)
  revalidatePath('/')
}

// HU-20: el nivel financiero exigido lo valida iniciar_compraventa. No existe la separación del inmueble.
export async function iniciarCompraventa(_: Resultado | null, f: FormData): Promise<Resultado> {
  await exigirUsuario()
  const leadId = texto(f, 'lead_id')
  const inmuebleId = texto(f, 'inmueble_id')
  if (!inmuebleId) return fallo('Elige el inmueble')
  const supabase = await crearClienteServidor()
  const { error } = await supabase.rpc('iniciar_compraventa', {
    p_lead_id: leadId,
    p_inmueble_id: inmuebleId,
    p_notas: texto(f, 'notas'),
  })
  if (error) return deError(error)
  refrescar(leadId, inmuebleId)
  return exito('Compraventa iniciada')
}

// HU-31: el inmueble pasa a Vendido, el comprador a Cliente y se programan los testimonios
export async function registrarCierre(_: Resultado | null, f: FormData): Promise<Resultado> {
  await exigirUsuario()
  const leadId = texto(f, 'lead_id')
  const fechaCierre = texto(f, 'fecha_cierre')
  const comision = numero(f, 'comision_pagada')
  if (!fechaCierre) return fallo('Indica la fecha de cierre')
  if (comision === null) return fallo('Indica la comisión pagada')
  const supabase = await crearClienteServidor()
  const { error } = await supabase.rpc('cerrar_compraventa', {
    p_compraventa_id: texto(f, 'compraventa_id'),
    p_fecha_cierre: fechaCierre,
    p_precio_venta: numero(f, 'precio_venta'),
    p_comision_pagada: comision,
    p_notas: texto(f, 'notas'),
  })
  if (error) return deError(error)
  refrescar(leadId, texto(f, 'inmueble_id'))
  revalidatePath('/inmuebles')
  return exito('Compraventa cerrada: el inmueble pasó a Vendido y el comprador a Cliente')
}

export async function marcarCompraventaCaida(_: Resultado | null, f: FormData): Promise<Resultado> {
  await exigirUsuario()
  const leadId = texto(f, 'lead_id')
  const motivo = texto(f, 'motivo')
  if (!motivo) return fallo('Indica el motivo')
  const supabase = await crearClienteServidor()
  const { error } = await supabase.rpc('marcar_compraventa_caida', {
    p_compraventa_id: texto(f, 'compraventa_id'),
    p_motivo: motivo,
  })
  if (error) return deError(error)
  refrescar(leadId, texto(f, 'inmueble_id'))
  return exito('Compraventa marcada como caída')
}

// HU-32: pedido de testimonio y reseña por WhatsApp, con el enlace de Google del parámetro
export async function pedirTestimonio(testimonioId: string): Promise<Resultado> {
  await exigirUsuario()
  const supabase = await crearClienteServidor()
  const [{ data: t }, { data: param }] = await Promise.all([
    supabase.from('testimonios').select('id, lead_id, pedido_at').eq('id', testimonioId).maybeSingle(),
    supabase.from('parametros').select('valor').eq('clave', 'resena_google_url').maybeSingle(),
  ])
  if (!t) return fallo('Testimonio no encontrado')
  if (t.pedido_at) return fallo('El testimonio ya se pidió')
  const enlace = typeof param?.valor === 'string' ? param.valor.trim() : ''
  const { personaId, ...variables } = await variablesLead(t.lead_id)
  const envio = await enviarMensaje({
    personaId,
    leadId: t.lead_id,
    plantilla: 'testimonio',
    variables: { ...variables, enlace_resena: enlace || null },
  })
  if (!envio.ok) return fallo(envio.error)
  const { error } = await supabase.rpc('registrar_pedido_testimonio', {
    p_testimonio_id: testimonioId,
    p_mensaje_id: envio.mensajeId,
  })
  if (error) return deError(error)
  refrescar(t.lead_id)
  return exito(envio.advertencia ?? (enlace ? 'Pedido enviado' : 'Pedido enviado sin enlace de reseña: configúralo en Parámetros'))
}

export async function guardarTestimonio(_: Resultado | null, f: FormData): Promise<Resultado> {
  await exigirUsuario()
  const leadId = texto(f, 'lead_id')
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from('testimonios')
    .update({
      dio_testimonio: siNo(f, 'dio_testimonio'),
      dio_resena: siNo(f, 'dio_resena'),
      autoriza_redes: siNo(f, 'autoriza_redes'),
      testimonio: texto(f, 'testimonio'),
      notas: texto(f, 'notas'),
    })
    .eq('id', texto(f, 'testimonio_id'))
    .select('id')
  if (error) return deError(error)
  if (!data?.length) return fallo('No tienes acceso a este testimonio')
  refrescar(leadId)
  return exito('Testimonio guardado')
}

// HU-33: intención de postventa de la persona
export async function guardarIntencion(_: Resultado | null, f: FormData): Promise<Resultado> {
  await exigirUsuario()
  const leadId = texto(f, 'lead_id')
  const intencion = texto(f, 'intencion')
  if (intencion && !['invertir', 'comprar_otro', 'vender'].includes(intencion)) return fallo('Intención no válida')
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from('personas')
    .update({ intencion })
    .eq('id', texto(f, 'persona_id'))
    .select('id')
  if (error) return deError(error)
  if (!data?.length) return fallo('No tienes acceso a esta persona')
  refrescar(leadId)
  revalidatePath('/marketing')
  return exito('Intención guardada')
}
