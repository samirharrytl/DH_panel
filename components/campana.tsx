'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { crearClienteNavegador } from '@/lib/supabase/navegador'
import { relativo } from '@/lib/formato'
import { cx } from '@/components/ui'

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
  const ref = useRef<HTMLDivElement>(null)
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

  useEffect(() => {
    if (!abierta) return
    const cerrar = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setAbierta(false)
    }
    document.addEventListener('mousedown', cerrar)
    return () => document.removeEventListener('mousedown', cerrar)
  }, [abierta])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAbierta((v) => !v)}
        className="relative rounded-full p-2 text-white hover:bg-white/10"
        aria-label={`Notificaciones${sinLeer ? `: ${sinLeer} sin leer` : ''}`}
      >
        <span aria-hidden>🔔</span>
        {sinLeer > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-5 rounded-full bg-amber-400 px-1 text-center text-xs font-semibold text-marino-950">
            {sinLeer}
          </span>
        )}
      </button>
      {abierta && (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-borde bg-white text-left shadow-flotante lg:right-auto lg:left-0">
          <div className="flex items-center justify-between border-b border-borde-suave px-3 py-2">
            <span className="text-sm font-semibold text-tinta">Notificaciones</span>
            {sinLeer > 0 && (
              <button
                type="button"
                className="text-xs text-marino-700 hover:underline"
                onClick={() =>
                  iniciar(async () => {
                    await marcarLeidas()
                    router.refresh()
                  })
                }
              >
                Marcar todas como leídas
              </button>
            )}
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {notificaciones.length === 0 && <li className="px-3 py-6 text-center text-sm text-suave">Sin notificaciones</li>}
            {notificaciones.map((n) => (
              <li key={n.id} className={cx('border-b border-borde-suave last:border-0', !n.leida_at && 'bg-marino-50')}>
                <Link href={n.enlace ?? '/'} onClick={() => setAbierta(false)} className="block px-3 py-2 hover:bg-gray-50">
                  <p className="text-sm font-medium text-tinta">{n.titulo}</p>
                  {n.cuerpo && <p className="truncate text-xs text-suave">{n.cuerpo}</p>}
                  <p className="mt-0.5 text-xs text-tenue">{relativo(n.created_at)}</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
