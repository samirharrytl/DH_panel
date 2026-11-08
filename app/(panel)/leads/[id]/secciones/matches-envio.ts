import 'server-only'
import { crearClienteServidor } from '@/lib/supabase/server'
import { RESPUESTAS_MATCH, type RespuestaMatch } from '@/lib/catalogos'
import { enviarMensaje } from '@/lib/mensajeria'
import { lineaInmueble, type InmuebleLinea } from './matches-formato'

const VENTANA_MS = 24 * 3_600_000
const SIETE_DIAS_S = 7 * 24 * 3600

export type InmuebleEnvio = InmuebleLinea & { id: string }

export async function ventanaAbierta(personaId: string) {
  const supabase = await crearClienteServidor()
  const { data } = await supabase.from('personas').select('ultimo_entrante_at').eq('id', personaId).maybeSingle()
  const ultimo = (data as { ultimo_entrante_at: string | null } | null)?.ultimo_entrante_at
  return !!ultimo && Date.now() - new Date(ultimo).getTime() < VENTANA_MS
}

// HU-22/HU-23: dentro de la ventana de 24 horas, un mensaje por opción con la foto de portada y tres
// botones de respuesta rápida. El webhook reconoce el id MATCH:<opcion_id>:<respuesta> y guarda la
// respuesta. Fuera de la ventana no se envía nada: el asesor registra las respuestas a mano.
// Devuelve null si la ventana está cerrada, o cuántos se enviaron y el primer error.
export async function enviarBotonesOpciones(opciones: {
  envioId: string
  personaId: string
  leadId: string
  inmuebles: InmuebleEnvio[]
}): Promise<{ enviados: number; error?: string } | null> {
  if (!(await ventanaAbierta(opciones.personaId))) return null
  const supabase = await crearClienteServidor()
  const ids = opciones.inmuebles.map((i) => i.id)
  const [{ data: filasOpciones }, { data: filasFotos }] = await Promise.all([
    supabase.from('match_opciones').select('id, inmueble_id').eq('envio_id', opciones.envioId),
    supabase
      .from('inmueble_fotos')
      .select('inmueble_id, ruta')
      .in('inmueble_id', ids)
      .order('orden')
      .order('created_at'),
  ])
  const opcionPorInmueble = new Map(((filasOpciones ?? []) as { id: string; inmueble_id: string }[]).map((o) => [o.inmueble_id, o.id]))

  const portada = new Map<string, string>()
  for (const f of (filasFotos ?? []) as { inmueble_id: string; ruta: string }[]) {
    if (!portada.has(f.inmueble_id)) portada.set(f.inmueble_id, f.ruta)
  }
  const urlPorRuta = new Map<string, string>()
  if (portada.size) {
    const { data: firmadas } = await supabase.storage.from('inmuebles').createSignedUrls([...portada.values()], SIETE_DIAS_S)
    for (const f of firmadas ?? []) if (f.path && f.signedUrl) urlPorRuta.set(f.path, f.signedUrl)
  }

  let enviados = 0
  let error: string | undefined
  const total = opciones.inmuebles.length
  for (const [n, inmueble] of opciones.inmuebles.entries()) {
    const opcionId = opcionPorInmueble.get(inmueble.id)
    if (!opcionId) continue
    const ruta = portada.get(inmueble.id)
    const envio = await enviarMensaje({
      personaId: opciones.personaId,
      leadId: opciones.leadId,
      texto: `${total > 1 ? `Opción ${n + 1} de ${total}\n` : ''}${lineaInmueble(inmueble)}\n\n¿Qué te parece?`,
      botones: (Object.keys(RESPUESTAS_MATCH) as RespuestaMatch[]).map((r) => ({
        id: `MATCH:${opcionId}:${r}`,
        titulo: RESPUESTAS_MATCH[r],
      })),
      imagenUrl: ruta ? urlPorRuta.get(ruta) : undefined,
      metadata: { envio_id: opciones.envioId, opcion_id: opcionId, inmueble_id: inmueble.id },
    })
    if (envio.ok) enviados++
    else error ??= envio.error
  }
  return { enviados, error }
}
