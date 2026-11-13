'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { BookOpen } from 'lucide-react'
import { useGuia } from './estado'
import { GUIAS, coincideRuta } from './guias'

// Dentro de un diálogo: qué llenar según el paso de la guía en curso. El panel de la guía queda detrás
// del diálogo, así que la indicación se muestra aquí.
export function PistaGuia({ titulo }: { titulo: ReactNode }) {
  const estado = useGuia()
  const pathname = usePathname()
  const paso = estado ? GUIAS[estado.guia].pasos[estado.paso] : null
  if (!estado || !paso?.dialogo || typeof titulo !== 'string') return null
  if (!titulo.startsWith(paso.dialogo.titulo) || !coincideRuta(paso.donde.ruta, pathname)) return null
  return (
    <div className="mb-4 flex gap-2 rounded-lg border border-exito-suave bg-exito-suave/60 px-3 py-2.5 text-sm text-exito-texto">
      <BookOpen aria-hidden className="mt-0.5 size-4 shrink-0" />
      <p>
        <strong className="font-semibold">Guía · paso {estado.paso + 1}.</strong> {paso.dialogo.texto}
      </p>
    </div>
  )
}
