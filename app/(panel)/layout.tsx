import { exigirUsuario } from '@/lib/auth'
import { crearClienteServidor } from '@/lib/supabase/server'
import { Navegacion, type ItemNav } from '@/components/navegacion'
import { Campana, type Notificacion } from '@/components/campana'
import { Suspense } from 'react'
import { Recorrido, ReservaGuia } from '@/components/guia/recorrido'
import { VigilanteInactividad } from '@/components/vigilante-inactividad'
import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { marcarNotificacionesLeidas } from './acciones-comunes'

export default async function LayoutPanel({ children }: LayoutProps<'/'>) {
  const usuario = await exigirUsuario()
  const supabase = await crearClienteServidor()
  const [{ data: param }, { data: notificaciones }, { count: chatsSinLeer }] = await Promise.all([
    supabase.from('parametros').select('valor').eq('clave', 'sesion_inactividad_min').maybeSingle(),
    supabase
      .from('notificaciones')
      .select('id, titulo, cuerpo, enlace, leida_at, created_at')
      .eq('usuario_id', usuario.id)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase.from('mensajes').select('id', { count: 'exact', head: true }).eq('direccion', 'entrante').is('leido_at', null),
  ])

  const items: ItemNav[] = [
    { href: '/', texto: 'Hoy', icono: 'hoy' },
    { href: '/leads', texto: 'Leads', icono: 'leads' },
    { href: '/chats', texto: 'Chats', icono: 'chats', contador: chatsSinLeer ?? 0 },
    { href: '/agenda', texto: 'Agenda', icono: 'agenda' },
    { href: '/inmuebles', texto: 'Inmuebles', icono: 'inmuebles' },
    { href: '/difusion', texto: 'Difusión', icono: 'difusion' },
    { href: '/marketing', texto: 'Marketing', icono: 'marketing' },
    { href: '/guias', texto: 'Guías', icono: 'guias' },
    ...(usuario.esAdmin
      ? ([
          { href: '/tablero', texto: 'Tablero', icono: 'tablero' },
          { href: '/configuracion', texto: 'Configuración', icono: 'configuracion' },
        ] satisfies ItemNav[])
      : []),
  ]

  const pie = (
    <div className="flex items-center gap-3 px-3">
      <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary font-titulo text-sm font-semibold text-primary">
        {usuario.nombre.trim().charAt(0).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{usuario.nombre}</p>
        <p className="truncate text-xs text-muted-foreground">{usuario.esAdmin ? 'Administrador y asesor' : 'Asesor'}</p>
      </div>
      <form action="/auth/salir" method="post">
        <Button type="submit" variant="ghost" size="icon" aria-label="Cerrar sesión" title="Cerrar sesión">
          <LogOut aria-hidden className="size-[18px] text-muted-foreground" />
        </Button>
      </form>
    </div>
  )

  return (
    <div className="min-h-screen lg:pl-60">
      <Navegacion
        items={items}
        pie={pie}
        campana={
          <Campana
            usuarioId={usuario.id}
            notificaciones={(notificaciones ?? []) as Notificacion[]}
            marcarLeidas={marcarNotificacionesLeidas}
          />
        }
      />
      <VigilanteInactividad minutos={Number(param?.valor ?? 30)} />
      {/* Guía interactiva en curso (se inicia desde /guias). Va antes del contenido: en el celular
          ocupa su sitio bajo el encabezado en vez de flotar encima de la página */}
      <Suspense>
        <Recorrido />
      </Suspense>
      <main className="mx-auto max-w-6xl px-4 py-6 lg:px-10 lg:py-10">{children}</main>
      <ReservaGuia />
    </div>
  )
}
