'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

type Pestana = { href: string; texto: string; contador?: number }

// Pestañas de navegación. Marca la activa por ruta o, si se indica `param`, por ese parámetro de la URL.
export function Pestanas({ items, param, porDefecto }: { items: Pestana[]; param?: string; porDefecto?: string }) {
  const ruta = usePathname()
  const busqueda = useSearchParams()
  const actual = param ? (busqueda.get(param) ?? porDefecto) : null
  // En el celular la tira se desliza: al abrir la página en una pestaña que no cabe, la deja a la vista
  const tira = useRef<HTMLElement>(null)
  useEffect(() => {
    const nav = tira.current
    const activa = nav?.querySelector('[aria-current="page"]')
    if (!nav || !activa) return
    const n = nav.getBoundingClientRect()
    const a = activa.getBoundingClientRect()
    if (a.left < n.left || a.right > n.right) nav.scrollBy({ left: (a.left + a.right) / 2 - (n.left + n.right) / 2 })
  }, [ruta, actual])
  return (
    <nav ref={tira} aria-label="Secciones" className="mb-6 overflow-x-auto">
      <div className="inline-flex min-w-max gap-1 rounded-xl bg-muted p-1">
        {items.map((p) => {
          const activa = param
            ? new URL(p.href, 'http://x').searchParams.get(param) === actual
            : ruta === p.href || ruta.startsWith(`${p.href}/`)
          return (
            <Link
              key={p.href}
              href={p.href}
              scroll={false}
              data-guia={param ? `tab-${new URL(p.href, 'http://x').searchParams.get(param)}` : undefined}
              aria-current={activa ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3.5 text-sm font-medium whitespace-nowrap transition-colors',
                activa ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-primary',
              )}
            >
              {p.texto}
              {!!p.contador && <Badge variant="ambar">{p.contador}</Badge>}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
