'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { borrarSuscripcionPush, guardarSuscripcionPush } from '@/app/(panel)/acciones-comunes'

// Notificaciones push en este dispositivo (celular o computadora). En iPhone solo funcionan con el panel
// instalado en la pantalla de inicio (iOS 16.4+).
export type EstadoAvisos = 'cargando' | 'no-soportado' | 'ios-instalar' | 'denegado' | 'inactivo' | 'activo'

const CLAVE = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

function claveBytes(base64: string) {
  const b = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(b), (c) => c.charCodeAt(0))
}

async function estadoInicial(): Promise<EstadoAvisos> {
  // iPadOS se presenta como Mac; se distingue por la pantalla táctil
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  if (ios && !matchMedia('(display-mode: standalone)').matches) return 'ios-instalar'
  if (!CLAVE) return 'cargando' // sin claves VAPID configuradas no se ofrece nada
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'no-soportado'
  const reg = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
  const sub = await reg.pushManager.getSubscription()
  if (sub && Notification.permission === 'granted') {
    // Se vuelve a guardar en cada carga: el navegador pudo renovarla o este equipo cambió de usuario
    await guardarSuscripcionPush(sub.toJSON())
    return 'activo'
  }
  return Notification.permission === 'denied' ? 'denegado' : 'inactivo'
}

export function useAvisosDispositivo() {
  const [estado, setEstado] = useState<EstadoAvisos>('cargando')
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    estadoInicial().then(setEstado, () => setEstado('no-soportado'))
  }, [])

  async function activar() {
    setOcupado(true)
    try {
      // iOS exige pedir el permiso directo desde el toque, antes de cualquier otra espera
      const permiso = await Notification.requestPermission()
      if (permiso !== 'granted') return setEstado(permiso === 'denied' ? 'denegado' : 'inactivo')
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveBytes(CLAVE!) })
      if (!(await guardarSuscripcionPush(sub.toJSON())).ok) {
        await sub.unsubscribe()
        throw new Error('No se guardó la suscripción')
      }
      setEstado('activo')
      toast.success('Avisos activados en este dispositivo')
    } catch {
      toast.error('No se pudieron activar los avisos en este navegador')
    } finally {
      setOcupado(false)
    }
  }

  async function desactivar() {
    setOcupado(true)
    try {
      const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription()
      if (sub) {
        await borrarSuscripcionPush(sub.endpoint)
        await sub.unsubscribe()
      }
      setEstado('inactivo')
    } finally {
      setOcupado(false)
    }
  }

  return { estado, ocupado, activar, desactivar }
}

export function AvisosDispositivo({ avisos }: { avisos: ReturnType<typeof useAvisosDispositivo> }) {
  const { estado, ocupado, activar, desactivar } = avisos
  if (estado === 'cargando') return null
  return (
    <div className="border-t border-border px-3 py-2.5 text-xs text-muted-foreground">
      {estado === 'ios-instalar' && (
        <p>
          Para recibir avisos en el iPhone, instala el panel: toca <strong>Compartir</strong> y luego{' '}
          <strong>Agregar a inicio</strong>. Ábrelo desde ese ícono y activa los avisos aquí.
        </p>
      )}
      {estado === 'no-soportado' && <p>Este navegador no admite avisos. Prueba con Chrome, Edge, Firefox o Safari.</p>}
      {estado === 'denegado' && <p>Bloqueaste los avisos de este sitio. Permítelos en los ajustes del navegador.</p>}
      {estado === 'inactivo' && (
        <div className="flex flex-col gap-2">
          <p>Recibe avisos de leads y mensajes aunque el panel esté cerrado.</p>
          <Button size="sm" onClick={activar} disabled={ocupado}>
            Activar avisos en este dispositivo
          </Button>
        </div>
      )}
      {estado === 'activo' && (
        <div className="flex items-center justify-between gap-2">
          <p>Avisos activados en este dispositivo.</p>
          <Button variant="link" size="sm" className="h-auto px-0 text-xs" onClick={desactivar} disabled={ocupado}>
            Desactivar
          </Button>
        </div>
      )}
    </div>
  )
}
