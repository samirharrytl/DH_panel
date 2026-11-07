import { exigirUsuario } from '@/lib/auth'
import { crearClienteServidor } from '@/lib/supabase/server'
import { Navegacion, type ItemNav } from '@/components/navegacion'
import { Campana, type Notificacion } from '@/components/campana'
import { VigilanteInactividad } from '@/components/vigilante-inactividad'
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
    { href: '/', texto: 'Hoy', icono: '☀' },
    { href: '/leads', texto: 'Leads', icono: '👥' },
    { href: '/chats', texto: 'Chats', icono: '💬', contador: chatsSinLeer ?? 0 },
    { href: '/agenda', texto: 'Agenda', icono: '📅' },
    { href: '/inmuebles', texto: 'Inmuebles', icono: '🏠' },
    { href: '/difusion', texto: 'Difusión', icono: '📣' },
    { href: '/marketing', texto: 'Marketing', icono: '✉' },
    ...(usuario.esAdmin
      ? [
          { href: '/tablero', texto: 'Tablero', icono: '📊' },
          { href: '/configuracion', texto: 'Configuración', icono: '⚙' },
        ]
      : []),
  ]

  const pie = (
    <div className="px-2">
      <p className="truncate text-sm font-medium text-white">{usuario.nombre}</p>
      <p className="truncate text-xs text-marino-200">{usuario.esAdmin ? 'Administrador y asesor' : 'Asesor'}</p>
      <form action="/auth/salir" method="post" className="mt-2">
        <button type="submit" className="text-xs text-marino-100 hover:text-white hover:underline">
          Cerrar sesión
        </button>
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
      <main className="mx-auto max-w-6xl px-4 py-5 lg:px-8 lg:py-8">{children}</main>
    </div>
  )
}
