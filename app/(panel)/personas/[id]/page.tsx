import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { exigirUsuario } from '@/lib/auth'
import { crearClienteServidor } from '@/lib/supabase/server'
import { ESTADOS_LEAD, TIPOS_LEAD, colorEstado, type EstadoLead, type TipoLead as Tipo } from '@/lib/catalogos'
import { fechaHora, telefono } from '@/lib/formato'
import { Aviso, Campo, Tarjeta, Vacio } from '@/components/campos'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { TipoLead } from '@/components/tipo-lead'
import { BotonAccion, BotonEnviar, Dialogo, Formulario } from '@/components/formulario'
import { EVENTOS } from '../../leads/[id]/secciones/historial'
import { agregarTelefono, descartarSugerencia, marcarPrincipal, quitarTelefono } from './acciones'

export async function generateMetadata({ params }: PageProps<'/personas/[id]'>): Promise<Metadata> {
  const supabase = await crearClienteServidor()
  const { data } = await supabase.from('personas').select('nombre').eq('id', (await params).id).maybeSingle()
  return { title: data?.nombre ?? 'Cliente' }
}

const INTENCIONES = ['lead_registrado', 'lead_regreso']

type Item = {
  fecha: string
  texto: string
  autor: string
  lead?: string | null
  intencion?: Record<string, unknown>
  nota?: boolean
  estado?: boolean
  detalle?: string | null
}

