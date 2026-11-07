import { Chat } from '@/components/chat/chat'
import type { PropsSeccion } from '../tipos'

// HU-12: chat de WhatsApp con el lead; toda la conversación queda en su ficha
export async function SeccionChat({ lead }: PropsSeccion) {
  return <Chat personaId={lead.persona_id} leadId={lead.id} />
}
