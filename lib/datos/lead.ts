import 'server-only'
import { cache } from 'react'
import { crearClienteServidor } from '@/lib/supabase/server'
import type { Canal, EstadoLead, TipoLead } from '@/lib/catalogos'

export type Persona = {
  id: string
  telefono: string
  nombre: string
  email: string | null
  genero: 'femenino' | 'masculino' | null
  horario_preferido: string | null
  medio_contacto: 'chat_whatsapp' | 'llamada_whatsapp' | 'celular' | null
  no_contactar: boolean
  no_contactar_at: string | null
  intencion: 'invertir' | 'comprar_otro' | 'vender' | null
  ultimo_entrante_at: string | null
  created_at: string
}

export type Lead = {
  id: string
  numero: number
  persona_id: string
  tipo: TipoLead
  estado: EstadoLead
  canal: Canal
  canal_detalle: string | null
  asesor_id: string | null
  vigente: boolean
  ciclo: number
  lead_anterior_id: string | null
  consentimiento_datos: boolean
  consentimiento_marketing: boolean
  consentimiento_at: string | null
  recibe_novedades: boolean
  bienvenida_at: string | null
  respondio_at: string | null
  ultima_interaccion_at: string
  estado_antes_salida: EstadoLead | null
  salida_at: string | null
  motivo_salida: string | null
  ultimas_novedades_at: string | null
  proxima_accion: string | null
  proxima_accion_at: string | null
  inmueble_interes_id: string | null
  publicacion_id: string | null
  created_at: string
}

export type LeadFicha = Lead & {
  persona: Persona
  asesor: { id: string; nombre: string } | null
  inmueble_interes: { id: string; codigo: string; tipo: string; distrito: string; precio: number | null } | null
  publicacion: { id: string; codigo: string; red: string } | null
  proxima: { accion: string | null; fecha: string | null }
  otros: (Pick<Lead, 'id' | 'tipo' | 'estado' | 'ciclo' | 'vigente' | 'created_at'> & { asesor_id: string | null })[]
}

// Lead con su persona y lo necesario para la cabecera de la ficha. Null si no existe o no hay acceso.
export const cargarLead = cache(async (id: string): Promise<LeadFicha | null> => {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const supabase = await crearClienteServidor()
  const { data } = await supabase
    .from('leads')
    .select(
      `*, persona:personas(*), asesor:perfiles!leads_asesor_id_fkey(id, nombre),
       inmueble_interes:inmuebles!leads_inmueble_interes_id_fkey(id, codigo, tipo, distrito, precio),
       publicacion:publicaciones!leads_publicacion_id_fkey(id, codigo, red)`,
    )
    .eq('id', id)
    .maybeSingle()
  if (!data) return null
  const [{ data: bandeja }, { data: otros }] = await Promise.all([
    supabase.from('v_bandeja').select('proxima_accion, proxima_accion_at').eq('id', id).maybeSingle(),
    supabase
      .from('leads')
      .select('id, tipo, estado, ciclo, vigente, created_at, asesor_id')
      .eq('persona_id', data.persona_id)
      .neq('id', id)
      .order('created_at', { ascending: false }),
  ])
  return {
    ...(data as unknown as LeadFicha),
    proxima: { accion: bandeja?.proxima_accion ?? null, fecha: bandeja?.proxima_accion_at ?? null },
    otros: (otros ?? []) as LeadFicha['otros'],
  }
})
