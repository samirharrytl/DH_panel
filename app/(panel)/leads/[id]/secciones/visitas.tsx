import Link from 'next/link'
import { crearClienteServidor } from '@/lib/supabase/server'
import { ESTADOS_CITA, INTERES_VISITA, NIVELES, ORDEN_NIVEL, TIPOS_INMUEBLE, etiqueta, type Nivel } from '@/lib/catalogos'
import { diaLargo, hora, soles } from '@/lib/formato'
import { AreaTexto, Aviso, Campo, Entrada, Insignia, Seleccion, Tarjeta, Vacio } from '@/components/legado'
import { BotonAccion, BotonEnviar, Dialogo, Formulario } from '@/components/formulario'
import { AccionesCita, type CitaBasica } from '@/components/acciones-cita'
import { DatosAcceso, enlaceMapa } from '../../../inmuebles/compartido'
import { agendarVisita, marcarVisitaRealizada, pedirOpinionVisita, registrarOpinionVisita } from './visitas-acciones'
import type { PropsSeccion } from '../tipos'

type Visita = CitaBasica & {
  direccion: string
  distrito: string | null
  acceso_llave: string | null
  acceso_codigo: string | null
  acceso_dni: boolean
  acceso_otros: string | null
  notas: string | null
  inmueble: { id: string; codigo: string; tipo: string; distrito: string } | null
  opinion: { calificacion: number | null; interes: string; le_gusto: string | null; no_le_gusto: string | null; comentario: string | null } | null
}

const COLOR = { programada: 'azul', realizada: 'verde', cancelada: 'gris', no_asistio: 'ambar' } as const

