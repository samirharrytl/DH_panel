import type { Metadata } from 'next'
import Link from 'next/link'
import { exigirUsuario } from '@/lib/auth'
import { crearClienteServidor } from '@/lib/supabase/server'
import { ESTADOS_LEAD, TIPOS_LEAD, type EstadoLead, type TipoLead } from '@/lib/catalogos'
import { relativo, telefono } from '@/lib/formato'
import { Aviso, EncabezadoPagina, Vacio } from '@/components/campos'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Chat } from '@/components/chat/chat'

export const metadata: Metadata = { title: 'Chats' }

type Fila = {
  persona_id: string
  cuerpo: string | null
  direccion: string
  created_at: string
  leido_at: string | null
  persona: { id: string; nombre: string; telefono: string } | null
}

export default async function PaginaChats({ searchParams }: PageProps<'/chats'>) {
  const usuario = await exigirUsuario()
  const { persona: seleccion } = await searchParams
  const supabase = await crearClienteServidor()
  const { data } = await supabase
    .from('mensajes')
    .select('persona_id, cuerpo, direccion, created_at, leido_at, persona:personas(id, nombre, telefono)')
    .order('created_at', { ascending: false })
    .limit(600)

  const conversaciones = new Map<string, { ultimo: Fila; sinLeer: number }>()
  for (const m of (data ?? []) as unknown as Fila[]) {
    const c = conversaciones.get(m.persona_id)
    const nuevo = m.direccion === 'entrante' && !m.leido_at ? 1 : 0
    if (c) c.sinLeer += nuevo
    else conversaciones.set(m.persona_id, { ultimo: m, sinLeer: nuevo })
  }
  const lista = [...conversaciones.values()]
  const personaId = typeof seleccion === 'string' ? seleccion : null
  const { data: leads } = personaId
    ? await supabase
        .from('leads')
        .select('id, tipo, estado, vigente')
        .eq('persona_id', personaId)
        .order('vigente', { ascending: false })
        .order('created_at', { ascending: false })
    : { data: null }
  const actual = personaId ? conversaciones.get(personaId)?.ultimo.persona : null
  const leadPrincipal = leads?.find((l) => l.vigente) ?? leads?.[0]

  return (
    <>
      <EncabezadoPagina titulo="Chats" descripcion="Todas las conversaciones de WhatsApp del número de DepaHost que puedes ver." />
      <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <ul className={cn('space-y-1', personaId && 'hidden lg:block')}>
          {lista.length === 0 && <Vacio>Sin conversaciones todavía.</Vacio>}
          {lista.map(({ ultimo, sinLeer }) => (
            <li key={ultimo.persona_id}>
              <Link
                href={`/chats?persona=${ultimo.persona_id}`}
                className={cn(
                  'block rounded-lg border px-3 py-2',
                  ultimo.persona_id === personaId ? 'border-primary bg-accent' : 'border-border bg-card hover:border-primary',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium text-foreground">{ultimo.persona?.nombre}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{relativo(ultimo.created_at)}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-muted-foreground">
                    {ultimo.direccion === 'saliente' && 'Tú: '}
                    {ultimo.cuerpo}
                  </span>
                  {sinLeer > 0 && <span className="rounded-full bg-wa-700 px-1.5 text-xs text-white">{sinLeer}</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>

        {personaId && actual ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <Link href="/chats" className="text-sm text-primary hover:underline lg:hidden">
                  ← Chats
                </Link>
                <p className="font-semibold text-foreground">{actual.nombre}</p>
                <p className="text-xs text-muted-foreground">{telefono(actual.telefono)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {leads?.map((l) => (
                  <Link key={l.id} href={`/leads/${l.id}`} className="text-sm text-primary hover:underline">
                    {TIPOS_LEAD[l.tipo as TipoLead]}{' '}
                    <Badge variant="gris">{ESTADOS_LEAD[l.estado as EstadoLead]}</Badge>
                  </Link>
                ))}
              </div>
            </div>
            {!leads?.length && (
              <Aviso tipo="alerta">
                Este número escribió pero aún no es un lead.{' '}
                {usuario.esAdmin && (
                  <Button asChild size="sm" className="ml-2">
                    <Link href={`/leads/nuevo?telefono=${actual.telefono}&nombre=${encodeURIComponent(actual.nombre)}`}>
                      Registrar como lead
                    </Link>
                  </Button>
                )}
              </Aviso>
            )}
            <Chat personaId={personaId} leadId={leadPrincipal?.id ?? null} />
          </div>
        ) : (
          <div className="hidden lg:block">
            <Vacio>Elige una conversación.</Vacio>
          </div>
        )}
      </div>
    </>
  )
}
