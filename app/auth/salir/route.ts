import { NextResponse, type NextRequest } from 'next/server'
import { crearClienteServidor } from '@/lib/supabase/server'
import { COOKIE_ACTIVIDAD } from '@/lib/sesion'

async function salir(request: NextRequest) {
  const supabase = await crearClienteServidor()
  await supabase.auth.signOut()
  const motivo = request.nextUrl.searchParams.get('motivo') ?? 'salida'
  const respuesta = NextResponse.redirect(new URL(`/login?motivo=${encodeURIComponent(motivo)}`, request.url), 303)
  respuesta.cookies.delete(COOKIE_ACTIVIDAD)
  return respuesta
}

export const GET = salir
export const POST = salir
