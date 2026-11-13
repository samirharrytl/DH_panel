import type { Metadata } from 'next'
import Link from 'next/link'
import { exigirUsuario } from '@/lib/auth'
import { crearClienteServidor } from '@/lib/supabase/server'
import { CANALES, ESTADOS_LEAD, TIPOS_LEAD, colorEstado, etiqueta, type EstadoLead } from '@/lib/catalogos'
import { ahoraMs, fechaCorta, hora, hoyLima, telefono } from '@/lib/formato'
import { EncabezadoPagina, Seleccion, Vacio } from '@/components/campos'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Plus } from 'lucide-react'

export const metadata: Metadata = { title: 'Leads' }

const CERRADOS = '(cliente,descartado,baja)'

function textoParam(v: string | string[] | undefined) {
  return typeof v === 'string' && v.trim() ? v.trim() : ''
}

export default async function PaginaLeads({ searchParams }: PageProps<'/leads'>) {
  const usuario = await exigirUsuario()
  const sp = await searchParams
  const f = {
    q: textoParam(sp.q),
    estado: textoParam(sp.estado) || 'activos',
    tipo: textoParam(sp.tipo),
    canal: textoParam(sp.canal),
    asesor: textoParam(sp.asesor),
    desde: textoParam(sp.desde),
    hasta: textoParam(sp.hasta),
  }
  const supabase = await crearClienteServidor()
  await supabase.rpc('procesar_cadencias')

  let consulta = supabase.from('v_bandeja').select('*').eq('vigente', true)
  if (f.estado === 'activos') consulta = consulta.not('estado', 'in', CERRADOS)
  else if (f.estado !== 'todos') consulta = consulta.eq('estado', f.estado)
  if (f.tipo) consulta = consulta.eq('tipo', f.tipo)
  if (f.canal) consulta = consulta.eq('canal', f.canal)
  if (f.asesor === 'sin_asignar') consulta = consulta.is('asesor_id', null)
  else if (f.asesor) consulta = consulta.eq('asesor_id', f.asesor)
  if (f.desde) consulta = consulta.gte('created_at', `${f.desde}T00:00:00-05:00`)
  if (f.hasta) consulta = consulta.lte('created_at', `${f.hasta}T23:59:59-05:00`)
  if (f.q) {
    const limpio = f.q.replace(/[,()%*]/g, ' ')
    const digitos = limpio.replace(/\D/g, '')
    consulta = consulta.or(`nombre.ilike.%${limpio}%${digitos.length >= 3 ? `,telefono.like.%${digitos}%` : ''}`)
  }
  const [{ data: leads, error }, { data: asesores }] = await Promise.all([
    consulta
      .order('proxima_accion_at', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(300),
    usuario.esAdmin ? supabase.from('perfiles').select('id, nombre').eq('activo', true).order('nombre') : { data: null },
  ])

  const ahora = ahoraMs()
  const finHoy = new Date(`${hoyLima()}T23:59:59-05:00`).getTime()
  const hayFiltros = Object.entries(f).some(([k, v]) => v && !(k === 'estado' && v === 'activos'))

  return (
    <>
      <EncabezadoPagina
        titulo="Leads"
        descripcion={usuario.esAdmin ? 'Todos los leads, ordenados por próxima acción.' : 'Tus leads, ordenados por próxima acción.'}
        acciones={
          <Button asChild data-guia="leads-registrar">
            <Link href="/leads/nuevo">
              <Plus aria-hidden />
              Registrar lead
            </Link>
          </Button>
        }
      />

      <form
        data-guia="leads-filtros"
        className="mb-4 grid grid-cols-2 gap-2 rounded-2xl border border-border bg-card p-3 sm:grid-cols-3 lg:grid-cols-7"
      >
        <Input name="q" defaultValue={f.q} placeholder="Nombre o teléfono" className="col-span-2 sm:col-span-3 lg:col-span-2" />
        <Seleccion name="estado" defaultValue={f.estado} aria-label="Estado">
          <option value="activos">Activos</option>
          <option value="todos">Todos los estados</option>
          {Object.entries(ESTADOS_LEAD).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Seleccion>
        <Seleccion name="tipo" defaultValue={f.tipo} aria-label="Tipo">
          <option value="">Ambos tipos</option>
          <option value="propietario">Propietarios</option>
          <option value="interesado">Interesados</option>
        </Seleccion>
        <Seleccion name="canal" defaultValue={f.canal} aria-label="Canal">
          <option value="">Todos los canales</option>
          {Object.entries(CANALES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Seleccion>
        {usuario.esAdmin ? (
          <Seleccion name="asesor" defaultValue={f.asesor} aria-label="Asesor">
            <option value="">Todos los asesores</option>
            <option value="sin_asignar">Sin asignar</option>
            {asesores?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre}
              </option>
            ))}
          </Seleccion>
        ) : (
          <span className="hidden lg:block" />
        )}
        <div className="col-span-2 grid grid-cols-2 gap-2 sm:col-span-3 lg:col-span-5">
          <label className="text-xs text-muted-foreground">
            Registrado desde
            <Input type="date" name="desde" defaultValue={f.desde} />
          </label>
          <label className="text-xs text-muted-foreground">
            hasta
            <Input type="date" name="hasta" defaultValue={f.hasta} />
          </label>
        </div>
        <div className="col-span-2 flex items-end gap-2 sm:col-span-3 lg:col-span-2">
          <button type="submit" className={cn(buttonVariants({ variant: 'default' }), 'flex-1')}>
            Filtrar
          </button>
          {hayFiltros && (
            <Link href="/leads" className={buttonVariants({ variant: 'ghost' })}>
              Limpiar
            </Link>
          )}
        </div>
      </form>

      {error && <Vacio>No se pudieron cargar los leads: {error.message}</Vacio>}
      {leads?.length === 0 && <Vacio>No hay leads con estos filtros.</Vacio>}

      <ul data-guia="leads-lista" className="space-y-2">
        {leads?.map((l) => {
          const t = l.proxima_accion_at ? new Date(l.proxima_accion_at).getTime() : null
          const vencida = t !== null && t < ahora
          const hoy = t !== null && !vencida && t <= finHoy
          return (
            <li key={l.id}>
              <Link
                href={`/leads/${l.id}`}
                className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 rounded-2xl border border-border bg-card px-4 py-3 transition-colors hover:border-primary md:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.6fr)]"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{l.nombre}</p>
                  <p className="text-xs text-muted-foreground">
                    {telefono(l.telefono)} · {TIPOS_LEAD[l.tipo as keyof typeof TIPOS_LEAD]}
                  </p>
                </div>
                <div className="justify-self-end md:justify-self-start">
                  <Badge variant={colorEstado(l.estado as EstadoLead)}>{ESTADOS_LEAD[l.estado as EstadoLead]}</Badge>
                </div>
                <div className="text-xs text-muted-foreground md:text-sm">
                  {etiqueta(CANALES, l.canal)}
                  <span className="block text-xs">{l.asesor_nombre ?? <span className="text-amber-700">Sin asignar</span>}</span>
                </div>
                <div className="text-right text-sm md:text-left">
                  {l.proxima_accion ? (
                    <>
                      <p className={cn('font-medium', vencida ? 'text-red-700' : hoy ? 'text-amber-700' : 'text-foreground')}>
                        {l.proxima_accion}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {vencida ? 'Vencida · ' : hoy ? 'Hoy · ' : ''}
                        {fechaCorta(l.proxima_accion_at)} {hora(l.proxima_accion_at)}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">Sin próxima acción</p>
                  )}
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
      {leads && leads.length >= 300 && <p className="mt-3 text-center text-xs text-muted-foreground">Mostrando los primeros 300. Usa los filtros.</p>}
    </>
  )
}
