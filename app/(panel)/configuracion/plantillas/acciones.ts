'use server'

import { revalidatePath } from 'next/cache'
import { exigirAdmin } from '@/lib/auth'
import { crearClienteServidor } from '@/lib/supabase/server'
import { variablesDesconocidas } from '@/lib/plantillas'
import { deError, exito, fallo, texto, type Resultado } from '@/lib/acciones'

// HU-04: edición de plantillas con variables
export async function guardarPlantilla(_: Resultado | null, f: FormData): Promise<Resultado> {
  await exigirAdmin()
  const clave = texto(f, 'clave')
  const cuerpo = String(f.get('cuerpo') ?? '').trim()
  if (!clave || !cuerpo) return fallo('El mensaje no puede quedar vacío')
  const desconocidas = variablesDesconocidas(cuerpo)
  if (desconocidas.length) return fallo(`Variables que no existen: ${desconocidas.map((v) => `[${v}]`).join(', ')}`)
  const supabase = await crearClienteServidor()
  const { error } = await supabase
    .from('plantillas')
    .update({ cuerpo, meta_nombre: texto(f, 'meta_nombre'), meta_idioma: texto(f, 'meta_idioma') ?? 'es' })
    .eq('clave', clave)
  if (error) return deError(error)
  revalidatePath('/configuracion/plantillas')
  return exito('Plantilla guardada')
}

export async function restablecerPlantilla(clave: string): Promise<Resultado> {
  await exigirAdmin()
  const supabase = await crearClienteServidor()
  const { data } = await supabase.from('plantillas').select('cuerpo_defecto').eq('clave', clave).single()
  const { error } = await supabase.from('plantillas').update({ cuerpo: data?.cuerpo_defecto }).eq('clave', clave)
  if (error) return deError(error)
  revalidatePath('/configuracion/plantillas')
  return exito('Plantilla restablecida')
}
