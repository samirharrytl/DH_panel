import { NextResponse, type NextRequest } from 'next/server'
import { crearClienteAdmin } from '@/lib/supabase/admin'

// Tarea diaria (Vercel Cron): pasa a "No responde" a los leads que terminaron su cadencia sin
// responder. La misma función corre al abrir la bandeja, así que en local no hace falta el cron.
export async function GET(request: NextRequest) {
  const secreto = process.env.CRON_SECRET
  if (!secreto || request.headers.get('authorization') !== `Bearer ${secreto}`) {
    return new NextResponse('No autorizado', { status: 401 })
  }
  const { data, error } = await crearClienteAdmin().rpc('procesar_cadencias')
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, no_responde: data })
}
