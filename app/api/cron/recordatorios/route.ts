import { NextResponse, type NextRequest } from 'next/server'
import { crearClienteAdmin } from '@/lib/supabase/admin'
import { enviarAviso } from '@/lib/avisos-cita'
import { avisoQueToca } from '@/lib/recordatorios'

// Recordatorios automáticos de citas y visitas (24 horas antes y el mismo día). Lo llama un cron externo
// cada 15 minutos con el encabezado "Authorization: Bearer <CRON_SECRET>". Las Bajas no reciben nada:
// dar_baja cancela sus citas y enviarMensaje lo vuelve a revisar.
export async function GET(request: NextRequest) {
  const secreto = process.env.CRON_SECRET
  if (!secreto || request.headers.get('authorization') !== `Bearer ${secreto}`) {
    return new NextResponse('No autorizado', { status: 401 })
  }
  const supabase = crearClienteAdmin()
  const ahora = Date.now()
  const { data: citas, error } = await supabase
    .from('citas')
    .select('id, inicio, recordatorio_24h_at, recordatorio_dia_at')
    .eq('estado', 'programada')
    .gt('inicio', new Date(ahora).toISOString())
    .lte('inicio', new Date(ahora + 24 * 3_600_000).toISOString())
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const enviados: string[] = []
  const errores: string[] = []
  for (const c of citas ?? []) {
    const aviso = avisoQueToca(c.inicio, c, ahora)
    if (!aviso) continue
    const r = await enviarAviso(supabase, c.id, aviso)
    if (r.ok) enviados.push(`${c.id}:${aviso}`)
    else errores.push(`${c.id}:${aviso}: ${r.error}`)
  }
  if (errores.length) console.error('Recordatorios con errores', errores)
  return NextResponse.json({ ok: true, enviados, errores })
}