// HU-26 y HU-27: visitas del interesado con los datos de acceso del inmueble y su opinión
export async function SeccionVisitas({ lead, inmueble }: PropsSeccion & { inmueble?: string }) {
  const supabase = await crearClienteServidor()
  const [{ data: v }, { data: cap }, { data: param }, { data: cartera }, { data: interes }] = await Promise.all([
    supabase
      .from('citas')
      .select('*, inmueble:inmuebles(id, codigo, tipo, distrito), opinion:visita_opiniones(*)')
      .eq('lead_id', lead.id)
      .eq('tipo', 'visita')
      .order('inicio', { ascending: false }),
    supabase.from('capacidad_financiera').select('nivel').eq('lead_id', lead.id).maybeSingle(),
    supabase.from('parametros').select('valor').eq('clave', 'nivel_visita').maybeSingle(),
    supabase.from('inmuebles').select('id, codigo, tipo, distrito, precio').eq('estado', 'en_cartera').order('codigo'),
    supabase.from('match_opciones').select('inmueble_id').eq('lead_id', lead.id).eq('respuesta', 'me_interesa'),
  ])
  const visitas = (v ?? []) as unknown as Visita[]
  const nivel = (cap?.nivel ?? 'no_validada') as Nivel
  const exigido = (typeof param?.valor === 'string' && param.valor in NIVELES ? param.valor : 'declarada') as Nivel
  const alcanza = ORDEN_NIVEL.indexOf(nivel) >= ORDEN_NIVEL.indexOf(exigido)
  const leInteresa = new Set((interes ?? []).map((x) => x.inmueble_id))
  const opciones = [...(cartera ?? [])].sort((a, b) => Number(leInteresa.has(b.id)) - Number(leInteresa.has(a.id)))
  const puede = lead.vigente && lead.estado !== 'baja'

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Tarjeta titulo="Visitas">
        {visitas.length ? (
          <ul className="space-y-4">
            {visitas.map((c) => (
              <li key={c.id} className="space-y-2 border-l-2 border-marino-200 pl-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-tinta">
                    {diaLargo(c.inicio)}, {hora(c.inicio)}
                  </p>
                  <Insignia color={COLOR[c.estado]}>{ESTADOS_CITA[c.estado]}</Insignia>
                  {c.inmueble && (
                    <Link href={`/inmuebles/${c.inmueble.id}`} className="text-sm text-marino-700 hover:underline">
                      {c.inmueble.codigo} · {etiqueta(TIPOS_INMUEBLE, c.inmueble.tipo)} en {c.inmueble.distrito}
                    </Link>
                  )}
                </div>
                <a href={enlaceMapa(c.direccion, c.distrito)} target="_blank" rel="noreferrer" className="block text-sm text-marino-700 hover:underline">
                  📍 {[c.direccion, c.distrito].filter(Boolean).join(', ')}
                </a>
                <DatosAcceso acceso={c} />
                {c.notas && <p className="text-sm whitespace-pre-wrap text-suave">{c.notas}</p>}
                {c.opinion && (
                  <p className="text-sm text-tinta">
                    Opinión: interés {etiqueta(INTERES_VISITA, c.opinion.interes).toLowerCase()}
                    {c.opinion.calificacion ? ` · ${c.opinion.calificacion}/5` : ''}
                    {c.opinion.le_gusto && ` · 👍 ${c.opinion.le_gusto}`}
                    {c.opinion.no_le_gusto && ` · 👎 ${c.opinion.no_le_gusto}`}
                    {c.opinion.comentario && ` · ${c.opinion.comentario}`}
                  </p>
                )}
                {lead.vigente && (
                  <div className="flex flex-wrap gap-2">
                    <AccionesCita cita={c} compacto />
                    {c.estado === 'programada' && (
                      <BotonAccion accion={marcarVisitaRealizada.bind(null, c.id, lead.id)}>Marcar realizada</BotonAccion>
                    )}
                    {(c.estado === 'programada' || c.estado === 'realizada') && (
                      <>
                        <BotonAccion accion={pedirOpinionVisita.bind(null, c.id)} variante="whatsapp">
                          Pedir opinión
                        </BotonAccion>
                        <Dialogo titulo="Opinión de la visita" boton={c.opinion ? 'Editar opinión' : 'Registrar opinión'} variante="primario">
                          <Formulario accion={registrarOpinionVisita}>
                            <input type="hidden" name="cita_id" value={c.id} />
                            <input type="hidden" name="lead_id" value={lead.id} />
                            <input type="hidden" name="inmueble_id" value={c.inmueble?.id ?? ''} />
                            <div className="grid grid-cols-2 gap-3">
                              <Campo etiqueta="Interés">
                                <Seleccion name="interes" defaultValue={c.opinion?.interes ?? ''} required>
                                  <option value="" disabled>
                                    Elige…
                                  </option>
                                  {Object.entries(INTERES_VISITA).map(([k, t]) => (
                                    <option key={k} value={k}>
                                      {t}
                                    </option>
                                  ))}
                                </Seleccion>
                              </Campo>
                              <Campo etiqueta="Calificación (1 a 5)">
                                <Entrada name="calificacion" type="number" min={1} max={5} defaultValue={c.opinion?.calificacion ?? ''} />
                              </Campo>
                            </div>
                            <Campo etiqueta="Qué le gustó">
                              <Entrada name="le_gusto" defaultValue={c.opinion?.le_gusto ?? ''} />
                            </Campo>
                            <Campo etiqueta="Qué no le gustó">
                              <Entrada name="no_le_gusto" defaultValue={c.opinion?.no_le_gusto ?? ''} />
                            </Campo>
                            <Campo etiqueta="Comentario">
                              <AreaTexto name="comentario" rows={2} defaultValue={c.opinion?.comentario ?? ''} />
                            </Campo>
                            <BotonEnviar>Guardar opinión</BotonEnviar>
                          </Formulario>
                        </Dialogo>
                      </>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <Vacio>Sin visitas todavía.</Vacio>
        )}
      </Tarjeta>

      <Tarjeta titulo="Agendar visita">
        {!puede ? (
          <Vacio>El lead no está activo.</Vacio>
        ) : !alcanza ? (
          <Aviso tipo="alerta">
            Su nivel financiero es <strong>{NIVELES[nivel]}</strong> y para visitar se exige <strong>{NIVELES[exigido]}</strong>. Actualízalo en{' '}
            <Link href={`/leads/${lead.id}?tab=perfil`} className="font-medium underline">
              Perfil y capacidad
            </Link>
            .
          </Aviso>
        ) : (
          <Formulario accion={agendarVisita}>
            <input type="hidden" name="lead_id" value={lead.id} />
            <Campo etiqueta="Inmueble" ayuda="★ = respondió «Me interesa». La visita toma la dirección y el acceso de su ficha.">
              <Seleccion name="inmueble_id" defaultValue={inmueble ?? ''} required>
                <option value="" disabled>
                  Elige…
                </option>
                {opciones.map((i) => (
                  <option key={i.id} value={i.id}>
                    {leInteresa.has(i.id) ? '★ ' : ''}
                    {i.codigo} · {etiqueta(TIPOS_INMUEBLE, i.tipo)} en {i.distrito} · {soles(i.precio)}
                  </option>
                ))}
              </Seleccion>
            </Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta="Fecha y hora">
                <Entrada type="datetime-local" name="inicio" required />
              </Campo>
              <Campo etiqueta="Duración (min)">
                <Entrada type="number" name="duracion_min" min={15} max={480} step={15} defaultValue={45} />
              </Campo>
            </div>
            <Campo etiqueta="Notas">
              <AreaTexto name="notas" rows={2} />
            </Campo>
            <BotonEnviar>Agendar visita</BotonEnviar>
            <p className="text-xs text-suave">
              En la <Link href="/agenda" className="underline">Agenda</Link> las visitas del día salen agrupadas por distrito.
            </p>
          </Formulario>
        )}
      </Tarjeta>
    </div>
  )
}
