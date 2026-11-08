'use server'

import { revalidatePath } from 'next/cache'
import { exigirUsuario } from '@/lib/auth'
import { crearClienteServidor } from '@/lib/supabase/server'
import { casilla, deError, entero, exito, fallo, lista, numero, texto, type Resultado } from '@/lib/acciones'
import { ESTADOS_DERIVACION, NIVELES } from '@/lib/catalogos'

const separar = (v: string | null) => [...new Set((v ?? '').split(',').map((x) => x.trim()).filter(Boolean))]

function refrescar(leadId: string) {
  revalidatePath(`/leads/${leadId}`)
  revalidatePath('/leads')
}

// HU-19: perfil de búsqueda. Al tener perfil y capacidad declarada, el lead pasa a Calificado (trigger).
export async function guardarBusqueda(_: Resultado | null, f: FormData): Promise<Resultado> {
  await exigirUsuario()
  const leadId = texto(f, 'lead_id')
  if (!leadId) return fallo('Lead no indicado')
  const precioMin = numero(f, 'precio_min')
  const precioMax = numero(f, 'precio_max')
  if (precioMin !== null && precioMax !== null && precioMin > precioMax) return fallo('El precio mínimo no puede ser mayor que el máximo')
  const supabase = await crearClienteServidor()
  const { error } = await supabase.from('busquedas').upsert({
    lead_id: leadId,
    finalidad: texto(f, 'finalidad'),
    distritos: separar(texto(f, 'distritos')),
    tipos: lista(f, 'tipos'),
    precio_min: precioMin,
    precio_max: precioMax,
    dormitorios_min: entero(f, 'dormitorios_min'),
    metraje_min: numero(f, 'metraje_min'),
    imprescindibles: [...new Set([...lista(f, 'imprescindibles'), ...separar(texto(f, 'otros_imprescindibles')).map((x) => x.toLowerCase())])],
    notas: texto(f, 'notas'),
  })
  if (error) return deError(error)
  refrescar(leadId)
  return exito('Perfil de búsqueda guardado')
}

// HU-20: capacidad financiera. Con presupuesto y forma de pago, el nivel sube solo a "Declarada" (trigger).
export async function guardarCapacidad(_: Resultado | null, f: FormData): Promise<Resultado> {
  await exigirUsuario()
  const leadId = texto(f, 'lead_id')
  if (!leadId) return fallo('Lead no indicado')
  const nivel = texto(f, 'nivel') ?? 'no_validada'
  if (!(nivel in NIVELES)) return fallo('Nivel no válido')
  const presupuesto = numero(f, 'presupuesto_max')
  const cuota = numero(f, 'cuota_inicial')
  if ((presupuesto ?? 0) < 0 || (cuota ?? 0) < 0) return fallo('Los montos no pueden ser negativos')
  const supabase = await crearClienteServidor()
  const { error } = await supabase.from('capacidad_financiera').upsert({
    lead_id: leadId,
    presupuesto_max: presupuesto,
    forma_pago: texto(f, 'forma_pago'),
    cuota_inicial: cuota,
    precalificacion: casilla(f, 'precalificacion'),
    mivivienda: casilla(f, 'mivivienda'),
    techo_propio: casilla(f, 'techo_propio'),
    nivel,
    notas: texto(f, 'notas'),
  })
  if (error) return deError(error)
  refrescar(leadId)
  return exito('Capacidad financiera guardada')
}

// HU-21: derivación a banco o bróker. Al quedar precalificado o aprobado, el nivel sube (trigger).
export async function crearDerivacion(_: Resultado | null, f: FormData): Promise<Resultado> {
  await exigirUsuario()
  const leadId = texto(f, 'lead_id')
  const entidad = texto(f, 'entidad')
  const tipo = texto(f, 'tipo_entidad')
  if (!leadId) return fallo('Lead no indicado')
  if (!entidad) return fallo('Indica el banco o bróker')
  if (tipo !== 'banco' && tipo !== 'broker') return fallo('Indica si es banco o bróker')
  const supabase = await crearClienteServidor()
  const { error } = await supabase.from('derivaciones').insert({ lead_id: leadId, entidad, tipo_entidad: tipo, notas: texto(f, 'notas') })
  if (error) return deError(error)
  refrescar(leadId)
  return exito('Derivación registrada')
}

export async function actualizarDerivacion(_: Resultado | null, f: FormData): Promise<Resultado> {
  await exigirUsuario()
  const leadId = texto(f, 'lead_id')
  const estado = texto(f, 'estado')
  if (!leadId) return fallo('Lead no indicado')
  if (!estado || !(estado in ESTADOS_DERIVACION)) return fallo('Estado no válido')
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from('derivaciones')
    .update({ estado, respuesta_el: texto(f, 'respuesta_el'), notas: texto(f, 'notas') })
    .eq('id', texto(f, 'derivacion_id'))
    .select('id')
  if (error) return deError(error)
  if (!data?.length) return fallo('No puedes editar esta derivación')
  refrescar(leadId)
  return exito(estado === 'precalificado' || estado === 'aprobado' ? 'Derivación actualizada: el nivel financiero subió' : 'Derivación actualizada')
}
