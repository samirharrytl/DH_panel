'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { exigirUsuario } from '@/lib/auth'
import { crearClienteServidor } from '@/lib/supabase/server'
import { deError, exito, fallo, texto, type Resultado } from '@/lib/acciones'
import { INTENCIONES, MEDIOS_CONTACTO } from '@/lib/catalogos'

const ruta = (persona: string) => `/personas/${persona}`

// Ficha del contacto: los datos comunes a todos sus leads se editan aquí y quedan en el historial
export async function editarContacto(_: Resultado | null, f: FormData): Promise<Resultado> {
  await exigirUsuario()
  const persona = texto(f, 'persona_id')
  const nombre = texto(f, 'nombre')
  const genero = texto(f, 'genero')
  const medio = texto(f, 'medio_contacto')
  const intencion = texto(f, 'intencion')
  if (!persona) return fallo('Contacto no indicado')
  if (!nombre) return fallo('El nombre es obligatorio')
  if (genero && genero !== 'femenino' && genero !== 'masculino') return fallo('Género no válido')
  if (medio && !(medio in MEDIOS_CONTACTO)) return fallo('Medio de contacto no válido')
  if (intencion && !(intencion in INTENCIONES)) return fallo('Intención no válida')
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from('personas')
    .update({
      nombre,
      email: texto(f, 'email'),
      genero,
      horario_preferido: texto(f, 'horario_preferido'),
      medio_contacto: medio,
      intencion,
    })
    .eq('id', persona)
    .select('id')
  if (error) return deError(error)
  if (!data?.length) return fallo('No puedes editar este contacto')
  revalidatePath(ruta(persona))
  revalidatePath('/contactos')
  revalidatePath('/leads')
  return exito('Datos del contacto guardados')
}

export async function agregarTelefono(persona: string, _: Resultado | null, f: FormData): Promise<Resultado> {
  await exigirUsuario()
  const supabase = await crearClienteServidor()
  const { error } = await supabase.rpc('agregar_telefono', { p_persona: persona, p_telefono: texto(f, 'telefono') })
  if (error) return deError(error)
  revalidatePath(ruta(persona))
  return exito('Teléfono agregado')
}

export async function quitarTelefono(persona: string, tel: string): Promise<Resultado> {
  await exigirUsuario()
  const supabase = await crearClienteServidor()
  const { error } = await supabase.rpc('quitar_telefono', { p_persona: persona, p_telefono: tel })
  if (error) return deError(error)
  revalidatePath(ruta(persona))
  return exito('Teléfono quitado')
}

export async function marcarPrincipal(persona: string, tel: string): Promise<Resultado> {
  await exigirUsuario()
  const supabase = await crearClienteServidor()
  const { error } = await supabase.rpc('marcar_principal', { p_persona: persona, p_telefono: tel })
  if (error) return deError(error)
  revalidatePath(ruta(persona))
  return exito('Teléfono principal actualizado')
}

export async function descartarSugerencia(persona: string, id: number): Promise<Resultado> {
  await exigirUsuario()
  const supabase = await crearClienteServidor()
  const { error } = await supabase.rpc('descartar_sugerencia', { p_id: id })
  if (error) return deError(error)
  revalidatePath(ruta(persona))
  return exito('Sugerencia descartada')
}

export async function unirPersonas(queda: string, absorbida: string, _: Resultado | null, f: FormData): Promise<Resultado> {
  await exigirUsuario()
  const supabase = await crearClienteServidor()
  const siguen = ['propietario', 'interesado'].map((t) => texto(f, `sigue_${t}`)).filter((v): v is string => !!v)
  const { error } = await supabase.rpc('unir_personas', { p_queda: queda, p_absorbida: absorbida, p_leads_que_siguen: siguen })
  if (error) return deError(error)
  revalidatePath('/leads')
  redirect(ruta(queda))
}
