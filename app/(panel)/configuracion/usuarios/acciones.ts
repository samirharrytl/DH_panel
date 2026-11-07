'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { exigirAdmin } from '@/lib/auth'
import { crearClienteAdmin } from '@/lib/supabase/admin'
import { crearClienteServidor } from '@/lib/supabase/server'
import { deError, exito, fallo, texto, type Resultado } from '@/lib/acciones'

const ROLES = ['administrador', 'asesor'] as const
const BLOQUEO = '876000h' // ~100 años: Supabase Auth no deja ingresar al usuario

async function urlBase() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
  const h = await headers()
  return `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}`
}

// HU-02: crear usuario con contraseña temporal o invitación por correo
export async function crearUsuario(_: Resultado | null, f: FormData): Promise<Resultado> {
  await exigirAdmin()
  const nombre = texto(f, 'nombre')
  const email = texto(f, 'email')?.toLowerCase()
  const rol = texto(f, 'rol') as (typeof ROLES)[number]
  const modo = texto(f, 'modo')
  const password = String(f.get('password') ?? '')
  if (!nombre || !email) return fallo('Nombre y correo son obligatorios')
  if (!ROLES.includes(rol)) return fallo('Rol no válido')
  if (modo === 'contrasena' && password.length < 8) return fallo('La contraseña temporal debe tener al menos 8 caracteres')

  const admin = crearClienteAdmin()
  const { data, error } =
    modo === 'invitacion'
      ? await admin.auth.admin.inviteUserByEmail(email, {
          data: { nombre },
          redirectTo: `${await urlBase()}/auth/confirm?siguiente=/restablecer`,
        })
      : await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { nombre } })
  if (error) {
    if (/already been registered|already exists/i.test(error.message)) return fallo('Ya existe un usuario con ese correo')
    return fallo(error.message)
  }
  const { error: errorPerfil } = await admin.from('perfiles').insert({ id: data.user.id, nombre, email, rol })
  if (errorPerfil) {
    await admin.auth.admin.deleteUser(data.user.id)
    return deError(errorPerfil)
  }
  revalidatePath('/configuracion/usuarios')
  return exito(modo === 'invitacion' ? `Se envió la invitación a ${email}` : `Usuario ${email} creado`)
}

export async function editarUsuario(_: Resultado | null, f: FormData): Promise<Resultado> {
  await exigirAdmin()
  const id = texto(f, 'id')
  const nombre = texto(f, 'nombre')
  const rol = texto(f, 'rol') as (typeof ROLES)[number]
  if (!id || !nombre || !ROLES.includes(rol)) return fallo('Datos incompletos')
  const supabase = await crearClienteServidor()
  const { error } = await supabase.from('perfiles').update({ nombre, rol, telefono: texto(f, 'telefono') }).eq('id', id)
  if (error) return deError(error)
  revalidatePath('/configuracion/usuarios')
  return exito('Usuario actualizado')
}

// Un usuario desactivado no puede entrar, pero su historial se conserva (no se borra)
export async function cambiarActivo(id: string, activo: boolean): Promise<Resultado> {
  const yo = await exigirAdmin()
  if (id === yo.id && !activo) return fallo('No puedes desactivarte a ti mismo')
  const supabase = await crearClienteServidor()
  const { error } = await supabase.from('perfiles').update({ activo }).eq('id', id)
  if (error) return deError(error)
  const { error: errorAuth } = await crearClienteAdmin().auth.admin.updateUserById(id, {
    ban_duration: activo ? 'none' : BLOQUEO,
  })
  if (errorAuth) return fallo(errorAuth.message)
  revalidatePath('/configuracion/usuarios')
  return exito(activo ? 'Usuario activado' : 'Usuario desactivado')
}
