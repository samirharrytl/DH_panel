import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { crearClienteServidor } from '@/lib/supabase/server'

export type Rol = 'administrador' | 'asesor'
export type Usuario = { id: string; nombre: string; email: string; rol: Rol; esAdmin: boolean }

// Usuario con sesión y perfil activo, una vez por petición. Un usuario desactivado no entra (HU-02).
export const obtenerUsuario = cache(async (): Promise<Usuario | null> => {
  const supabase = await crearClienteServidor()
  const { data } = await supabase.auth.getClaims()
  const id = data?.claims?.sub
  if (!id) return null
  const { data: perfil } = await supabase
    .from('perfiles')
    .select('id, nombre, email, rol, activo')
    .eq('id', id)
    .maybeSingle()
  if (!perfil?.activo) return null
  return { id: perfil.id, nombre: perfil.nombre, email: perfil.email, rol: perfil.rol, esAdmin: perfil.rol === 'administrador' }
})

export async function exigirUsuario() {
  const usuario = await obtenerUsuario()
  if (!usuario) redirect('/auth/salir?motivo=sin_acceso')
  return usuario
}

export async function exigirAdmin() {
  const usuario = await exigirUsuario()
  if (!usuario.esAdmin) redirect('/')
  return usuario
}
