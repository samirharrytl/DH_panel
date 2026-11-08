'use server'

import { revalidatePath } from 'next/cache'
import { exigirUsuario } from '@/lib/auth'
import { crearClienteServidor } from '@/lib/supabase/server'
import { deError, exito, fallo, entero, numero, siNo, texto, type Resultado } from '@/lib/acciones'

// HU-13: ficha de calificación del propietario (Módulo 1.2). La RLS limita a los leads que ve el usuario.
export async function guardarCalificacion(_: Resultado | null, f: FormData): Promise<Resultado> {
  await exigirUsuario()
  const leadId = texto(f, 'lead_id')
  if (!leadId) return fallo('Lead no indicado')
  const nums = { metraje: numero(f, 'metraje'), hipoteca_saldo: numero(f, 'hipoteca_saldo'), precio_esperado: numero(f, 'precio_esperado') }
  const ents = { dormitorios: entero(f, 'dormitorios'), banos: entero(f, 'banos') }
  if ([...Object.values(nums), ...Object.values(ents)].some((n) => n !== null && n < 0)) return fallo('Los montos y medidas no pueden ser negativos')

  const rol = texto(f, 'rol_contacto')
  const hipoteca = siNo(f, 'hipoteca')
  const copropietarios = siNo(f, 'copropietarios')
  const supabase = await crearClienteServidor()
  const { error } = await supabase.from('calificacion_propietario').upsert({
    lead_id: leadId,
    rol_contacto: rol,
    tiene_poder: rol === 'encargado' ? siNo(f, 'tiene_poder') : null,
    hipoteca,
    hipoteca_banco: hipoteca ? texto(f, 'hipoteca_banco') : null,
    hipoteca_saldo: hipoteca ? nums.hipoteca_saldo : null,
    tipo_inmueble: texto(f, 'tipo_inmueble'),
    direccion: texto(f, 'direccion'),
    distrito: texto(f, 'distrito'),
    metraje: nums.metraje,
    ...ents,
    cochera: siNo(f, 'cochera'),
    precio_esperado: nums.precio_esperado,
    urgencia: texto(f, 'urgencia'),
    inscrito_sunarp: siNo(f, 'inscrito_sunarp'),
    copropietarios,
    copropietarios_detalle: copropietarios ? texto(f, 'copropietarios_detalle') : null,
    notas: texto(f, 'notas'),
  })
  if (error) return deError(error)
  revalidatePath(`/leads/${leadId}`)
  return exito('Calificación guardada')
}
