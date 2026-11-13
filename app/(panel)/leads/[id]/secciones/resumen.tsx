import Link from 'next/link'
import { crearClienteServidor } from '@/lib/supabase/server'
import { ESTADOS_LEAD, MEDIOS_CONTACTO, TIPOS_LEAD, etiqueta } from '@/lib/catalogos'
import { ahoraMs, fecha, fechaCorta, fechaHora, hoyLima, isoALocal, relativo } from '@/lib/formato'
import { AreaTexto, Aviso, Campo, Casilla, Dato, Entrada, Insignia, Seleccion, Tarjeta, Vacio, cx } from '@/components/legado'
import { BotonAccion, BotonEnviar, Dialogo, Formulario } from '@/components/formulario'
import {
  actualizarConsentimiento,
  agregarNota,
  enviarBienvenida,
  enviarNovedadesGenerales,
  enviarRefuerzo,
  enviarRetorno,
  guardarContacto,
  guardarProximaAccion,
  registrarRespuesta,
} from '../../acciones'
import type { PropsSeccion } from '../tipos'

export async function SeccionResumen({ lead }: PropsSeccion) {
  const supabase = await crearClienteServidor()
  const p = lead.persona
  const [{ data: refuerzos }, { data: notas }, { data: regreso }, { data: retornoEnviado }, { data: busqueda }, { data: param }] =
    await Promise.all([
      supabase.from('refuerzos').select('*').eq('lead_id', lead.id).order('numero'),
      supabase.from('notas').select('id, texto, created_at, autor:perfiles(nombre)').eq('lead_id', lead.id).order('created_at', { ascending: false }),
      supabase
        .from('eventos')
        .select('created_at, datos')
        .eq('lead_id', lead.id)
        .eq('tipo', 'lead_regreso')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('mensajes')
        .select('created_at')
        .eq('persona_id', p.id)
        .eq('plantilla_clave', 'retorno')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      lead.tipo === 'interesado'
        ? supabase.from('busquedas').select('distritos, tipos, precio_max').eq('lead_id', lead.id).maybeSingle()
        : supabase.from('calificacion_propietario').select('tipo_inmueble, distrito, precio_esperado').eq('lead_id', lead.id).maybeSingle(),
      supabase.from('parametros').select('valor').eq('clave', 'retorno_plazo_meses').maybeSingle(),
    ])

  const hoy = hoyLima()
  const activo = lead.vigente && !['baja', 'cliente', 'descartado'].includes(lead.estado)
  const enCadencia = lead.estado === 'contactado' && refuerzos?.some((r) => r.estado === 'pendiente')
  const previo = lead.otros.find((o) => o.id === lead.lead_anterior_id)
  const mostrarRetorno =
    activo &&
    regreso &&
    (!retornoEnviado || new Date(retornoEnviado.created_at) < new Date(regreso.created_at)) &&
    ahoraMs() - new Date(regreso.created_at).getTime() < 14 * 86_400_000
  const resultadoRegreso = (regreso?.datos as { resultado?: string } | null)?.resultado

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="space-y-4">
        {mostrarRetorno && (
          <Tarjeta titulo="Lead que regresa" className="border-amber-300">
            <p className="mb-3 text-sm text-suave">
              {resultadoRegreso === 'nuevo_ciclo'
                ? `Volvió después del plazo de ${param?.valor ?? 6} meses: se trata como nuevo, con su historial visible.`
                : `Volvió dentro del plazo de ${param?.valor ?? 6} meses: retoma la conversación donde quedó.`}
            </p>
            <dl className="grid gap-3 sm:grid-cols-3">
              <Dato etiqueta="Dónde quedó">
                {previo
                  ? `${ESTADOS_LEAD[previo.estado]} (ciclo ${previo.ciclo})`
                  : ESTADOS_LEAD[lead.estado_antes_salida ?? lead.estado]}
              </Dato>
              <Dato etiqueta={lead.tipo === 'interesado' ? 'Inmueble o búsqueda' : 'Inmueble'}>
                {lead.inmueble_interes
                  ? `${lead.inmueble_interes.codigo} en ${lead.inmueble_interes.distrito}`
                  : busqueda
                    ? 'distritos' in busqueda
                      ? [busqueda.tipos?.join(', '), busqueda.distritos?.join(', ')].filter(Boolean).join(' en ') || '—'
                      : [busqueda.tipo_inmueble, busqueda.distrito].filter(Boolean).join(' en ') || '—'
                    : '—'}
              </Dato>
              <Dato etiqueta="Horario preferido">{p.horario_preferido ?? 'Pregúntale'}</Dato>
            </dl>
            <div className="mt-3">
              <BotonAccion accion={enviarRetorno.bind(null, lead.id)} variante="whatsapp">
                Enviar mensaje para retomar
              </BotonAccion>
            </div>
          </Tarjeta>
        )}

        <Tarjeta titulo="Seguimiento">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-marino-50 px-3 py-2">
            <div>
              <p className="text-xs text-suave">Próxima acción</p>
              <p className="font-medium text-tinta">
                {lead.proxima.accion ?? 'Sin próxima acción'}
                {lead.proxima.fecha && (
                  <span className={cx('ml-2 text-sm', new Date(lead.proxima.fecha).getTime() < ahoraMs() ? 'text-red-700' : 'text-suave')}>
                    {fechaHora(lead.proxima.fecha)} ({relativo(lead.proxima.fecha)})
                  </span>
                )}
              </p>
            </div>
            {lead.vigente && (
              <Dialogo titulo="Próxima acción manual" boton="Programar acción">
                <Formulario accion={guardarProximaAccion}>
                  <input type="hidden" name="lead_id" value={lead.id} />
                  <Campo etiqueta="Acción">
                    <Entrada name="accion" defaultValue={lead.proxima_accion ?? ''} placeholder="Llamar para coordinar cita" />
                  </Campo>
                  <Campo etiqueta="Fecha y hora" ayuda="Déjalo vacío para quitar la acción manual.">
                    <Entrada
                      type="datetime-local"
                      name="fecha"
                      defaultValue={lead.proxima_accion_at ? isoALocal(lead.proxima_accion_at) : ''}
                    />
                  </Campo>
                  <BotonEnviar>Guardar</BotonEnviar>
                </Formulario>
              </Dialogo>
            )}
          </div>

          <ol className="space-y-2">
            <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-borde-suave px-3 py-2">
              <div>
                <p className="text-sm font-medium text-tinta">Día 0 · Bienvenida</p>
                <p className="text-xs text-suave">
                  {lead.bienvenida_at ? `Enviada el ${fechaHora(lead.bienvenida_at)}` : 'Pendiente: envíala en cuanto entra el lead'}
                </p>
              </div>
              {!lead.bienvenida_at && activo && !p.no_contactar && (
                <BotonAccion accion={enviarBienvenida.bind(null, lead.id)} variante="whatsapp">
                  Enviar bienvenida
                </BotonAccion>
              )}
              {lead.bienvenida_at && <Insignia color="verde">Enviada</Insignia>}
            </li>
            {refuerzos?.map((r) => {
              const vence = r.estado === 'pendiente' && r.fecha <= hoy
              return (
                <li
                  key={r.id}
                  className={cx(
                    'flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2',
                    vence ? 'border-amber-300 bg-amber-50' : 'border-borde-suave',
                  )}
                >
                  <div>
                    <p className="text-sm font-medium text-tinta">
                      Día {r.dia} · Refuerzo {r.numero}
                    </p>
                    <p className="text-xs text-suave">
                      {r.estado === 'enviado'
                        ? `Enviado el ${fechaHora(r.enviado_at)}`
                        : r.estado === 'cancelado'
                          ? 'Cancelado: el lead respondió o salió del seguimiento'
                          : `${r.fecha < hoy ? 'Vencido desde' : r.fecha === hoy ? 'Toca hoy,' : 'Programado para el'} ${fecha(r.fecha)}`}
                    </p>
                  </div>
                  {r.estado === 'pendiente' && activo && !p.no_contactar ? (
                    <BotonAccion accion={enviarRefuerzo.bind(null, r.id)} variante={vence ? 'whatsapp' : 'secundario'}>
                      Enviar refuerzo
                    </BotonAccion>
                  ) : (
                    <Insignia color={r.estado === 'enviado' ? 'verde' : 'gris'}>
                      {r.estado === 'enviado' ? 'Enviado' : r.estado === 'cancelado' ? 'Cancelado' : 'Pendiente'}
                    </Insignia>
                  )}
                </li>
              )
            })}
          </ol>
          {lead.respondio_at && <p className="mt-3 text-xs text-suave">Última respuesta del lead: {fechaHora(lead.respondio_at)}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {(enCadencia || lead.estado === 'nuevo' || lead.estado === 'no_responde') && lead.vigente && (
              <BotonAccion accion={registrarRespuesta.bind(null, lead.id)}>Respondió por otro medio</BotonAccion>
            )}
            {lead.estado === 'no_responde' && (
              <span className="flex flex-wrap items-center gap-2">
                {lead.consentimiento_marketing && !p.no_contactar ? (
                  <BotonAccion accion={enviarNovedadesGenerales.bind(null, lead.id)}>Enviar novedades del mes</BotonAccion>
                ) : (
                  <span className="text-xs text-suave">No recibe novedades: no aceptó marketing.</span>
                )}
                {lead.ultimas_novedades_at && (
                  <span className="text-xs text-suave">Últimas novedades: {fecha(lead.ultimas_novedades_at)}</span>
                )}
              </span>
            )}
          </div>
        </Tarjeta>

        <Tarjeta titulo="Notas">
          {lead.vigente && (
            <Formulario accion={agregarNota} reiniciar className="mb-4 space-y-2">
              <input type="hidden" name="lead_id" value={lead.id} />
              <AreaTexto name="texto" placeholder="Qué pasó, qué acordaron…" required />
              <BotonEnviar tamano="sm">Agregar nota</BotonEnviar>
            </Formulario>
          )}
          {notas?.length ? (
            <ul className="space-y-3">
              {notas.map((n) => (
                <li key={n.id} className="border-l-2 border-marino-200 pl-3">
                  <p className="text-sm whitespace-pre-wrap text-tinta">{n.texto}</p>
                  <p className="text-xs text-suave">
                    {(n.autor as unknown as { nombre: string } | null)?.nombre ?? 'Sistema'} · {fechaHora(n.created_at)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <Vacio>Sin notas todavía.</Vacio>
          )}
        </Tarjeta>
      </div>

      <div className="space-y-4">
        <Tarjeta
          titulo="Contacto"
          acciones={
            lead.vigente && (
              <Dialogo titulo="Datos de contacto" boton="Editar">
                <Formulario accion={guardarContacto}>
                  <input type="hidden" name="lead_id" value={lead.id} />
                  <input type="hidden" name="persona_id" value={p.id} />
                  <Campo etiqueta="Nombre">
                    <Entrada name="nombre" defaultValue={p.nombre} required />
                  </Campo>
                  <Campo etiqueta="Correo">
                    <Entrada name="email" type="email" defaultValue={p.email ?? ''} />
                  </Campo>
                  <Campo etiqueta="Horario preferido" ayuda="Se respeta al escribirle.">
                    <Entrada name="horario_preferido" defaultValue={p.horario_preferido ?? ''} placeholder="Tardes, después de las 6 p. m." />
                  </Campo>
                  <Campo etiqueta="Prefiere que lo contacten por">
                    <Seleccion name="medio_contacto" defaultValue={p.medio_contacto ?? ''}>
                      <option value="">Sin dato</option>
                      {Object.entries(MEDIOS_CONTACTO).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </Seleccion>
                  </Campo>
                  <Campo etiqueta="Género" ayuda="Solo si está confirmado. Si no, los mensajes son neutros.">
                    <Seleccion name="genero" defaultValue={p.genero ?? ''}>
                      <option value="">No confirmado</option>
                      <option value="femenino">Femenino</option>
                      <option value="masculino">Masculino</option>
                    </Seleccion>
                  </Campo>
                  {lead.tipo === 'interesado' && (
                    <Casilla name="recibe_novedades" defaultChecked={lead.recibe_novedades} etiqueta="Recibe novedades de inmuebles" />
                  )}
                  {lead.tipo === 'propietario' && <input type="hidden" name="recibe_novedades" value={lead.recibe_novedades ? 'on' : ''} />}
                  <BotonEnviar>Guardar</BotonEnviar>
                </Formulario>
              </Dialogo>
            )
          }
        >
          <dl className="grid grid-cols-2 gap-3">
            <Dato etiqueta="Correo">{p.email ?? '—'}</Dato>
            <Dato etiqueta="Horario preferido">{p.horario_preferido ?? '—'}</Dato>
            <Dato etiqueta="Medio preferido">{etiqueta(MEDIOS_CONTACTO, p.medio_contacto)}</Dato>
            {lead.tipo === 'interesado' && <Dato etiqueta="Novedades">{lead.recibe_novedades ? 'Sí' : 'No'}</Dato>}
            <Dato etiqueta="Ventana de WhatsApp">
              {p.ultimo_entrante_at && ahoraMs() - new Date(p.ultimo_entrante_at).getTime() < 86_400_000 ? (
                <Insignia color="verde">Abierta</Insignia>
              ) : (
                <Insignia color="gris">Cerrada: solo plantillas</Insignia>
              )}
            </Dato>
          </dl>
        </Tarjeta>

        <Tarjeta
          titulo="Consentimiento (Ley 29733)"
          acciones={
            lead.vigente && (
              <Dialogo titulo="Consentimiento" boton="Actualizar">
                <Formulario accion={actualizarConsentimiento}>
                  <input type="hidden" name="lead_id" value={lead.id} />
                  <Casilla name="consentimiento_datos" defaultChecked={lead.consentimiento_datos} etiqueta="Acepta el uso de sus datos personales" />
                  <Casilla name="consentimiento_marketing" defaultChecked={lead.consentimiento_marketing} etiqueta="Acepta recibir novedades y marketing" />
                  <BotonEnviar>Guardar</BotonEnviar>
                </Formulario>
              </Dialogo>
            )
          }
        >
          <ul className="space-y-1 text-sm">
            <li>{lead.consentimiento_datos ? '✅' : '⬜'} Uso de datos personales</li>
            <li>{lead.consentimiento_marketing ? '✅' : '⬜'} Novedades y marketing</li>
          </ul>
          <p className="mt-2 text-xs text-suave">
            {lead.consentimiento_at ? `Registrado el ${fechaHora(lead.consentimiento_at)}` : 'Aún no registrado'}
          </p>
          {!lead.consentimiento_datos && lead.vigente && (
            <Aviso tipo="alerta" className="mt-2">
              Pide su consentimiento para el uso de datos en la primera conversación.
            </Aviso>
          )}
        </Tarjeta>

        {lead.otros.length > 0 && (
          <Tarjeta titulo="Otros registros de esta persona">
            <ul className="space-y-2">
              {lead.otros.map((o) => (
                <li key={o.id}>
                  <Link href={`/leads/${o.id}`} className="flex items-center justify-between gap-2 text-sm hover:underline">
                    <span>
                      {TIPOS_LEAD[o.tipo]} · ciclo {o.ciclo} {!o.vigente && '(anterior)'}
                    </span>
                    <span className="text-xs text-suave">
                      {ESTADOS_LEAD[o.estado]} · {fechaCorta(o.created_at)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Tarjeta>
        )}
      </div>
    </div>
  )
}
