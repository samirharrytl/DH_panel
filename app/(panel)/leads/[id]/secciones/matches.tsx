import Link from 'next/link'
import { crearClienteServidor } from '@/lib/supabase/server'
import { NIVELES, ORDEN_NIVEL, RESPUESTAS_MATCH, etiqueta, type Nivel, type RespuestaMatch } from '@/lib/catalogos'
import { ahoraMs, fechaHora, num, soles } from '@/lib/formato'
import { Aviso, EnlaceBoton, Insignia, Tarjeta, Vacio, cx } from '@/components/ui'
import { BotonAccion } from '@/components/formulario'
import { enviarMatches, registrarRespuestaMatch } from './matches-acciones'
import { COLOR_RESPUESTA, colorPuntaje, lineaInmueble, textoRespuesta, type InmuebleLinea } from './matches-formato'
import { SelectorMatches, type Sugerencia } from './matches-selector'
import type { PropsSeccion } from '../tipos'

type Opcion = {
  id: string
  inmueble_id: string
  puntaje: number | null
  respuesta: RespuestaMatch | null
  respondido_at: string | null
  respuesta_por: string | null
  inmueble: (InmuebleLinea & { estado: string }) | null
}
type Envio = {
  id: string
  tipo: 'match' | 'novedad'
  enviado_at: string
  autor: { nombre: string } | null
  opciones: Opcion[]
}
type Prioridad = {
  inmueble_id: string
  codigo: string
  distrito: string
  precio: number | null
  ajuste: number
  factor_precio: number
  disponibilidad: number
  prioridad: number
  visita_programada: boolean
}

