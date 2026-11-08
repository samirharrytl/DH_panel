import 'server-only'
import type { crearClienteServidor } from '@/lib/supabase/server'
import { normalizarNumero } from './texto'

type Cliente = Awaited<ReturnType<typeof crearClienteServidor>>

// Parámetros de difusión e insights (HU-03)
export async function parametrosDifusion(supabase: Cliente) {
  const { data } = await supabase
    .from('parametros')
    .select('clave, valor')
    .in('clave', ['redes_difusion', 'whatsapp_numero', 'insights_frecuencia_dias'])
  const valores = new Map(((data ?? []) as { clave: string; valor: unknown }[]).map((p) => [p.clave, p.valor]))
  const redes = valores.get('redes_difusion')
  const frecuencia = Math.trunc(Number(valores.get('insights_frecuencia_dias')))
  return {
    redes: Array.isArray(redes) ? redes.map((r) => String(r).trim()).filter(Boolean) : [],
    numero: normalizarNumero(valores.get('whatsapp_numero')),
    frecuencia: frecuencia > 0 ? frecuencia : 7,
  }
}

// Foto de portada (bucket privado): URL firmada por una hora
export async function urlPortada(supabase: Cliente, inmuebleId: string) {
  const { data: foto } = await supabase
    .from('inmueble_fotos')
    .select('ruta')
    .eq('inmueble_id', inmuebleId)
    .order('orden')
    .order('created_at')
    .limit(1)
    .maybeSingle()
  if (!foto) return null
  const { data } = await supabase.storage.from('inmuebles').createSignedUrl((foto as { ruta: string }).ruta, 3600)
  return data?.signedUrl ?? null
}
