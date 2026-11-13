'use client'

import { createContext, useActionState, useContext, useEffect, useRef, useState, useTransition, type ReactNode } from 'react'
import { useFormStatus } from 'react-dom'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Aviso } from '@/components/campos'
import { Button } from '@/components/ui/button'
import { PistaGuia } from '@/components/guia/pista'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

import type { Resultado } from '@/lib/resultado'
export type { Resultado }
type Accion = (previo: Resultado | null, datos: FormData) => Promise<Resultado>
export type Variante = 'default' | 'exito' | 'outline' | 'ghost' | 'peligro' | 'whatsapp'
type Tamano = 'sm' | 'default'

const ContextoDialogo = createContext<{ cerrar: () => void } | null>(null)

// Formulario conectado a una Server Action: muestra el error dentro del formulario y el éxito en un
// aviso emergente; dentro de un diálogo, lo cierra al terminar bien.
export function Formulario({
  accion,
  children,
  className,
  reiniciar = false,
  alTerminar,
}: {
  accion: Accion
  children: ReactNode
  className?: string
  reiniciar?: boolean
  alTerminar?: (r: Extract<Resultado, { ok: true }>) => void
}) {
  // El aviso sale al recibir el resultado: si la acción cambia la página y el diálogo se desmonta, el efecto
  // de abajo ya no corre
  const [estado, accionForm] = useActionState(async (previo: Resultado | null, datos: FormData) => {
    const r = await accion(previo, datos)
    if (r.ok && r.mensaje) toast.success(r.mensaje)
    return r
  }, null)
  const dialogo = useContext(ContextoDialogo)
  const ref = useRef<HTMLFormElement>(null)
  const alTerminarRef = useRef(alTerminar)
  useEffect(() => {
    alTerminarRef.current = alTerminar
  })

  useEffect(() => {
    if (estado?.ok) {
      if (reiniciar) ref.current?.reset()
      alTerminarRef.current?.(estado)
      dialogo?.cerrar()
    }
  }, [estado, reiniciar, dialogo])

  return (
    <form ref={ref} action={accionForm} className={className ?? 'space-y-4'}>
      {children}
      {estado && !estado.ok && <Aviso tipo="error">{estado.error}</Aviso>}
    </form>
  )
}

export function BotonEnviar({
  children,
  variante = 'default',
  tamano = 'default',
  className,
  name,
  value,
}: {
  children: ReactNode
  variante?: Variante
  tamano?: Tamano
  className?: string
  name?: string
  value?: string
}) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" name={name} value={value} disabled={pending} variant={variante} size={tamano} className={className}>
      {pending ? 'Guardando…' : children}
    </Button>
  )
}

// Diálogo modal. Los formularios de adentro lo cierran al terminar bien.
export function Dialogo({
  titulo,
  boton,
  children,
  variante = 'outline',
  tamano = 'sm',
  ancho = 'sm:max-w-lg',
}: {
  titulo: ReactNode
  boton: ReactNode
  children: ReactNode
  variante?: Variante
  tamano?: Tamano
  ancho?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [contexto] = useState(() => ({ cerrar: () => setAbierto(false) }))

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        <Button variant={variante} size={tamano}>
          {boton}
        </Button>
      </DialogTrigger>
      <DialogContent className={cn('max-h-[90vh] gap-0 overflow-y-auto p-0', ancho)}>
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="font-titulo text-lg text-primary">{titulo}</DialogTitle>
        </DialogHeader>
        <div className="p-5">
          <PistaGuia titulo={titulo} />
          <ContextoDialogo.Provider value={contexto}>{children}</ContextoDialogo.Provider>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Botón que ejecuta una Server Action sin formulario (con confirmación opcional)
export function BotonAccion({
  accion,
  children,
  confirmar,
  variante = 'outline',
  tamano = 'sm',
  className,
}: {
  accion: () => Promise<Resultado>
  children: ReactNode
  confirmar?: string
  variante?: Variante
  tamano?: Tamano
  className?: string
}) {
  const [pendiente, iniciar] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        variant={variante}
        size={tamano}
        className={className}
        disabled={pendiente}
        onClick={() => {
          if (confirmar && !window.confirm(confirmar)) return
          setError(null)
          iniciar(async () => {
            const r = await accion()
            if (!r.ok) {
              setError(r.error)
              return
            }
            if (r.mensaje) toast.success(r.mensaje)
            router.refresh()
          })
        }}
      >
        {pendiente ? 'Procesando…' : children}
      </Button>
      {error && (
        <span role="alert" className="max-w-xs text-xs text-destructive">
          {error}
        </span>
      )}
    </span>
  )
}
