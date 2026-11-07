'use client'

import { createContext, useActionState, useContext, useEffect, useRef, useState, useTransition, type ReactNode } from 'react'
import { useFormStatus } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Aviso, Boton, claseBoton, cx } from '@/components/ui'

import type { Resultado } from '@/lib/resultado'
export type { Resultado }
type Accion = (previo: Resultado | null, datos: FormData) => Promise<Resultado>

const ContextoDialogo = createContext<{ cerrar: () => void } | null>(null)

// Formulario conectado a una Server Action: muestra el error o el mensaje de éxito y, dentro de un
// diálogo, lo cierra al terminar bien.
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
  const [estado, accionForm] = useActionState(accion, null)
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
      {estado?.ok && estado.mensaje && !dialogo && <Aviso tipo="exito">{estado.mensaje}</Aviso>}
    </form>
  )
}

export function BotonEnviar({
  children,
  variante = 'primario',
  tamano = 'md',
  className,
  name,
  value,
}: {
  children: ReactNode
  variante?: 'primario' | 'secundario' | 'peligro' | 'whatsapp' | 'fantasma'
  tamano?: 'sm' | 'md'
  className?: string
  name?: string
  value?: string
}) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" name={name} value={value} disabled={pending} className={cx(claseBoton(variante, tamano), className)}>
      {pending ? 'Guardando…' : children}
    </button>
  )
}

// Diálogo modal nativo. Los formularios de adentro lo cierran al terminar bien.
export function Dialogo({
  titulo,
  boton,
  children,
  variante = 'secundario',
  tamano = 'sm',
  ancho = 'max-w-lg',
}: {
  titulo: ReactNode
  boton: ReactNode
  children: ReactNode
  variante?: 'primario' | 'secundario' | 'peligro' | 'whatsapp' | 'fantasma'
  tamano?: 'sm' | 'md'
  ancho?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [abierto, setAbierto] = useState(false)
  const [contexto] = useState(() => ({ cerrar: () => ref.current?.close() }))

  return (
    <>
      <Boton
        variante={variante}
        tamano={tamano}
        onClick={() => {
          setAbierto(true)
          ref.current?.showModal()
        }}
      >
        {boton}
      </Boton>
      <dialog
        ref={ref}
        onClose={() => setAbierto(false)}
        className={cx('m-auto w-[calc(100%-2rem)] rounded-xl p-0 shadow-flotante', ancho)}
      >
        <div className="flex items-center justify-between border-b border-borde-suave px-4 py-3">
          <h2 className="text-base font-semibold text-tinta">{titulo}</h2>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            className="rounded p-1 text-suave hover:bg-gray-100"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto p-4">
          {abierto && <ContextoDialogo.Provider value={contexto}>{children}</ContextoDialogo.Provider>}
        </div>
      </dialog>
    </>
  )
}

// Botón que ejecuta una Server Action sin formulario (con confirmación opcional)
export function BotonAccion({
  accion,
  children,
  confirmar,
  variante = 'secundario',
  tamano = 'sm',
  className,
}: {
  accion: () => Promise<Resultado>
  children: ReactNode
  confirmar?: string
  variante?: 'primario' | 'secundario' | 'peligro' | 'whatsapp' | 'fantasma'
  tamano?: 'sm' | 'md'
  className?: string
}) {
  const [pendiente, iniciar] = useTransition()
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)
  const router = useRouter()
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Boton
        variante={variante}
        tamano={tamano}
        className={className}
        disabled={pendiente}
        onClick={() => {
          if (confirmar && !window.confirm(confirmar)) return
          setAviso(null)
          iniciar(async () => {
            const r = await accion()
            if (!r.ok) {
              setAviso({ ok: false, texto: r.error })
              return
            }
            if (r.mensaje) {
              setAviso({ ok: true, texto: r.mensaje })
              window.setTimeout(() => setAviso(null), 6000)
            }
            router.refresh()
          })
        }}
      >
        {pendiente ? 'Procesando…' : children}
      </Boton>
      {aviso && <span className={cx('max-w-xs text-xs', aviso.ok ? 'text-emerald-700' : 'text-red-700')}>{aviso.texto}</span>}
    </span>
  )
}
