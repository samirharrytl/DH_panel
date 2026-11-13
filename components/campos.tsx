import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'
import { ChevronLeft, CircleAlert, CircleCheck, CircleX, Info, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Table } from '@/components/ui/table'

// Piezas de página y de formulario del panel, sobre los componentes de shadcn/ui

export function EncabezadoPagina({
  titulo,
  descripcion,
  acciones,
  volver,
}: {
  titulo: ReactNode
  descripcion?: ReactNode
  acciones?: ReactNode
  volver?: { href: string; texto: string }
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {volver && (
          <Link
            href={volver.href}
            className="mb-2 inline-flex min-h-8 items-center gap-1 text-sm text-muted-foreground hover:text-primary"
          >
            <ChevronLeft aria-hidden className="size-4" />
            {volver.texto}
          </Link>
        )}
        <h1 className="font-titulo text-[1.75rem] leading-tight font-semibold text-primary">{titulo}</h1>
        {descripcion && <p className="mt-1 text-sm text-muted-foreground">{descripcion}</p>}
      </div>
      {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
    </div>
  )
}

export function Tarjeta({
  titulo,
  acciones,
  children,
  className,
  id,
}: {
  titulo?: ReactNode
  acciones?: ReactNode
  children: ReactNode
  className?: string
  id?: string
}) {
  return (
    <Card id={id} className={cn('gap-0 py-0', className)}>
      {(titulo || acciones) && (
        <CardHeader className="border-b border-border px-5 pt-4 pb-3">
          {titulo && <CardTitle className="self-center">{titulo}</CardTitle>}
          {acciones && <CardAction className="flex flex-wrap items-center gap-2">{acciones}</CardAction>}
        </CardHeader>
      )}
      <CardContent className="p-5">{children}</CardContent>
    </Card>
  )
}

export function Campo({
  etiqueta,
  ayuda,
  children,
  className,
  falta,
}: {
  etiqueta: ReactNode
  ayuda?: ReactNode
  children: ReactNode
  className?: string
  falta?: boolean
}) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1.5 flex items-center gap-2 text-sm font-medium text-foreground">
        {etiqueta}
        {falta && <Badge variant="ambar">Falta</Badge>}
      </span>
      {children}
      {ayuda && <span className="mt-1 block text-xs text-muted-foreground">{ayuda}</span>}
    </label>
  )
}

// Envía `value` (o "on") solo si está marcada, igual que un <input type="checkbox">
export function Casilla({
  etiqueta,
  ...props
}: Omit<ComponentProps<typeof Checkbox>, 'children'> & { etiqueta: ReactNode }) {
  return (
    <label className="flex min-h-8 items-start gap-2.5 text-sm text-foreground">
      <Checkbox {...props} className={cn('mt-0.5', props.className)} />
      <span>{etiqueta}</span>
    </label>
  )
}

const claseControl =
  'h-11 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-base text-foreground md:text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50 sm:h-10'

// Selector nativo: en el celular abre el selector del sistema y envía `name` sin JavaScript
export function Seleccion({ className, ...props }: ComponentProps<'select'>) {
  return <select {...props} className={cn(claseControl, className)} />
}

// Selector Sí / No / sin dato para campos booleanos opcionales
export function SiNo({ name, valor, disabled }: { name: string; valor: boolean | null | undefined; disabled?: boolean }) {
  return (
    <Seleccion name={name} defaultValue={valor === true ? 'si' : valor === false ? 'no' : ''} disabled={disabled}>
      <option value="">Sin dato</option>
      <option value="si">Sí</option>
      <option value="no">No</option>
    </Seleccion>
  )
}

export function Dato({ etiqueta, children, className }: { etiqueta: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="mt-0.5 text-sm text-foreground">{children}</dd>
    </div>
  )
}

export function Vacio({ children, accion }: { children: ReactNode; accion?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-border px-4 py-7 text-center text-sm text-muted-foreground">
      <p>{children}</p>
      {accion && <div className="mt-3 flex justify-center">{accion}</div>}
    </div>
  )
}

const AVISOS = {
  info: { clase: 'border-secondary bg-secondary/50 text-primary', Icono: Info },
  alerta: { clase: 'border-amber-300 bg-amber-50 text-amber-900', Icono: TriangleAlert },
  error: { clase: 'border-red-300 bg-red-50 text-red-800', Icono: CircleAlert },
  exito: { clase: 'border-exito-suave bg-exito-suave/60 text-exito-texto', Icono: CircleCheck },
} as const

export function Aviso({ tipo = 'info', children, className }: { tipo?: keyof typeof AVISOS; children: ReactNode; className?: string }) {
  const { clase, Icono } = AVISOS[tipo]
  return (
    <Alert className={cn('px-3 py-2.5', clase, className)}>
      <Icono aria-hidden />
      <div>{children}</div>
    </Alert>
  )
}

export function Tabla({ children }: { children: ReactNode }) {
  return (
    <Card className="gap-0 py-0">
      <Table className="min-w-[640px]">{children}</Table>
    </Card>
  )
}

// Requisito cumplido o no, con ícono y texto (no solo color)
export function Habilita({ si, children }: { si: boolean | null | undefined; children: ReactNode }) {
  const Icono = si ? CircleCheck : CircleX
  return (
    <span className="inline-flex items-start gap-2">
      <Icono aria-hidden className={cn('mt-0.5 size-4 shrink-0', si ? 'text-exito-vivo' : 'text-muted-foreground')} />
      <span>
        {children}
        <span className="sr-only">{si ? ': sí' : ': no'}</span>
      </span>
    </span>
  )
}
