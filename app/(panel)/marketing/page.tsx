import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { exigirUsuario } from '@/lib/auth'
import { crearClienteServidor } from '@/lib/supabase/server'
import { INTENCIONES, TIPOS_LEAD, etiqueta, type TipoLead } from '@/lib/catalogos'
import { ahoraMs, fecha, fechaCorta, telefono } from '@/lib/formato'
import { EncabezadoPagina, Insignia, Tarjeta, Vacio, cx } from '@/components/legado'
import { BotonAccion } from '@/components/formulario'
import { enviarNovedadesGenerales } from '../leads/acciones'

export const metadata: Metadata = { title: 'Marketing' }

type Intencion = keyof typeof INTENCIONES

type Cliente = {
  persona_id: string
  nombre: string
  telefono: string
  intencion: Intencion | null
  no_contactar: boolean
  lead_id: string
  tipo: TipoLead
  consentimiento_marketing: boolean
  asesor_nombre: string | null
  ultimas_novedades_at: string | null
  cliente_desde: string | null
}

type LeadNoResponde = {
  id: string
  nombre: string
  telefono: string
  tipo: TipoLead
  asesor_nombre: string | null
  proxima_accion_at: string
}

type Filtros = { intencion: string; marketing: string; bajas: string }

const ROL_CLIENTE: Record<TipoLead, string> = { interesado: 'Comprador', propietario: 'Propietario' }

const valor = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '')

function enlace(f: Filtros, cambios: Partial<Filtros>) {
  const q = new URLSearchParams(Object.entries({ ...f, ...cambios }).filter(([, v]) => v))
  const s = q.toString()
  return s ? `/marketing?${s}` : '/marketing'
}

function Chip({ href, activo, children }: { href: string; activo: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={cx(
        'inline-flex h-8 items-center gap-1 rounded-full border px-3 text-sm whitespace-nowrap',
        activo ? 'border-marino-800 bg-marino-800 text-white' : 'border-borde bg-white text-tinta hover:border-marino-200',
      )}
    >
      {children}
    </Link>
  )
}