export async function SeccionMatches({ lead }: PropsSeccion) {
  const supabase = await crearClienteServidor()
  const [{ data: sugeridas, error: errorSugerencias }, { data: filasEnvios }, { data: param }, { data: busqueda }, { data: capacidad }] =
    await Promise.all([
      supabase.rpc('sugerir_matches', { p_lead_id: lead.id }),
      supabase
        .from('match_envios')
        .select(
          `id, tipo, enviado_at, autor:perfiles(nombre),
           opciones:match_opciones(id, inmueble_id, puntaje, respuesta, respondido_at, respuesta_por,
             inmueble:inmuebles(codigo, tipo, distrito, precio, dormitorios, metraje, estado))`,
        )
        .eq('lead_id', lead.id)
        .order('enviado_at', { ascending: false }),
      supabase.from('parametros').select('valor').eq('clave', 'match_max_opciones').maybeSingle(),
      supabase.from('busquedas').select('lead_id').eq('lead_id', lead.id).maybeSingle(),
      supabase.from('capacidad_financiera').select('presupuesto_max, nivel').eq('lead_id', lead.id).maybeSingle(),
    ])

  const sugerencias = (sugeridas ?? []) as Sugerencia[]
  const envios = (filasEnvios ?? []) as unknown as Envio[]
  const hayInteres = envios.some((e) => e.opciones.some((o) => o.respuesta === 'me_interesa'))
  const { data: filasPrioridad } = hayInteres
    ? await supabase.rpc('priorizar_interes', { p_lead_id: lead.id })
    : { data: null }
  const prioridad = (filasPrioridad ?? []) as Prioridad[]

  const maximo = Math.max(1, Number(param?.valor) || 3)
  const p = lead.persona
  const ventana = !!p.ultimo_entrante_at && ahoraMs() - new Date(p.ultimo_entrante_at).getTime() < 86_400_000
  const bloqueo = !lead.vigente
    ? 'Es un ciclo anterior del lead: solo lectura.'
    : lead.estado === 'baja' || p.no_contactar
      ? 'El lead está en Baja: no recibe mensajes.'
      : null
  const cap = capacidad as { presupuesto_max: number | null; nivel: Nivel } | null
  const nivel = cap?.nivel ?? 'no_validada'

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="space-y-4">
        {prioridad.length > 0 && (
          <Tarjeta titulo="Prioridad entre los que le interesan">
            <p className="mb-3 text-xs text-suave">
              Orden por ajuste al perfil (50 %), precio frente a su presupuesto (30 %) y disponibilidad de visita (20 %).
            </p>
            <ol className="space-y-2">
              {prioridad.map((x, n) => (
                <li
                  key={x.inmueble_id}
                  className={cx(
                    'flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2',
                    n === 0 ? 'border-emerald-300 bg-emerald-50' : 'border-borde-suave',
                  )}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-tinta">
                      {n + 1}. {x.codigo} · {x.distrito} · {soles(x.precio)}
                      {n === 0 && prioridad.length > 1 && (
                        <Insignia color="verde" className="ml-2">
                          Recomendado
                        </Insignia>
                      )}
                    </p>
                    <p className="text-xs text-suave">
                      Prioridad {num(Number(x.prioridad) * 100)} % · Ajuste {num(x.ajuste)}/100 · Precio vs. presupuesto{' '}
                      {num(Number(x.factor_precio) * 100)} % ·{' '}
                      {Number(x.disponibilidad) >= 1 ? 'Con llave o código' : 'Sin datos de acceso'}
                    </p>
                  </div>
                  {x.visita_programada ? (
                    <Insignia color="azul">Visita programada</Insignia>
                  ) : (
                    lead.vigente &&
                    !bloqueo && (
                      <EnlaceBoton
                        href={`/leads/${lead.id}?tab=visitas&inmueble=${x.inmueble_id}`}
                        tamano="sm"
                        variante={n === 0 ? 'primario' : 'secundario'}
                      >
                        Agendar visita
                      </EnlaceBoton>
                    )
                  )}
                </li>
              ))}
            </ol>
          </Tarjeta>
        )}

        <Tarjeta
          titulo="Inmuebles que hacen match"
          acciones={<span className="text-xs text-suave">{sugerencias.length} en cartera, por ajuste</span>}
        >
          {!busqueda && (
            <Aviso tipo="alerta" className="mb-3">
              Aún no tiene perfil de búsqueda: el puntaje no discrimina.{' '}
              <Link href={`/leads/${lead.id}?tab=perfil`} className="font-medium underline">
                Registra su perfil
              </Link>
              .
            </Aviso>
          )}
          {ORDEN_NIVEL.indexOf(nivel) < ORDEN_NIVEL.indexOf('declarada') && (
            <Aviso tipo="alerta" className="mb-3">
              Capacidad financiera {etiqueta(NIVELES, nivel).toLowerCase()}: los matches se envían desde la capacidad declarada.{' '}
              <Link href={`/leads/${lead.id}?tab=perfil`} className="font-medium underline">
                Registra su capacidad
              </Link>
              .
            </Aviso>
          )}
          {bloqueo && (
            <Aviso tipo="alerta" className="mb-3">
              {bloqueo}
            </Aviso>
          )}
          {!bloqueo && (
            <p className="mb-3 text-xs text-suave">
              {ventana
                ? 'Ventana de WhatsApp abierta: además de la lista, cada opción sale aparte con su foto y los botones Me interesa, No me interesa y Ver parecidos.'
                : 'Ventana de WhatsApp cerrada: se envía la plantilla con la lista y registras sus respuestas a mano.'}
            </p>
          )}
          {errorSugerencias ? (
            <Aviso tipo="error">{errorSugerencias.message}</Aviso>
          ) : sugerencias.length ? (
            <SelectorMatches
              leadId={lead.id}
              sugerencias={sugerencias}
              maximo={maximo}
              habilitado={!bloqueo}
              accion={enviarMatches}
            />
          ) : (
            <Vacio>Ningún inmueble en cartera encaja con su búsqueda y su capacidad por ahora.</Vacio>
          )}
          <p className="mt-3 text-xs text-suave">
            No se muestran los inmuebles fuera de su capacidad
            {cap?.presupuesto_max ? ` (hasta ${soles(cap.presupuesto_max)})` : ''}, de otro tipo ni los que ya rechazó.
          </p>
        </Tarjeta>
      </div>

      <div className="space-y-4">
        <Tarjeta titulo="Envíos y respuestas">
          {envios.length ? (
            <ol className="space-y-4">
              {envios.map((e) => (
                <li key={e.id} className="border-l-2 border-marino-200 pl-3">
                  <p className="flex flex-wrap items-center gap-2 text-xs text-suave">
                    <Insignia color={e.tipo === 'novedad' ? 'azul' : 'marino'}>{e.tipo === 'novedad' ? 'Novedad' : 'Match'}</Insignia>
                    {fechaHora(e.enviado_at)}
                    {e.autor && ` · ${e.autor.nombre}`}
                  </p>
                  <ul className="mt-2 space-y-2">
                    {[...e.opciones]
                      .sort((a, b) => Number(b.puntaje ?? 0) - Number(a.puntaje ?? 0))
                      .map((o) => (
                        <li key={o.id} className="rounded-lg border border-borde-suave px-3 py-2">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <p className="min-w-0 text-sm text-tinta">{o.inmueble ? lineaInmueble(o.inmueble) : 'Inmueble'}</p>
                            {o.puntaje !== null && (
                              <Insignia color={colorPuntaje(Number(o.puntaje))}>{num(o.puntaje)} pts</Insignia>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <Insignia color={o.respuesta ? COLOR_RESPUESTA[o.respuesta] : 'gris'}>{textoRespuesta(o.respuesta)}</Insignia>
                            {o.respondido_at && (
                              <span className="text-xs text-suave">
                                {fechaHora(o.respondido_at)}
                                {o.respuesta_por ? ' · registrada en el panel' : ' · por WhatsApp'}
                              </span>
                            )}
                            {o.inmueble && o.inmueble.estado !== 'en_cartera' && <Insignia color="gris">Ya no está en cartera</Insignia>}
                          </div>
                          {lead.vigente && (
                            <div className="mt-2 flex flex-wrap items-center gap-1">
                              {o.respuesta && <span className="text-xs text-suave">Cambiar:</span>}
                              {(Object.keys(RESPUESTAS_MATCH) as RespuestaMatch[])
                                .filter((r) => r !== o.respuesta)
                                .map((r) => (
                                  <BotonAccion
                                    key={r}
                                    accion={registrarRespuestaMatch.bind(null, o.id, lead.id, r)}
                                    variante={o.respuesta ? 'fantasma' : 'secundario'}
                                  >
                                    {RESPUESTAS_MATCH[r]}
                                  </BotonAccion>
                                ))}
                            </div>
                          )}
                        </li>
                      ))}
                  </ul>
                </li>
              ))}
            </ol>
          ) : (
            <Vacio>Aún no se le envió ningún inmueble.</Vacio>
          )}
        </Tarjeta>
      </div>
    </div>
  )
}
