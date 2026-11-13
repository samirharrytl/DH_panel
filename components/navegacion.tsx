'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, type ReactNode } from 'react'
import {
  BookOpen,
  CalendarDays,
  ChartColumn,
  House,
  Mail,
  Megaphone,
  Menu,
  MessageCircle,
  Settings,
  Sun,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'

// El layout es un componente del servidor: pasa el nombre del ícono, no el componente
const ICONOS = {
  hoy: Sun,
  leads: Users,
  chats: MessageCircle,
  agenda: CalendarDays,
  inmuebles: House,
  difusion: Megaphone,
  marketing: Mail,
  guias: BookOpen,
  tablero: ChartColumn,
  configuracion: Settings,
} satisfies Record<string, LucideIcon>

export type ItemNav = { href: string; texto: string; icono: keyof typeof ICONOS; contador?: number }

function activo(ruta: string, href: string) {
  return href === '/' ? ruta === '/' : ruta === href || ruta.startsWith(`${href}/`)
}

function Logo({ alNavegar }: { alNavegar?: () => void }) {
  return (
    <Link href="/" onClick={alNavegar} className="flex items-center gap-1.5 font-titulo text-lg font-bold text-primary">
      DepaHost
      <span aria-hidden className="size-2 rounded-full bg-exito-vivo" />
    </Link>
  )
}

function Enlaces({ items, ruta, alNavegar }: { items: ItemNav[]; ruta: string; alNavegar?: () => void }) {
  return (
    <ul className="space-y-1">
      {items.map((i) => {
        const Icono = ICONOS[i.icono]
        const esActivo = activo(ruta, i.href)
        return (
          <li key={i.href}>
            <Link
              href={i.href}
              onClick={alNavegar}
              aria-current={esActivo ? 'page' : undefined}
              className={cn(
                'flex min-h-11 items-center gap-3 rounded-[10px] px-3 text-sm transition-colors lg:min-h-10',
                esActivo ? 'bg-primary font-medium text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-primary',
              )}
            >
              <Icono aria-hidden className="size-[18px] shrink-0" />
              <span className="flex-1">{i.texto}</span>
              {!!i.contador && (
                <Badge variant="verde" aria-label={`${i.contador} sin leer`}>
                  {i.contador}
                </Badge>
              )}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

export function Navegacion({ items, pie, campana }: { items: ItemNav[]; pie: ReactNode; campana: ReactNode }) {
  const ruta = usePathname()
  const [abierto, setAbierto] = useState(false)

  return (
    <>
      {/* Escritorio */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-border bg-card px-3 py-5 lg:flex">
        <div className="mb-6 flex items-center justify-between pl-3">
          <Logo />
          {campana}
        </div>
        <nav aria-label="Principal" className="flex-1 overflow-y-auto">
          <Enlaces items={items} ruta={ruta} />
        </nav>
        <div className="border-t border-border pt-4">{pie}</div>
      </aside>

      {/* Celular */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-card px-2 lg:hidden">
        <Sheet open={abierto} onOpenChange={setAbierto}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Abrir menú">
              <Menu aria-hidden className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 gap-0 bg-card px-3 py-5">
            <SheetTitle className="mb-6 pl-3">
              <Logo alNavegar={() => setAbierto(false)} />
            </SheetTitle>
            <nav aria-label="Principal" className="flex-1 overflow-y-auto">
              <Enlaces items={items} ruta={ruta} alNavegar={() => setAbierto(false)} />
            </nav>
            <div className="border-t border-border pt-4">{pie}</div>
          </SheetContent>
        </Sheet>
        <Logo />
        {campana}
      </header>
    </>
  )
}
