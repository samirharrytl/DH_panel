'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { exigirUsuario } from '@/lib/auth'
import { crearClienteServidor } from '@/lib/supabase/server'
import { deError, exito, texto, type Resultado } from '@/lib/acciones'

const ruta = (persona: string) => `/personas/${persona}`

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
