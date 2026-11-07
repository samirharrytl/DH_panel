'use server'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { crearClienteServidor } from '@/lib/supabase/server'
import { exito, fallo, texto, type Resultado } from '@/lib/acciones'

export async function iniciarSesion(_: Resultado | null, f: FormData): Promise<Resultado> {
  const email = texto(f, 'email')
  const password = String(f.get('password') ?? '')
  if (!email || !password) return fallo('Ingresa tu correo y contraseña')
  const supabase = await crearClienteServidor()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    if (/banned/i.test(error.message)) return fallo('Tu usuario está desactivado. Habla con el administrador.')
    if (/invalid login/i.test(error.message)) return fallo('Correo o contraseña incorrectos')
    return fallo(error.message)
  }
  const siguiente = texto(f, 'siguiente')
  redirect(siguiente?.startsWith('/') && !siguiente.startsWith('//') ? siguiente : '/')
}

async function urlBase() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
  const h = await headers()
  return `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}`
}

// HU-01: recuperación de contraseña por correo
export async function pedirRecuperacion(_: Resultado | null, f: FormData): Promise<Resultado> {
  const email = texto(f, 'email')
  if (!email) return fallo('Ingresa tu correo')
  const supabase = await crearClienteServidor()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await urlBase()}/auth/confirm?siguiente=/restablecer`,
  })
  if (error && !/rate limit/i.test(error.message)) return fallo(error.message)
  if (error) return fallo('Se enviaron demasiados correos. Espera unos minutos e inténtalo otra vez.')
  // Mismo mensaje exista o no la cuenta, para no revelar correos registrados
  return exito('Si el correo está registrado, te llegará un enlace para crear una nueva contraseña.')
}

export async function restablecerContrasena(_: Resultado | null, f: FormData): Promise<Resultado> {
  const password = String(f.get('password') ?? '')
  const confirmar = String(f.get('confirmar') ?? '')
  if (password.length < 8) return fallo('La contraseña debe tener al menos 8 caracteres')
  if (password !== confirmar) return fallo('Las contraseñas no coinciden')
  const supabase = await crearClienteServidor()
  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    if (/session/i.test(error.message)) return fallo('El enlace venció. Pide uno nuevo desde "¿Olvidaste tu contraseña?"')
    if (/different from the old/i.test(error.message)) return fallo('Usa una contraseña distinta a la anterior')
    return fallo(error.message)
  }
  redirect('/')
}
