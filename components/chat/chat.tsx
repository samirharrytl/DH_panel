import { crearClienteServidor } from '@/lib/supabase/server'
import { modoWhatsApp } from '@/lib/whatsapp'
import { primerNombre, variablesLead } from '@/lib/mensajeria'
import { ChatCliente, type MensajeChat } from './chat-cliente'

// Chat de WhatsApp de una persona (un número, un chat). Se usa en la ficha del lead y en /chats.
export async function Chat({ personaId, leadId }: { personaId: string; leadId: string | null }) {
  const supabase = await crearClienteServidor()
  const [{ data: persona }, { data: mensajes }, { data: plantillas }] = await Promise.all([
    supabase.from('personas').select('id, nombre, no_contactar, ultimo_entrante_at').eq('id', personaId).single(),
    supabase
      .from('mensajes')
      .select('id, direccion, tipo, cuerpo, origen, estado, error, metadata, plantilla_clave, created_at, autor:perfiles(nombre)')
      .eq('persona_id', personaId)
      .order('created_at', { ascending: false })
      .limit(300),
    supabase.from('plantillas').select('clave, nombre, cuerpo, meta_nombre, categoria').order('orden'),
  ])
  if (!persona) return null
  const variables = leadId
    ? await variablesLead(leadId).then(({ personaId: _p, ...v }) => v)
    : { nombre: primerNombre(persona.nombre) }
  const ventanaHasta = persona.ultimo_entrante_at ? new Date(persona.ultimo_entrante_at).getTime() + 86_400_000 : null

  return (
    <ChatCliente
      personaId={personaId}
      leadId={leadId}
      mensajes={((mensajes ?? []) as unknown as MensajeChat[]).reverse()}
      plantillas={plantillas ?? []}
      variables={variables}
      ventanaHasta={ventanaHasta}
      bloqueado={persona.no_contactar}
      simulado={modoWhatsApp() === 'simulado'}
    />
  )
}