// HU-33: clientes en la lista de marketing según su intención, y novedades para leads sin respuesta
export default async function PaginaMarketing({ searchParams }: PageProps<'/marketing'>) {
  const usuario = await exigirUsuario()
  const sp = await searchParams
  const f: Filtros = {
    intencion: ['invertir', 'comprar_otro', 'vender', 'sin'].includes(valor(sp.intencion)) ? valor(sp.intencion) : '',
    marketing: valor(sp.marketing) === 'con' ? 'con' : '',
    bajas: valor(sp.bajas) === '1' ? '1' : '',
  }
  const supabase = await crearClienteServidor()
  const [{ data: clientesData, error }, { data: pendientesData }, { data: param }] = await Promise.all([
    supabase
      .from('v_clientes_marketing')
      .select(
        'persona_id, nombre, telefono, intencion, no_contactar, lead_id, tipo, consentimiento_marketing, asesor_nombre, ultimas_novedades_at, cliente_desde',
      )
      .order('nombre')
      .limit(1000),
    supabase
      .from('v_bandeja')
      .select('id, nombre, telefono, tipo, asesor_nombre, proxima_accion_at')
      .eq('vigente', true)
      .eq('estado', 'no_responde')
      .eq('proxima_accion', 'Enviar novedades')
      .lte('proxima_accion_at', new Date(ahoraMs()).toISOString())
      .order('proxima_accion_at'),
    supabase.from('parametros').select('valor').eq('clave', 'novedades_no_responde_dias').maybeSingle(),
  ])
  const todos = (clientesData ?? []) as Cliente[]
  const pendientes = (pendientesData ?? []) as LeadNoResponde[]
  const { data: novedadesPrevias } = pendientes.length
    ? await supabase
        .from('leads')
        .select('id, ultimas_novedades_at')
        .in(
          'id',
          pendientes.map((l) => l.id),
        )
    : { data: null }

  // Los conteos por intención se calculan sobre la base filtrada por consentimiento y bajas
  const base = todos.filter((c) => (f.bajas || !c.no_contactar) && (!f.marketing || c.consentimiento_marketing))
  const porIntencion = (i: string) => base.filter((c) => (i === 'sin' ? !c.intencion : c.intencion === i)).length
  const clientes = base.filter((c) => !f.intencion || (f.intencion === 'sin' ? !c.intencion : c.intencion === f.intencion))
  const enBaja = todos.filter((c) => c.no_contactar).length
  const reciben = clientes.filter((c) => c.consentimiento_marketing && !c.no_contactar).length

  return (
    <>
      <EncabezadoPagina
        titulo="Marketing"
        descripcion="Clientes que compraron o vendieron con DepaHost, según su intención. Respeta las bajas y el consentimiento de marketing (Ley 29733)."
      />

      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        <Chip href={enlace(f, { intencion: '' })} activo={!f.intencion}>
          Todas <span className="opacity-70">{base.length}</span>
        </Chip>
        {(Object.entries(INTENCIONES) as [Intencion, string][]).map(([k, v]) => (
          <Chip key={k} href={enlace(f, { intencion: k })} activo={f.intencion === k}>
            {v} <span className="opacity-70">{porIntencion(k)}</span>
          </Chip>
        ))}
        <Chip href={enlace(f, { intencion: 'sin' })} activo={f.intencion === 'sin'}>
          Sin intención <span className="opacity-70">{porIntencion('sin')}</span>
        </Chip>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <Chip href={enlace(f, { marketing: f.marketing ? '' : 'con' })} activo={!!f.marketing}>
          {f.marketing ? '✓ ' : ''}Solo con consentimiento
        </Chip>
        <Chip href={enlace(f, { bajas: f.bajas ? '' : '1' })} activo={!!f.bajas}>
          {f.bajas ? '✓ ' : ''}Mostrar bajas ({enBaja})
        </Chip>
        <span className="text-suave">
          {clientes.length} {clientes.length === 1 ? 'cliente' : 'clientes'} · {reciben} pueden recibir novedades
        </span>
      </div>

      {error && <Vacio>No se pudieron cargar los clientes: {error.message}</Vacio>}
      {!error && clientes.length === 0 && (
        <Vacio>{todos.length === 0 ? 'Aún no hay clientes.' : 'No hay clientes con estos filtros.'}</Vacio>
      )}

      <ul className="space-y-2">
        {clientes.map((c) => {
          const puede = c.consentimiento_marketing && !c.no_contactar
          return (
            <li
              key={c.persona_id}
              className={cx(
                'grid gap-x-3 gap-y-2 rounded-xl border bg-white px-4 py-3 shadow-tarjeta md:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1.2fr)_auto] md:items-center',
                c.no_contactar ? 'border-red-200 opacity-75' : 'border-borde',
              )}
            >
              <div className="min-w-0">
                <Link href={`/leads/${c.lead_id}?tab=cierre`} className="block truncate font-medium text-tinta hover:underline">
                  {c.nombre}
                </Link>
                <p className="text-xs text-suave">
                  {telefono(c.telefono)} · {ROL_CLIENTE[c.tipo] ?? TIPOS_LEAD[c.tipo]}
                  {c.cliente_desde && ` desde el ${fecha(c.cliente_desde)}`}
                </p>
                {usuario.esAdmin && <p className="text-xs text-suave">{c.asesor_nombre ?? 'Sin asesor'}</p>}
              </div>
              <div className="flex flex-wrap gap-1">
                {c.intencion ? (
                  <Insignia color="marino">{etiqueta(INTENCIONES, c.intencion)}</Insignia>
                ) : (
                  <Insignia color="gris">Sin intención</Insignia>
                )}
                {c.consentimiento_marketing ? (
                  <Insignia color="verde">Acepta marketing</Insignia>
                ) : (
                  <Insignia color="gris">Sin consentimiento</Insignia>
                )}
                {c.no_contactar && <Insignia color="rojo">Baja</Insignia>}
              </div>
              <div className="text-xs text-suave">
                Últimas novedades
                <span className="block text-sm text-tinta">{c.ultimas_novedades_at ? fecha(c.ultimas_novedades_at) : 'Nunca'}</span>
              </div>
              <div className="md:justify-self-end">
                {puede ? (
                  <BotonAccion accion={enviarNovedadesGenerales.bind(null, c.lead_id)} variante="whatsapp">
                    Enviar novedades
                  </BotonAccion>
                ) : (
                  <span className="text-xs text-suave">{c.no_contactar ? 'En Baja: no recibe mensajes' : 'No aceptó marketing'}</span>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      <Tarjeta titulo={`Leads sin respuesta con novedades pendientes (${pendientes.length})`} className="mt-6" id="no-responde">
        <p className="mb-3 text-sm text-suave">
          Leads en &quot;No responde&quot; que aceptaron marketing. Reciben novedades cada {String(param?.valor ?? 30)} días.
        </p>
        {pendientes.length === 0 ? (
          <Vacio>No hay leads sin respuesta con novedades pendientes.</Vacio>
        ) : (
          <ul className="divide-y divide-borde-suave">
            {pendientes.map((l) => {
              const ultimas = novedadesPrevias?.find((x) => x.id === l.id)?.ultimas_novedades_at as string | null | undefined
              return (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <Link href={`/leads/${l.id}`} className="font-medium text-tinta hover:underline">
                      {l.nombre}
                    </Link>
                    <p className="text-xs text-suave">
                      {TIPOS_LEAD[l.tipo]} · {telefono(l.telefono)} · Tocan desde el {fechaCorta(l.proxima_accion_at)} ·{' '}
                      {ultimas ? `últimas el ${fecha(ultimas)}` : 'nunca recibió novedades'}
                      {usuario.esAdmin && ` · ${l.asesor_nombre ?? 'Sin asesor'}`}
                    </p>
                  </div>
                  <BotonAccion accion={enviarNovedadesGenerales.bind(null, l.id)} variante="whatsapp">
                    Enviar novedades
                  </BotonAccion>
                </li>
              )
            })}
          </ul>
        )}
      </Tarjeta>
    </>
  )
}
