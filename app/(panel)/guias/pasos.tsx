import Link from 'next/link'
import type { ReactNode } from 'react'
import { ArrowRight } from 'lucide-react'
import { Tarjeta } from '@/components/campos'

// Piezas de las guías paso a paso: un bloque numerado por etapa y, dentro, los pasos en orden

export function Etapa({ titulo, cuando, children }: { titulo: string; cuando?: ReactNode; children: ReactNode }) {
  return (
    <Tarjeta titulo={titulo}>
      {cuando && <p className="mb-4 text-sm text-muted-foreground">{cuando}</p>}
      <ol className="space-y-5">{children}</ol>
    </Tarjeta>
  )
}

export function Paso({
  n,
  titulo,
  donde,
  children,
}: {
  n: number
  titulo: string
  // Pantalla donde se hace el paso; con `href` lleva directo a ella
  donde?: { texto: string; href?: string }
  children: ReactNode
}) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden
        className="grid size-7 shrink-0 place-items-center rounded-full bg-primary font-titulo text-sm font-semibold text-primary-foreground"
      >
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="pt-0.5 text-sm font-semibold text-foreground">
          <span className="sr-only">Paso {n}: </span>
          {titulo}
        </h3>
        {donde && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            Dónde:{' '}
            {donde.href ? (
              <Link
                href={donde.href}
                className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
              >
                {donde.texto}
                <ArrowRight aria-hidden className="size-3" />
              </Link>
            ) : (
              <span className="font-medium text-foreground">{donde.texto}</span>
            )}
          </p>
        )}
        <div className="mt-1.5 space-y-1.5 text-sm text-foreground [&_li]:ml-4 [&_li]:list-disc [&_ul]:space-y-1">
          {children}
        </div>
      </div>
    </li>
  )
}

// Nombre de un botón, pestaña o campo tal como se ve en pantalla
export function B({ children }: { children: ReactNode }) {
  return <strong className="font-semibold whitespace-nowrap text-primary">{children}</strong>
}
