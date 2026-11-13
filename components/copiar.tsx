'use client'

import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { Boton } from '@/components/legado'

type Variante = 'primario' | 'secundario' | 'fantasma' | 'peligro' | 'whatsapp'

// Copia un texto al portapapeles y confirma con "Copiado" (enlaces y textos de publicaciones, HU-29)
export function Copiar({
  texto,
  etiqueta = 'Copiar',
  variante = 'secundario',
  tamano = 'sm',
  className,
}: {
  texto: string
  etiqueta?: string
  variante?: Variante
  tamano?: 'sm' | 'md'
  className?: string
}) {
  const [estado, setEstado] = useState<'listo' | 'copiado' | 'error'>('listo')
  const temporizador = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(temporizador.current), [])

  async function copiar(e: MouseEvent<HTMLButtonElement>) {
    const contenedor = e.currentTarget.parentElement ?? document.body
    let ok: boolean
    try {
      await navigator.clipboard.writeText(texto)
      ok = true
    } catch {
      ok = copiarConRespaldo(texto, contenedor)
    }
    setEstado(ok ? 'copiado' : 'error')
    window.clearTimeout(temporizador.current)
    temporizador.current = window.setTimeout(() => setEstado('listo'), 2000)
  }

  return (
    <Boton variante={variante} tamano={tamano} className={className} onClick={copiar} aria-live="polite">
      {estado === 'copiado' ? '✓ Copiado' : estado === 'error' ? 'No se pudo copiar' : etiqueta}
    </Boton>
  )
}

// navigator.clipboard solo existe en contextos seguros (https o localhost). El área temporal va junto
// al botón porque, dentro de un diálogo modal, el resto de la página es inerte y no se puede seleccionar.
function copiarConRespaldo(texto: string, contenedor: HTMLElement) {
  const area = document.createElement('textarea')
  area.value = texto
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.top = '0'
  area.style.opacity = '0'
  contenedor.appendChild(area)
  area.select()
  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    area.remove()
  }
}
