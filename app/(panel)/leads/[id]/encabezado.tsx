import Link from 'next/link'
import { crearClienteServidor } from '@/lib/supabase/server'
import {
  CANALES,
  EMBUDO,
  ESTADOS_CON_ACCION,
  ESTADOS_LEAD,
  SALIDAS,
  TIPOS_LEAD,
  colorEstado,
  etiqueta,
} from '@/lib/catalogos'
import { fecha, telefono } from '@/lib/formato'
import { Campo, Seleccion } from '@/components/campos'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { BotonEnviar, Dialogo, Formulario } from '@/components/formulario'
import { asignarLead, cambiarEstado, darBaja, reactivarLead } from '../acciones'
import type { PropsSeccion } from './tipos'

export async function Encabezado({ lead, usuario }: PropsSeccion) {
  const p = lead.persona
  const supabase = await crearClienteServidor()
  const { data: asesores } = usuario.esAdmin
    ? await supabase.from('perfiles').select('id, nombre').eq('activo', true).order('nombre')
    : { data: null }
  const estadosManuales = [...EMBUDO[lead.tipo], ...SALIDAS].filter(
    (e) => !ESTADOS_CON_ACCION.includes(e) && e !== 'baja' && e !== lead.estado,
  )
  const editable = lead.vigente && lead.estado !== 'cliente'

  return (
    <div className="mb-4">
      <Link href="/leads" className="-mt-2 inline-flex min-h-9 items-center text-sm text-primary hover:underline">
        ← Leads
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-foreground">{p.nombre}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <a href={`https://wa.me/${p.telefono}`} target="_blank" rel="noreferrer" className="-my-2 py-2 text-primary hover:underline">
              {telefono(p.telefono)}
            </a>
            <span>·</span>
            <span>{TIPOS_LEAD[lead.tipo]}</span>
            <Badge variant={colorEstado(lead.estado)}>{ESTADOS_LEAD[lead.estado]}</Badge>
            {lead.ciclo > 1 && <Badge variant="gris">Ciclo {lead.ciclo}</Badge>}
            {p.no_contactar && <Badge variant="rojo">No contactar</Badge>}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {etiqueta(CANALES, lead.canal)}
            {lead.canal_detalle && ` (${lead.canal_detalle})`} · Registrado el {fecha(lead.created_at)} · Asesor:{' '}
            {lead.asesor?.nombre ?? <span className="text-amber-700">sin asignar</span>}
            {lead.publicacion && ` · Llegó por la publicación ${lead.publicacion.codigo} (${lead.publicacion.red})`}
          </p>
        </div>

        {lead.vigente && (
          <div data-guia="lead-acciones" className="flex flex-wrap gap-2">
            {editable && lead.estado !== 'baja' && (
              <Dialogo titulo="Cambiar estado" boton="Cambiar estado" variante="default">
                <Formulario accion={cambiarEstado}>
                  <input type="hidden" name="lead_id" value={lead.id} />
                  <Campo
                    etiqueta="Nuevo estado"
                    ayuda="Agendar, iniciar la compraventa, firmar contrato o cerrar se registran con su propia acción."
                  >
                    <Seleccion name="estado" required defaultValue="">
                      <option value="" disabled>
                        Elige
                      </option>
                      {estadosManuales.map((e) => (
                        <option key={e} value={e}>
                          {ESTADOS_LEAD[e]}
                        </option>
                      ))}
                    </Seleccion>
                  </Campo>
                  <Campo etiqueta="Nota" ayuda="Queda en el historial con tu nombre y la fecha. Obligatoria para descartar.">
                    <Textarea name="nota" />
                  </Campo>
                  <BotonEnviar>Guardar</BotonEnviar>
                </Formulario>
              </Dialogo>
            )}
            {usuario.esAdmin && (
              <Dialogo titulo="Asignar asesor" boton="Asignar">
                <Formulario accion={asignarLead}>
                  <input type="hidden" name="lead_id" value={lead.id} />
                  <Campo etiqueta="Asesor">
                    <Seleccion name="asesor_id" defaultValue={lead.asesor_id ?? ''}>
                      <option value="">Sin asignar</option>
                      {asesores?.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.nombre}
                        </option>
                      ))}
                    </Seleccion>
                  </Campo>
                  <BotonEnviar>Asignar</BotonEnviar>
                </Formulario>
              </Dialogo>
            )}
            {editable && lead.estado !== 'baja' && (
              <Dialogo titulo="Marcar como Baja" boton="Baja" variante="peligro">
                <Formulario accion={darBaja}>
                  <input type="hidden" name="lead_id" value={lead.id} />
                  <p className="text-sm text-muted-foreground">
                    La persona pidió no ser contactada. Se detienen todos los envíos de inmediato, en todos sus registros
                    (refuerzos, novedades, recordatorios e insights), y se cancelan sus citas programadas.
                  </p>
                  <Campo etiqueta="Motivo o cómo lo pidió">
                    <Textarea name="motivo" />
                  </Campo>
                  <BotonEnviar variante="peligro">Confirmar Baja</BotonEnviar>
                </Formulario>
              </Dialogo>
            )}
            {lead.estado === 'baja' && (
              <Dialogo titulo="Reactivar lead" boton="Reactivar">
                <Formulario accion={reactivarLead}>
                  <input type="hidden" name="lead_id" value={lead.id} />
                  <p className="text-sm text-muted-foreground">Solo si la persona pidió volver a ser contactada.</p>
                  <Campo etiqueta="¿Cómo lo pidió?">
                    <Textarea name="nota" required />
                  </Campo>
                  <BotonEnviar>Reactivar</BotonEnviar>
                </Formulario>
              </Dialogo>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
