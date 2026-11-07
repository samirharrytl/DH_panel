import { NextResponse, type NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { crearClienteServidor } from '@/lib/supabase/server'

// Destino de los enlaces de correo de Supabase (recuperación de contraseña e invitaciones).
// Admite el flujo PKCE (?code=) y el de token_hash.
export async function GET(request: NextRequest) {
  const url = request.nextUrl
  const siguiente = url.searchParams.get('siguiente')
  const destino = siguiente?.startsWith('/') && !siguiente.startsWith('//') ? siguiente : '/'
  const supabase = await crearClienteServidor()

  const code = url.searchParams.get('code')
  const tokenHash = url.searchParams.get('token_hash')
  const tipo = url.searchParams.get('type') as EmailOtpType | null

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && tipo
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type: tipo })
      : { error: new Error('Enlace incompleto') }

  if (error) return NextResponse.redirect(new URL('/restablecer', request.url))
  return NextResponse.redirect(new URL(tipo === 'recovery' ? '/restablecer' : destino, request.url))
}
