'use client'

import { useEffect } from 'react'
import { COOKIE_ACTIVIDAD, COOKIE_TTL } from '@/lib/sesion'

const leerCookie = (nombre: string) =>
  Number(document.cookie.split('; ').find((c) => c.startsWith(`${nombre}=`))?.split('=')[1] ?? 0)
const escribirCookie = (nombre: string, valor: string | number) => {
  document.cookie = `${nombre}=${valor}; path=/; samesite=lax`
}

// HU-01: cierra la sesión tras N minutos sin actividad. La última actividad se comparte entre pestañas
// por cookie, y el proxy hace la misma revisión del lado del servidor.
export function VigilanteInactividad({ minutos }: { minutos: number }) {
  useEffect(() => {
    if (!minutos || minutos <= 0) return
    escribirCookie(COOKIE_TTL, minutos)
    escribirCookie(COOKIE_ACTIVIDAD, Date.now())
    let ultimaEscritura = Date.now()
    const registrar = () => {
      if (Date.now() - ultimaEscritura > 15_000) {
        ultimaEscritura = Date.now()
        escribirCookie(COOKIE_ACTIVIDAD, ultimaEscritura)
      }
    }
    const eventos = ['pointerdown', 'keydown', 'scroll', 'touchstart', 'mousemove'] as const
    eventos.forEach((e) => window.addEventListener(e, registrar, { passive: true }))
    const intervalo = window.setInterval(() => {
      const ultima = leerCookie(COOKIE_ACTIVIDAD)
      if (ultima && Date.now() - ultima > minutos * 60_000) {
        window.location.replace(new URL('/auth/salir?motivo=inactividad', window.location.origin))
      }
    }, 20_000)
    return () => {
      eventos.forEach((e) => window.removeEventListener(e, registrar))
      window.clearInterval(intervalo)
    }
  }, [minutos])
  return null
}
