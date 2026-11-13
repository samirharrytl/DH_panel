import Link from 'next/link'
import { crearClienteServidor } from '@/lib/supabase/server'
import { CANALES, ESTADOS_LEAD, RESPUESTAS_MATCH, NIVELES, etiqueta, type EstadoLead } from '@/lib/catalogos'
import { fechaHora } from '@/lib/formato'
import { Tarjeta, Vacio } from '@/components/campos'
import { Badge } from '@/components/ui/badge'
import type { PropsSeccion } from '../tipos'

// Etiquetas de la bitácora de eventos
const EVENTOS: Record<string, (d: Record<string, unknown>) => string> = {
  lead_registrado: (d) => `Lead registrado (${etiqueta(CANALES, d.canal as string)})`,
  lead_regreso: (d) =>
    d.resultado === 'nuevo_ciclo'
      ? 'Regresó después del plazo: nuevo ciclo'
      : d.resultado === 'retomado'
        ? 'Regresó dentro del plazo: se retomó'
        : 'Volvió a dejar sus datos',
  lead_asignado: () => 'Asignación de asesor',
  consentimiento: (d) => `Consentimiento: datos ${d.datos ? 'sí' : 'no'}, marketing ${d.marketing ? 'sí' : 'no'}`,
  bienvenida_enviada: () => 'Bienvenida enviada',
  refuerzo_enviado: (d) => `Refuerzo ${d.numero} enviado (día ${d.dia})`,
  respondio: () => 'Respondió (registrado a mano)',
  no_responde: () => 'Pasó a No responde',
  baja: (d) => `Baja${d.motivo ? `: ${d.motivo}` : ''}`,
  reactivado: (d) => `Reactivado: ${d.nota}`,
  novedades_enviadas: () => 'Novedades enviadas',
  interes_inmueble: () => 'Inmueble de interés asociado',
  cita_agendada: (d) => `Cita ${d.numero ?? ''} agendada para ${fechaHora(d.inicio as string)}`,
  cita_reprogramada: (d) => `Cita reprogramada a ${fechaHora(d.a as string)}`,
  cita_cancelada: (d) => `Cita cancelada${d.motivo ? `: ${d.motivo}` : ''}`,
  cita_no_asistio: () => 'No asistió a la cita',
  cita_realizada: () => 'Cita realizada',
  aviso_cita: (d) => `Aviso de cita enviado (${d.aviso === '24h' ? '24 horas antes' : d.aviso === 'dia' ? 'mismo día' : 'confirmación'})`,
  inmueble_creado: () => 'Ficha del inmueble creada',
  contrato_firmado: () => 'Contrato firmado',
  contrato_renovado: () => 'Contrato renovado',
  inmueble_retirado: (d) => `Inmueble retirado: ${d.motivo}`,
  perfil_busqueda: () => 'Perfil de búsqueda actualizado',
  nivel_financiero: (d) => `Nivel financiero: ${etiqueta(NIVELES, d.a as string)}`,
  derivacion: (d) => `Derivación a ${d.entidad}: ${d.estado}`,
  match_opcion_enviada: (d) => (d.tipo === 'novedad' ? 'Novedad enviada' : 'Opción de match enviada'),
  match_respuesta: (d) => `Respuesta al match: ${etiqueta(RESPUESTAS_MATCH, d.respuesta as string)}`,
  visita_agendada: (d) => `Visita agendada para ${fechaHora(d.inicio as string)}`,
  visita_reprogramada: (d) => `Visita reprogramada a ${fechaHora(d.a as string)}`,
  visita_cancelada: () => 'Visita cancelada',
  visita_no_asistio: () => 'No asistió a la visita',
  visita_realizada: () => 'Visita realizada',
  opinion_visita: (d) => `Opinión de la visita: interés ${d.interes ?? '—'}`,
  compraventa_iniciada: () => 'Compraventa iniciada',
  compraventa_cerrada: () => 'Compraventa cerrada',
  compraventa_caida: (d) => `Compraventa caída: ${d.motivo}`,
  testimonio_pedido: () => 'Testimonio y reseña pedidos',
  atribucion_publicacion: (d) => `Atribuido a la publicación ${d.codigo} (${d.red})`,
  insights_enviados: () => 'Resumen de insights enviado',
}

type Item = { fecha: string; tipo: 'estado' | 'nota' | 'evento'; texto: string; detalle?: string | null; autor?: string | null }

export async function SeccionHistorial({ lead }: PropsSeccion) {
  const supabase = await crearClienteServidor()
  const [{ data: historial }, { data: eventos }, { data: notas }, { data: perfiles }] = await Promise.all([
    supabase.from('lead_historial').select('*').eq('lead_id', lead.id),
    supabase.from('eventos').select('*').eq('lead_id', lead.id),
    supabase.from('notas').select('*').eq('lead_id', lead.id),
    supabase.from('perfiles').select('id, nombre'),
  ])
  const nombre = (id: string | null) => (id ? (perfiles?.find((p) => p.id === id)?.nombre ?? '—') : 'Sistema')

  const items: Item[] = [
    ...(historial ?? []).map((h) => ({
      fecha: h.created_at,
      tipo: 'estado' as const,
      texto: h.estado_anterior
        ? `${ESTADOS_LEAD[h.estado_anterior as EstadoLead]} → ${ESTADOS_LEAD[h.estado_nuevo as EstadoLead]}`
        : `Estado inicial: ${ESTADOS_LEAD[h.estado_nuevo as EstadoLead]}`,
      detalle: h.nota,
      autor: nombre(h.autor_id),
    })),
    ...(eventos ?? []).map((e) => ({
      fecha: e.created_at,
      tipo: 'evento' as const,
      texto: EVENTOS[e.tipo]?.(e.datos ?? {}) ?? e.tipo.replace(/_/g, ' '),
      autor: nombre(e.autor_id),
    })),
    ...(notas ?? []).map((n) => ({ fecha: n.created_at, tipo: 'nota' as const, texto: n.texto, autor: nombre(n.autor_id) })),
  ].sort((a, b) => b.fecha.localeCompare(a.fecha))

  const anteriores = lead.otros.filter((o) => o.tipo === lead.tipo && !o.vigente)

  return (
    <div className="space-y-4">
      {anteriores.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Ciclos anteriores:{' '}
          {anteriores.map((o, i) => (
            <span key={o.id}>
              {i > 0 && ', '}
              <Link href={`/leads/${o.id}?tab=historial`} className="text-primary hover:underline">
                ciclo {o.ciclo} ({ESTADOS_LEAD[o.estado]})
              </Link>
            </span>
          ))}
        </p>
      )}
      <Tarjeta titulo="Historial">
        {items.length === 0 ? (
          <Vacio>Sin movimientos.</Vacio>
        ) : (
          <ol className="relative space-y-4 border-l border-border pl-5">
            {items.map((it, i) => (
              <li key={i} className="relative">
                <span
                  className={`absolute top-1.5 -left-[25px] size-2.5 rounded-full ${
                    it.tipo === 'estado' ? 'bg-primary' : it.tipo === 'nota' ? 'bg-amber-500' : 'bg-gray-300'
                  }`}
                />
                <div className="flex flex-wrap items-center gap-2">
                  {it.tipo === 'estado' && <Badge>Estado</Badge>}
                  {it.tipo === 'nota' && <Badge variant="ambar">Nota</Badge>}
                  <p className="text-sm text-foreground whitespace-pre-wrap">{it.texto}</p>
                </div>
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
