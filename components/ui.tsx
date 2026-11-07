import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')
export { cx }

const VARIANTES = {
  primario: 'bg-marino-800 text-white hover:bg-marino-850 active:bg-marino-950 disabled:bg-marino-200',
  secundario: 'border border-marino-800 bg-white text-marino-800 hover:bg-marino-50 active:bg-marino-100',
  fantasma: 'text-marino-800 hover:bg-marino-50',
  peligro: 'border border-red-700 bg-white text-red-700 hover:bg-red-50',
  whatsapp: 'bg-wa-700 text-white hover:bg-wa-800',
} as const
const TAMANOS = { sm: 'h-8 px-3 text-sm', md: 'h-10 px-4 text-sm' } as const
type Variante = keyof typeof VARIANTES

export const claseBoton = (variante: Variante = 'primario', tamano: keyof typeof TAMANOS = 'md') =>
  cx(
    'inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition-colors',
    'disabled:cursor-not-allowed disabled:opacity-60',
    VARIANTES[variante],
    TAMANOS[tamano],
  )

export function Boton({
  variante = 'primario',
  tamano = 'md',
  className,
  ...props
}: ComponentProps<'button'> & { variante?: Variante; tamano?: keyof typeof TAMANOS }) {
  return <button type="button" {...props} className={cx(claseBoton(variante, tamano), className)} />
}

export function EnlaceBoton({
  variante = 'primario',
  tamano = 'md',
  className,
  ...props
}: ComponentProps<typeof Link> & { variante?: Variante; tamano?: keyof typeof TAMANOS }) {
  return <Link {...props} className={cx(claseBoton(variante, tamano), className)} />
}

const COLORES = {
  marino: 'bg-marino-100 text-marino-800',
  azul: 'bg-sky-100 text-sky-800',
  verde: 'bg-emerald-100 text-emerald-800',
  ambar: 'bg-amber-100 text-amber-800',
  rojo: 'bg-red-100 text-red-800',
  gris: 'bg-gray-100 text-gray-600',
} as const
export type ColorInsignia = keyof typeof COLORES

export function Insignia({ color = 'marino', children, className }: { color?: string; children: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        COLORES[(color in COLORES ? color : 'marino') as ColorInsignia],
        className,
      )}
    >
      {children}
    </span>
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
    <section id={id} className={cx('rounded-xl border border-borde bg-white shadow-tarjeta', className)}>
      {(titulo || acciones) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-borde-suave px-4 py-3">
          {titulo && <h2 className="text-base font-semibold text-tinta">{titulo}</h2>}
          {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}

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
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {volver && (
          <Link href={volver.href} className="mb-1 inline-block text-sm text-marino-700 hover:underline">
            ← {volver.texto}
          </Link>
        )}
        <h1 className="text-2xl font-semibold text-tinta">{titulo}</h1>
        {descripcion && <p className="mt-1 text-sm text-suave">{descripcion}</p>}
      </div>
      {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
    </div>
  )
}

const claseControl =
  'w-full rounded-lg border border-tenue bg-white px-3 text-sm text-tinta placeholder:text-tenue focus:border-marino-800 focus:outline-none focus:ring-1 focus:ring-marino-800 disabled:bg-gray-50'

export function Entrada({ className, ...props }: ComponentProps<'input'>) {
  return <input {...props} className={cx(claseControl, 'h-10', className)} />
}

export function Seleccion({ className, ...props }: ComponentProps<'select'>) {
  return <select {...props} className={cx(claseControl, 'h-10', className)} />
}

export function AreaTexto({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea rows={3} {...props} className={cx(claseControl, 'py-2', className)} />
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
    <label className={cx('block', className)}>
      <span className="mb-1 flex items-center gap-2 text-sm font-medium text-tinta">
        {etiqueta}
        {falta && <Insignia color="ambar">Falta</Insignia>}
      </span>
      {children}
      {ayuda && <span className="mt-1 block text-xs text-suave">{ayuda}</span>}
    </label>
  )
}

export function Casilla({ etiqueta, ...props }: ComponentProps<'input'> & { etiqueta: ReactNode }) {
  return (
    <label className="flex items-start gap-2 text-sm text-tinta">
      <input type="checkbox" {...props} className="mt-0.5 size-4 rounded border-tenue accent-marino-800" />
      <span>{etiqueta}</span>
    </label>
  )
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
      <dt className="text-xs text-suave">{etiqueta}</dt>
      <dd className="mt-0.5 text-sm text-tinta">{children}</dd>
    </div>
  )
}

export function Vacio({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-borde px-4 py-6 text-center text-sm text-suave">{children}</p>
}

const AVISOS = {
  info: 'border-marino-200 bg-marino-50 text-marino-800',
  alerta: 'border-amber-300 bg-amber-50 text-amber-900',
  error: 'border-red-300 bg-red-50 text-red-800',
  exito: 'border-emerald-300 bg-emerald-50 text-emerald-800',
} as const

export function Aviso({ tipo = 'info', children, className }: { tipo?: keyof typeof AVISOS; children: ReactNode; className?: string }) {
  return <div className={cx('rounded-lg border px-3 py-2 text-sm', AVISOS[tipo], className)}>{children}</div>
}

export function Tabla({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-borde bg-white shadow-tarjeta">
      <table className="w-full min-w-[640px] text-left text-sm">{children}</table>
    </div>
  )
}

export const claseTh = 'border-b border-borde-suave px-3 py-2 text-xs font-medium uppercase tracking-wide text-suave'
export const claseTd = 'border-b border-borde-suave px-3 py-2 align-top'
