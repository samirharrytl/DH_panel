'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { Bell } from 'lucide-react'
import { crearClienteNavegador } from '@/lib/supabase/navegador'
import { relativo } from '@/lib/formato'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

export type Notificacion = {
  id: number
  titulo: string
  cuerpo: string | null
  enlace: string | null
  leida_at: string | null
  created_at: string
}

// Alertas del usuario: leads nuevos o asignados, citas agendadas o reprogramadas, mensajes entrantes.
// Se actualiza en vivo con Supabase Realtime.
export function Campana({
  usuarioId,
  notificaciones,
  marcarLeidas,
}: {
  usuarioId: string
  notificaciones: Notificacion[]
  marcarLeidas: () => Promise<unknown>
}) {
  const router = useRouter()
  const [abierta, setAbierta] = useState(false)
  const [, iniciar] = useTransition()
  const sinLeer = notificaciones.filter((n) => !n.leida_at).length

  useEffect(() => {
    const supabase = crearClienteNavegador()
    const nombre = `notificaciones:${usuarioId}`
    const topico = `realtime:${nombre}`
    // channel() reutiliza el canal si ya existe; si sigue suscrito (p. ej. React
    // Strict Mode / remount) .on() falla con "cannot add postgres_changes
    // callbacks after subscribe()". Se retira de la lista al instante y se crea uno nuevo.
    const previo = supabase.getChannels().find((c) => c.topic === topico)
    if (previo) {
      void supabase.removeChannel(previo)
      ;(supabase as unknown as { realtime: { _remove: (c: typeof previo) => void } }).realtime?._remove?.(previo)
    }
    const canal = supabase
      .channel(nombre)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notificaciones', filter: `usuario_id=eq.${usuarioId}` },
        () => router.refresh(),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(canal)
    }
  }, [usuarioId, router])

  return (
    <Popover open={abierta} onOpenChange={setAbierta}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Notificaciones${sinLeer ? `: ${sinLeer} sin leer` : ''}`}>
          <Bell aria-hidden className="size-5 text-primary" />
          {sinLeer > 0 && (
            <span className="absolute top-1 right-1 min-w-4 rounded-full bg-exito px-1 text-center text-[11px] leading-4 font-semibold text-exito-foreground">
              {sinLeer}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" collisionPadding={12} className="w-80 gap-0 p-0">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <span className="font-titulo text-sm font-semibold text-primary">Notificaciones</span>
          {sinLeer > 0 && (
            <Button
              variant="link"
              size="sm"
              className="h-auto px-0 text-xs"
              onClick={() =>
                iniciar(async () => {
                  await marcarLeidas()
                  router.refresh()
                })
              }
            >
              Marcar todas como leídas
            </Button>
          )}
        </div>
        <ul className="max-h-96 overflow-y-auto">
          {notificaciones.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">No tienes notificaciones.</li>}
          {notificaciones.map((n) => (
            <li key={n.id} className={cn('border-b border-border last:border-0', !n.leida_at && 'bg-exito-suave/40')}>
              <Link href={n.enlace ?? '/'} onClick={() => setAbierta(false)} className="block px-3 py-2.5 hover:bg-accent">
                <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                  {!n.leida_at && <span aria-label="Sin leer" className="size-1.5 shrink-0 rounded-full bg-exito-vivo" />}
                  {n.titulo}
                </p>
                {n.cuerpo && <p className="truncate text-xs text-muted-foreground">{n.cuerpo}</p>}
                <p className="mt-0.5 text-xs text-muted-foreground">{relativo(n.created_at)}</p>
              </Link>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
