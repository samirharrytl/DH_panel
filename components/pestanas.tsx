'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { cx } from '@/components/ui'

type Pestana = { href: string; texto: string; contador?: number }

// Pestañas de navegación. Marca la activa por ruta o, si se indica `param`, por ese parámetro de la URL.
export function Pestanas({ items, param, porDefecto }: { items: Pestana[]; param?: string; porDefecto?: string }) {
  const ruta = usePathname()
  const busqueda = useSearchParams()
  const actual = param ? (busqueda.get(param) ?? porDefecto) : null
  return (
    <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-borde">
      {items.map((p) => {
        const activa = param
          ? new URL(p.href, 'http://x').searchParams.get(param) === actual
          : ruta === p.href || ruta.startsWith(`${p.href}/`)
        return (
          <Link
            key={p.href}
            href={p.href}
            scroll={false}
            aria-current={activa ? 'page' : undefined}
            className={cx(
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap',
              activa ? 'border-marino-800 text-marino-800' : 'border-transparent text-suave hover:text-marino-800',
            )}
          >
            {p.texto}
            {!!p.contador && <span className="ml-1 rounded-full bg-amber-100 px-1.5 text-xs text-amber-800">{p.contador}</span>}
          </Link>
        )
      })}
    </nav>
  )
}
