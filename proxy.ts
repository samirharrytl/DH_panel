import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { COOKIE_ACTIVIDAD, COOKIE_TTL } from '@/lib/sesion'

const RUTAS_PUBLICAS = ['/login', '/recuperar', '/auth/', '/api/whatsapp/webhook', '/api/cron/', '/api/v1/']

// Renueva la sesión de Supabase en cada petición, protege las rutas del panel y cierra la sesión
// tras el tiempo de inactividad configurado (HU-01). El cliente avisa su actividad con la cookie
// dh_actividad; el tiempo máximo (dh_ttl) lo fija el panel según el parámetro.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(lista, headers) {
          lista.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          lista.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
          Object.entries(headers).forEach(([k, v]) => response.headers.set(k, v))
        },
      },
    },
  )

  const { data } = await supabase.auth.getClaims()
  const conSesion = Boolean(data?.claims?.sub)
  const ruta = request.nextUrl.pathname
  const esPublica = RUTAS_PUBLICAS.some((r) => ruta.startsWith(r))

  if (conSesion) {
    const ultima = Number(request.cookies.get(COOKIE_ACTIVIDAD)?.value ?? 0)
    const ttlMin = Number(request.cookies.get(COOKIE_TTL)?.value ?? 0)
    if (ultima && ttlMin && Date.now() - ultima > ttlMin * 60_000 && !ruta.startsWith('/api/')) {
      await supabase.auth.signOut()
      const destino = new URL('/login', request.url)
      destino.searchParams.set('motivo', 'inactividad')
      const salida = NextResponse.redirect(destino)
      response.cookies.getAll().forEach((c) => salida.cookies.set(c))
      salida.cookies.delete(COOKIE_ACTIVIDAD)
      return salida
    }
    if (!ruta.startsWith('/api/')) {
      response.cookies.set(COOKIE_ACTIVIDAD, String(Date.now()), { path: '/', sameSite: 'lax' })
    }
    if (ruta === '/login' || ruta === '/recuperar') {
      return redirigirConCookies(new URL('/', request.url), response)
    }
  } else if (!esPublica && ruta !== '/restablecer') {
    const destino = new URL('/login', request.url)
    if (ruta !== '/') destino.searchParams.set('siguiente', ruta + request.nextUrl.search)
    return redirigirConCookies(destino, response)
  }

  return response
}

function redirigirConCookies(url: URL, response: NextResponse) {
  const salida = NextResponse.redirect(url)
  response.cookies.getAll().forEach((c) => salida.cookies.set(c))
  return salida
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|icon.svg|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp)$).*)'],
}