export default async function PaginaPersona({ params }: PageProps<'/personas/[id]'>) {
  await exigirUsuario()
  const { id } = await params
  const supabase = await crearClienteServidor()
  const { data: persona } = await supabase.from('personas').select('*').eq('id', id).maybeSingle()
  if (!persona) notFound()

  const [{ data: telefonos }, { data: leads }, { data: sugerencias }, { data: eventos }, { data: perfiles }] = await Promise.all([
    supabase.from('persona_telefonos').select('telefono, principal, created_at').eq('persona_id', id).order('principal', { ascending: false }),
    supabase
      .from('leads')
      .select('id, tipo, estado, ciclo, vigente, created_at, asesor:perfiles!leads_asesor_id_fkey(nombre)')
      .eq('persona_id', id)
      .order('created_at', { ascending: false }),
    supabase.from('sugerencias_union').select('id, persona_a, persona_b').eq('estado', 'pendiente').or(`persona_a.eq.${id},persona_b.eq.${id}`),
    supabase.from('eventos').select('tipo, datos, autor_id, lead_id, created_at').eq('persona_id', id),
    supabase.from('perfiles').select('id, nombre'),
  ])
  const idsLeads = (leads ?? []).map((l) => l.id)
  const [{ data: notas }, { data: estados }] = idsLeads.length
    ? await Promise.all([
        supabase.from('notas').select('texto, autor_id, lead_id, created_at').in('lead_id', idsLeads),
        supabase.from('lead_historial').select('estado_anterior, estado_nuevo, nota, autor_id, lead_id, created_at').in('lead_id', idsLeads),
      ])
    : [{ data: [] }, { data: [] }]
  // Solo se ven los nombres de las personas que el usuario puede ver (RLS)
  const otras = (sugerencias ?? []).map((s) => (s.persona_a === id ? s.persona_b : s.persona_a))
  const { data: nombresOtras } = otras.length ? await supabase.from('personas').select('id, nombre').in('id', otras) : { data: [] }

  const autor = (uid: string | null) => (uid ? (perfiles?.find((p) => p.id === uid)?.nombre ?? '—') : 'Sistema')
  // Etiqueta del lead al que pertenece cada movimiento: "Interesado", "Propietario · ciclo 2"
  const nombreLead = (leadId: string | null) => {
    const l = leads?.find((x) => x.id === leadId)
    return l ? `${TIPOS_LEAD[l.tipo as Tipo]}${l.ciclo > 1 ? ` · ciclo ${l.ciclo}` : ''}` : null
  }
  const items: Item[] = [
    ...(eventos ?? []).map((e) => ({
      fecha: e.created_at,
      texto: EVENTOS[e.tipo]?.(e.datos ?? {}) ?? e.tipo.replace(/_/g, ' '),
      autor: autor(e.autor_id),
      lead: nombreLead(e.lead_id),
      intencion: INTENCIONES.includes(e.tipo) ? (e.datos as Record<string, unknown>) : undefined,
    })),
    ...(estados ?? []).map((h) => ({
      fecha: h.created_at,
      texto: h.estado_anterior
        ? `${ESTADOS_LEAD[h.estado_anterior as EstadoLead]} → ${ESTADOS_LEAD[h.estado_nuevo as EstadoLead]}`
        : `Estado inicial: ${ESTADOS_LEAD[h.estado_nuevo as EstadoLead]}`,
      autor: autor(h.autor_id),
      lead: nombreLead(h.lead_id),
      estado: true,
      detalle: h.nota,
    })),
    ...(notas ?? []).map((n) => ({ fecha: n.created_at, texto: n.texto, autor: autor(n.autor_id), lead: nombreLead(n.lead_id), nota: true })),
  ].sort((a, b) => b.fecha.localeCompare(a.fecha))
  const totalIntenciones = items.filter((i) => i.intencion).length

  return (
    <div className="space-y-4">
      <div>
        <Link href="/leads" className="mb-1 inline-block text-sm text-primary hover:underline">
          ← Leads
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-foreground">{persona.nombre}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{persona.email ?? 'Sin correo'}</span>
              <span>·</span>
              <span>Cliente desde el {fechaHora(persona.created_at)}</span>
              {persona.no_contactar && <Badge variant="rojo">No contactar</Badge>}
            </div>
          </div>
          <Link href={`/personas/${id}/unir`} className="text-sm text-primary hover:underline">
            Unir con otra persona
          </Link>
        </div>
      </div>

      {(sugerencias ?? []).map((s) => {
        const otra = s.persona_a === id ? s.persona_b : s.persona_a
        const nombre = nombresOtras?.find((p) => p.id === otra)?.nombre
        return (
          <Aviso key={s.id} tipo="alerta">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                Posible misma persona: {nombre ?? 'un cliente de otro asesor (pide a un administrador que los revise)'}. Comparten
                correo.
              </span>
              <span className="flex flex-wrap gap-2">
                {nombre && (
                  <Link href={`/personas/${id}/unir?con=${otra}`} className="text-sm font-medium text-primary hover:underline">
                    Unir
                  </Link>
                )}
                <BotonAccion accion={descartarSugerencia.bind(null, id, s.id)} variante="ghost">
                  Descartar
                </BotonAccion>
              </span>
            </div>
          </Aviso>
        )
      })}

      <div className="grid gap-4 lg:grid-cols-2">
        <Tarjeta
          titulo="Teléfonos"
          acciones={
            <Dialogo titulo="Agregar teléfono" boton="Agregar">
              <Formulario accion={agregarTelefono.bind(null, id)}>
                <Campo etiqueta="Teléfono">
                  <Input name="telefono" type="tel" inputMode="tel" required placeholder="987 654 321" />
                </Campo>
                <BotonEnviar>Agregar</BotonEnviar>
              </Formulario>
            </Dialogo>
          }
        >
          <ul className="divide-y divide-border">
            {(telefonos ?? []).map((t) => (
              <li key={t.telefono} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="flex items-center gap-2">
                  <a href={`https://wa.me/${t.telefono}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                    {telefono(t.telefono)}
                  </a>
                  {t.principal && <Badge>Principal</Badge>}
                </span>
                {!t.principal && (
                  <span className="flex flex-wrap gap-2">
                    <BotonAccion accion={marcarPrincipal.bind(null, id, t.telefono)} variante="ghost">
                      Hacer principal
                    </BotonAccion>
                    <BotonAccion
                      accion={quitarTelefono.bind(null, id, t.telefono)}
                      variante="ghost"
                      confirmar={`¿Quitar ${telefono(t.telefono)} de este cliente?`}
                    >
                      Quitar
                    </BotonAccion>
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            Los envíos sin conversación abierta van al principal. Si el cliente escribió en las últimas 24 horas, se le responde al
            número desde el que escribió.
          </p>
        </Tarjeta>

        <Tarjeta titulo="Leads">
          {(leads ?? []).length === 0 ? (
            <Vacio>Sin leads.</Vacio>
          ) : (
            <ul className="divide-y divide-border">
              {(leads ?? []).map((l) => (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link href={`/leads/${l.id}`} className="flex items-center gap-1.5 font-medium text-primary hover:underline">
                    <TipoLead tipo={l.tipo as Tipo} />
                    {l.ciclo > 1 && <span className="text-xs text-muted-foreground">· ciclo {l.ciclo}</span>}
                  </Link>
                  <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <Badge variant={colorEstado(l.estado as EstadoLead)}>{ESTADOS_LEAD[l.estado as EstadoLead]}</Badge>
                    {!l.vigente && <Badge variant="gris">Anterior</Badge>}
                    {(l.asesor as unknown as { nombre: string } | null)?.nombre ?? 'Sin asesor'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
      </div>

      <Tarjeta titulo={`Línea de tiempo · ${totalIntenciones} ${totalIntenciones === 1 ? 'intención' : 'intenciones'}`}>
        {items.length === 0 ? (
          <Vacio>Sin movimientos.</Vacio>
        ) : (
          <ol className="relative space-y-4 border-l border-border pl-5">
            {items.map((it, i) => (
              <li key={i} className="relative">
                <span
                  className={`absolute top-1.5 -left-[25px] size-2.5 rounded-full ${
                    it.intencion ? 'bg-primary' : it.estado ? 'bg-sky-500' : it.nota ? 'bg-amber-500' : 'bg-gray-300'
                  }`}
                />
                <div className="flex flex-wrap items-center gap-2">
                  {it.intencion && <Badge>Intención</Badge>}
                  {it.intencion && (it.intencion.tipo === 'propietario' || it.intencion.tipo === 'interesado') && (
                    <TipoLead tipo={it.intencion.tipo} />
                  )}
                  {it.estado && <Badge variant="gris">Estado</Badge>}
                  {it.nota && <Badge variant="ambar">Nota</Badge>}
                  {it.lead && !it.intencion && <span className="text-xs text-muted-foreground">{it.lead}</span>}
                  <p className="text-sm whitespace-pre-wrap text-foreground">{it.texto}</p>
                </div>
                {it.intencion && <DetalleIntencion d={it.intencion} />}
                {it.detalle && <p className="mt-0.5 text-sm text-muted-foreground">“{it.detalle}”</p>}
                <p className="text-xs text-muted-foreground">
                  {fechaHora(it.fecha)} · {it.autor}
                </p>
              </li>
            ))}
          </ol>
        )}
      </Tarjeta>
    </div>
  )
}

function DetalleIntencion({ d }: { d: Record<string, unknown> }) {
  const filas = [
    ['Origen', d.canal_detalle],
    ['Teléfono', d.telefono ? telefono(d.telefono as string) : null],
    ['Correo', d.email],
    ['UTM', d.utm],
    ['Inmuebles', Array.isArray(d.inmuebles) && d.inmuebles.length ? `${d.inmuebles.length}` : null],
  ].filter(([, v]) => v)
  return (
    <div className="mt-1 space-y-1 text-sm text-muted-foreground">
      {filas.length > 0 && (
        <p className="flex flex-wrap gap-x-3">
          {filas.map(([k, v]) => (
            <span key={k as string}>
              {k as string}: <span className="text-foreground">{String(v)}</span>
            </span>
          ))}
        </p>
      )}
      {typeof d.mensaje === 'string' && <p className="whitespace-pre-wrap">{d.mensaje}</p>}
    </div>
  )
}
