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
  const porIntencion = sp.vista === 'intenciones'
  const f = {
    q: textoParam(sp.q),
    estado: textoParam(sp.estado) || (porIntencion ? 'todos' : 'activos'),
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
  // Vista por intención: una fila por cada vez que la persona dejó sus datos, aunque se repita
  let ci = supabase
    .from('eventos')
    .select(
      'id, created_at, datos, lead:leads!inner(id, tipo, estado, asesor_id, asesor:perfiles!leads_asesor_id_fkey(nombre)), persona:personas!inner(id, nombre)',
    )
    .in('tipo', ['lead_registrado', 'lead_regreso'])
  if (f.estado === 'activos') ci = ci.not('lead.estado', 'in', CERRADOS)
  else if (f.estado !== 'todos') ci = ci.eq('lead.estado', f.estado)
  if (f.tipo) ci = ci.eq('lead.tipo', f.tipo)
  if (f.canal) ci = ci.eq('datos->>canal', f.canal)
  if (f.asesor === 'sin_asignar') ci = ci.is('lead.asesor_id', null)
  else if (f.asesor) ci = ci.eq('lead.asesor_id', f.asesor)
  if (f.desde) ci = ci.gte('created_at', `${f.desde}T00:00:00-05:00`)
  if (f.hasta) ci = ci.lte('created_at', `${f.hasta}T23:59:59-05:00`)
  if (f.q) {
    const digitos = f.q.replace(/\D/g, '')
    ci = digitos.length >= 3 ? ci.like('datos->>telefono', `%${digitos}%`) : ci.ilike('persona.nombre', `%${f.q.replace(/[,()%*]/g, ' ')}%`)
  }

  const [{ data: leads, error }, { data: intenciones, error: errorIntenciones }, { data: asesores }] = await Promise.all([
    porIntencion
      ? { data: null, error: null }
      : consulta
          .order('proxima_accion_at', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: false })
          .limit(300),
    porIntencion ? ci.order('created_at', { ascending: false }).limit(300) : { data: null, error: null },
    usuario.esAdmin ? supabase.from('perfiles').select('id, nombre').eq('activo', true).order('nombre') : { data: null },
  ])

  const ahora = ahoraMs()
  const finHoy = new Date(`${hoyLima()}T23:59:59-05:00`).getTime()
  const hayFiltros = Object.entries(f).some(([k, v]) => v && !(k === 'estado' && v === (porIntencion ? 'todos' : 'activos')))

  return (
    <>
      <EncabezadoPagina
        titulo="Leads"
        descripcion={
          porIntencion
            ? 'Cada vez que un cliente dejó sus datos, aunque se repita. Toca una para ver su historial completo.'
            : usuario.esAdmin
              ? 'Todos los leads, ordenados por próxima acción.'
              : 'Tus leads, ordenados por próxima acción.'
        }
        acciones={
          <Button asChild data-guia="leads-registrar">
            <Link href="/leads/nuevo">
              <Plus aria-hidden />
              Registrar lead
            </Link>
          </Button>
        }
      />

      <nav className="mb-3 inline-flex rounded-xl border border-border bg-card p-1 text-sm" aria-label="Vista">
        {[
          { href: '/leads', texto: 'Por lead', activa: !porIntencion },
          { href: '/leads?vista=intenciones', texto: 'Por intención', activa: porIntencion },
        ].map((v) => (
          <Link
            key={v.href}
            href={v.href}
            aria-current={v.activa ? 'page' : undefined}
            className={cn('rounded-lg px-3 py-1.5', v.activa ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
          >
            {v.texto}
          </Link>
        ))}
      </nav>

      <form
        data-guia="leads-filtros"
        className="mb-4 grid grid-cols-2 gap-2 rounded-2xl border border-border bg-card p-3 sm:grid-cols-3 lg:grid-cols-7"
      >
        {porIntencion && <input type="hidden" name="vista" value="intenciones" />}
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
            <Link href={porIntencion ? '/leads?vista=intenciones' : '/leads'} className={buttonVariants({ variant: 'ghost' })}>
              Limpiar
            </Link>
          )}
        </div>
      </form>

      {error && <Vacio>No se pudieron cargar los leads: {error.message}</Vacio>}
      {errorIntenciones && <Vacio>No se pudieron cargar las intenciones: {errorIntenciones.message}</Vacio>}
      {leads?.length === 0 && <Vacio>No hay leads con estos filtros.</Vacio>}
      {intenciones?.length === 0 && <Vacio>No hay intenciones con estos filtros.</Vacio>}

      {intenciones && intenciones.length > 0 && (
        <ul className="space-y-2">
          {intenciones.map((i) => {
            const lead = i.lead as unknown as { tipo: string; estado: EstadoLead; asesor: { nombre: string } | null }
            const persona = i.persona as unknown as { id: string; nombre: string }
            const d = (i.datos ?? {}) as Record<string, string | undefined>
            return (
              <li key={i.id}>
                <Link
                  href={`/personas/${persona.id}`}
                  className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 rounded-2xl border border-border bg-card px-4 py-3 transition-colors hover:border-primary md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1.6fr)_auto]"
                >
                  <p className="text-sm text-muted-foreground">
                    {fechaCorta(i.created_at)} {hora(i.created_at)}
                  </p>
                  <div className="justify-self-end md:order-last">
                    <Badge variant={colorEstado(lead.estado)}>{ESTADOS_LEAD[lead.estado]}</Badge>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{persona.nombre}</p>
                    <p className="text-xs text-muted-foreground">
                      {telefono(d.telefono)} · {TIPOS_LEAD[lead.tipo as keyof typeof TIPOS_LEAD]}
                    </p>
                  </div>
                  <div className="text-xs text-muted-foreground md:text-sm">
                    {d.canal_detalle ?? etiqueta(CANALES, d.canal ?? '')}
                    <span className="block text-xs">{lead.asesor?.nombre ?? <span className="text-amber-700">Sin asignar</span>}</span>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
      {intenciones && intenciones.length >= 300 && (
        <p className="mt-3 text-center text-xs text-muted-foreground">Mostrando las últimas 300. Usa los filtros.</p>
      )}

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
                    {l.intenciones > 1 && ` · ${l.intenciones} intenciones`}
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
