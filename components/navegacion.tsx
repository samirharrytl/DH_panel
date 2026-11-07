'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, type ReactNode } from 'react'
import { cx } from '@/components/ui'

export type ItemNav = { href: string; texto: string; icono: string; contador?: number }

function activo(ruta: string, href: string) {
  return href === '/' ? ruta === '/' : ruta === href || ruta.startsWith(`${href}/`)
}

function Enlaces({ items, ruta, alNavegar }: { items: ItemNav[]; ruta: string; alNavegar?: () => void }) {
  return (
    <ul className="space-y-0.5">
      {items.map((i) => (
        <li key={i.href}>
          <Link
            href={i.href}
            onClick={alNavegar}
            className={cx(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm',
              activo(ruta, i.href) ? 'bg-white/15 font-medium text-white' : 'text-marino-100 hover:bg-white/10',
            )}
          >
            <span aria-hidden className="w-5 text-center">
              {i.icono}
            </span>
            <span className="flex-1">{i.texto}</span>
            {!!i.contador && (
              <span className="rounded-full bg-amber-400 px-1.5 text-xs font-semibold text-marino-950">{i.contador}</span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function Navegacion({ items, pie, campana }: { items: ItemNav[]; pie: ReactNode; campana: ReactNode }) {
  const ruta = usePathname()
  const [abierto, setAbierto] = useState(false)

  return (
    <>
      {/* Escritorio */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col bg-marino-900 px-3 py-4 lg:flex">
        <div className="mb-6 flex items-center justify-between px-2">
          <Link href="/" className="text-lg font-semibold text-white">
            DepaHost
          </Link>
          {campana}
        </div>
        <nav className="flex-1 overflow-y-auto">
          <Enlaces items={items} ruta={ruta} />
        </nav>
        <div className="border-t border-white/10 pt-3">{pie}</div>
      </aside>

      {/* Celular */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between bg-marino-900 px-4 lg:hidden">
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="rounded p-1 text-2xl leading-none text-white"
          aria-label="Abrir menú"
        >
          ☰
        </button>
        <Link href="/" className="font-semibold text-white">
          DepaHost
        </Link>
        {campana}
      </header>
      {abierto && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" className="absolute inset-0 bg-marino-950/50" aria-label="Cerrar menú" onClick={() => setAbierto(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-marino-900 px-3 py-4">
            <nav className="flex-1 overflow-y-auto">
              <Enlaces items={items} ruta={ruta} alNavegar={() => setAbierto(false)} />
            </nav>
            <div className="border-t border-white/10 pt-3">{pie}</div>
          </aside>
        </div>
      )}
    </>
  )
}
