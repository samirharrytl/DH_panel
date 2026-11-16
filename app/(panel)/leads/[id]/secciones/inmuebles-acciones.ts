'use server'

import { revalidatePath } from 'next/cache'
import { exigirUsuario } from '@/lib/auth'
import { crearClienteServidor } from '@/lib/supabase/server'
import { deError, exito, fallo, numero, siNo, texto, type Resultado } from '@/lib/acciones'
import { TIPOS_INMUEBLE, URGENCIAS } from '@/lib/catalogos'

function refrescar(leadId: string, inmuebleId?: string) {
  revalidatePath(`/leads/${leadId}`)
  revalidatePath('/leads')
  revalidatePath('/inmuebles')
  if (inmuebleId) revalidatePath(`/inmuebles/${inmuebleId}`)
}

// El inmueble nace en captación: tipo, dirección y distrito pueden quedar para después
export async function agregarInmueble(_: Resultado | null, f: FormData): Promise<Resultado> {
  await exigirUsuario()
  const leadId = texto(f, 'lead_id')
  if (!leadId) return fallo('Lead no indicado')
  const tipo = texto(f, 'tipo')
  if (tipo && !(tipo in TIPOS_INMUEBLE)) return fallo('Elige un tipo de inmueble válido')
  const precio = numero(f, 'precio_esperado')
  if (precio !== null && precio < 0) return fallo('El precio no puede ser negativo')
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.rpc('agregar_inmueble', {
    p_lead_id: leadId,
    p_tipo: tipo,
    p_direccion: texto(f, 'direccion'),
    p_distrito: texto(f, 'distrito'),
    p_precio_esperado: precio,
  })
  if (error) return deError(error)
  refrescar(leadId)
  return exito('Inmueble agregado en captación', { id: data as string })
}

// Ficha de captación (solo el asesor del lead y el administrador la ven): datos sensibles del inmueble
export async function guardarCaptacion(_: Resultado | null, f: FormData): Promise<Resultado> {
  await exigirUsuario()
  const inmuebleId = texto(f, 'inmueble_id')
  const leadId = texto(f, 'lead_id')
  if (!inmuebleId || !leadId) return fallo('Inmueble no indicado')

  const rol = texto(f, 'rol_contacto')
  if (rol && rol !== 'propietario' && rol !== 'encargado') return fallo('Rol de contacto no válido')
  const urgencia = texto(f, 'urgencia')
  if (urgencia && !(urgencia in URGENCIAS)) return fallo('Urgencia no válida')
  const hipoteca = siNo(f, 'hipoteca')
  const copropietarios = siNo(f, 'copropietarios')
  const saldo = numero(f, 'hipoteca_saldo')
  if (saldo !== null && saldo < 0) return fallo('El saldo no puede ser negativo')

  const supabase = await crearClienteServidor()
  const { error } = await supabase.from('inmueble_captacion').upsert({
    inmueble_id: inmuebleId,
    rol_contacto: rol,
    tiene_poder: rol === 'encargado' ? siNo(f, 'tiene_poder') : null,
    hipoteca,
    hipoteca_banco: hipoteca ? texto(f, 'hipoteca_banco') : null,
    hipoteca_saldo: hipoteca ? saldo : null,
    urgencia,
    inscrito_sunarp: siNo(f, 'inscrito_sunarp'),
    copropietarios,
    copropietarios_detalle: copropietarios ? texto(f, 'copropietarios_detalle') : null,
    notas: texto(f, 'notas'),
  })
  if (error) return deError(error)
  refrescar(leadId, inmuebleId)
  return exito('Ficha de captación guardada')
}
