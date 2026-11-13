import Link from 'next/link'
import { crearClienteServidor } from '@/lib/supabase/server'
import { CONSERVACION, ESTADOS_CITA, ESTADOS_INMUEBLE, TIPOS_INMUEBLE, colorEstadoInmueble, etiqueta } from '@/lib/catalogos'
import { diaLargo, hora, soles } from '@/lib/formato'
import { AreaTexto, Campo, Casilla, Entrada, Insignia, Seleccion, Tarjeta, Vacio } from '@/components/legado'
import { BotonEnviar, Dialogo, Formulario } from '@/components/formulario'
import { AccionesCita, type CitaBasica } from '@/components/acciones-cita'
import { agendarCita, registrarResultadoCita } from '../../../agenda/acciones'
import { DatosAcceso, ID_DISTRITOS, ListaDistritos, caracteristicasTexto, enlaceMapa } from '../../../inmuebles/compartido'
import type { InmuebleVista } from '../../../inmuebles/tipos'
import type { PropsSeccion } from '../tipos'

type Cita = CitaBasica & {
  numero: number | null
  direccion: string
  distrito: string | null
  duracion_min: number
  acceso_llave: string | null
  acceso_codigo: string | null
  acceso_dni: boolean
  acceso_otros: string | null
  notas: string | null
  resultado: string | null
  motivo_cancelacion: string | null
  reprogramaciones: number
}

const COLOR_CITA = { programada: 'azul', realizada: 'verde', cancelada: 'gris', no_asistio: 'ambar' } as const

// HU-14 y HU-15: citas con el propietario y el inmueble que resulta de ellas
export async function SeccionCitas({ lead }: PropsSeccion) {
  const supabase = await crearClienteServidor()
  const [{ data: citas }, { data: calif }, { data: inmuebles }] = await Promise.all([
    supabase.from('citas').select('*').eq('lead_id', lead.id).eq('tipo', 'cita_propietario').order('inicio', { ascending: false }),
    supabase.from('calificacion_propietario').select('*').eq('lead_id', lead.id).maybeSingle(),
    supabase.from('v_inmuebles').select('*').eq('propietario_lead_id', lead.id).order('created_at', { ascending: false }),
  ])
  const lista = (citas ?? []) as Cita[]
  const inmueble = (inmuebles?.[0] ?? null) as InmuebleVista | null
  const puedeAgendar = lead.vigente && !['baja', 'cliente'].includes(lead.estado)
  // La dirección y el acceso se proponen desde la calificación o el inmueble ya creado
  const base = {
    direccion: inmueble?.direccion ?? calif?.direccion ?? '',
    distrito: inmueble?.distrito ?? calif?.distrito ?? '',
    acceso_llave: inmueble?.acceso_llave ?? '',
    acceso_codigo: inmueble?.acceso_codigo ?? '',
    acceso_dni: inmueble?.acceso_dni ?? false,
    acceso_otros: inmueble?.acceso_otros ?? '',
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <ListaDistritos />
      <Tarjeta
        titulo="Citas con el propietario"
        acciones={
          puedeAgendar && (
            <Dialogo titulo="Agendar cita" boton="+ Agendar cita" variante="primario">
              <Formulario accion={agendarCita}>
                <input type="hidden" name="lead_id" value={lead.id} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Campo etiqueta="Fecha y hora">
                    <Entrada type="datetime-local" name="inicio" required />
                  </Campo>
                  <Campo etiqueta="Duración (min)">
                    <Entrada type="number" name="duracion_min" min={15} max={480} step={15} defaultValue={60} />
                  </Campo>
                </div>
                <Campo etiqueta="Dirección">
                  <Entrada name="direccion" defaultValue={base.direccion} required />
                </Campo>
                <Campo etiqueta="Distrito">
                  <Entrada name="distrito" list={ID_DISTRITOS} defaultValue={base.distrito} />
                </Campo>
                <fieldset className="space-y-3 rounded-lg border border-borde-suave p-3">
                  <legend className="px-1 text-sm font-medium text-tinta">Consideraciones de acceso</legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Campo etiqueta="Llave">
                      <Entrada name="acceso_llave" defaultValue={base.acceso_llave} placeholder="La tiene el portero" />
                    </Campo>
                    <Campo etiqueta="Código">
                      <Entrada name="acceso_codigo" defaultValue={base.acceso_codigo} />
                    </Campo>
                  </div>
                  <Casilla name="acceso_dni" defaultChecked={base.acceso_dni} etiqueta="Piden DNI en la entrada" />
                  <Campo etiqueta="Otras">
                    <Entrada name="acceso_otros" defaultValue={base.acceso_otros} />
                  </Campo>
                </fieldset>
                <Campo etiqueta="Notas">
                  <AreaTexto name="notas" rows={2} />
                </Campo>
                <BotonEnviar>Agendar</BotonEnviar>
              </Formulario>
            </Dialogo>
          )
        }
      >
        {lista.length ? (
          <ul className="space-y-4">
            {lista.map((c) => (
              <li key={c.id} className="space-y-2 border-l-2 border-marino-200 pl-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-tinta">
                    Cita {c.numero ?? ''} · {diaLargo(c.inicio)}, {hora(c.inicio)}
                  </p>
                  <Insignia color={COLOR_CITA[c.estado]}>{ESTADOS_CITA[c.estado]}</Insignia>
                  {c.reprogramaciones > 0 && <Insignia color="gris">Reprogramada {c.reprogramaciones}×</Insignia>}
                </div>
                <a href={enlaceMapa(c.direccion, c.distrito)} target="_blank" rel="noreferrer" className="block text-sm text-marino-700 hover:underline">
                  📍 {[c.direccion, c.distrito].filter(Boolean).join(', ')}
                </a>
                <DatosAcceso acceso={c} />
                {c.notas && <p className="text-sm whitespace-pre-wrap text-suave">{c.notas}</p>}
                {c.resultado && <p className="text-sm whitespace-pre-wrap text-tinta">Resultado: {c.resultado}</p>}
                {c.motivo_cancelacion && <p className="text-sm text-suave">Motivo: {c.motivo_cancelacion}</p>}
                {lead.vigente && (
                  <div className="flex flex-wrap gap-2">
                    <AccionesCita cita={c} compacto />
                    {c.estado === 'programada' && (
                      <Dialogo titulo="Resultado de la cita" boton="Registrar resultado" variante="primario">
                        <Formulario accion={registrarResultadoCita}>
                          <input type="hidden" name="cita_id" value={c.id} />
                          <input type="hidden" name="lead_id" value={lead.id} />
                          <Campo etiqueta="Cómo fue la cita">
                            <AreaTexto name="resultado" rows={2} placeholder="Qué se vio, qué se acordó…" />
                          </Campo>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <Campo etiqueta="Tipo de inmueble">
                              <Seleccion name="tipo" defaultValue={inmueble?.tipo ?? calif?.tipo_inmueble ?? 'departamento'} required>
                                {Object.entries(TIPOS_INMUEBLE).map(([k, v]) => (
                                  <option key={k} value={k}>
                                    {v}
                                  </option>
                                ))}
                              </Seleccion>
                            </Campo>
                            <Campo etiqueta="Estado del inmueble">
                              <Seleccion name="conservacion" defaultValue={inmueble?.conservacion ?? ''} required>
                                <option value="" disabled>
                                  Elige…
                                </option>
                                {Object.entries(CONSERVACION).map(([k, v]) => (
                                  <option key={k} value={k}>
                                    {v}
                                  </option>
                                ))}
                              </Seleccion>
                            </Campo>
                            <Campo etiqueta="Dirección" className="sm:col-span-2">
                              <Entrada name="direccion" defaultValue={c.direccion} required />
                            </Campo>
                            <Campo etiqueta="Distrito">
                              <Entrada name="distrito" list={ID_DISTRITOS} defaultValue={c.distrito ?? base.distrito} required />
                            </Campo>
                            <Campo etiqueta="Precio acordado (S/)">
                              <Entrada name="precio" type="number" min={1} step="0.01" defaultValue={inmueble?.precio ?? calif?.precio_esperado ?? ''} required />
                            </Campo>
                            <Campo etiqueta="Metraje (m²)">
                              <Entrada name="metraje" type="number" min={0} step="0.01" defaultValue={inmueble?.metraje ?? calif?.metraje ?? ''} />
                            </Campo>
                            <Campo etiqueta="Dormitorios">
                              <Entrada name="dormitorios" type="number" min={0} defaultValue={inmueble?.dormitorios ?? calif?.dormitorios ?? ''} />
                            </Campo>
                            <Campo etiqueta="Baños">
                              <Entrada name="banos" type="number" min={0} defaultValue={inmueble?.banos ?? calif?.banos ?? ''} />
                            </Campo>
                            <Campo etiqueta="Cocheras">
                              <Entrada name="cocheras" type="number" min={0} defaultValue={inmueble?.cocheras ?? (calif?.cochera ? 1 : 0)} />
                            </Campo>
                          </div>
                          <Casilla name="ascensor" defaultChecked={inmueble?.ascensor ?? false} etiqueta="Tiene ascensor" />
                          <Campo etiqueta="Descripción">
                            <AreaTexto name="descripcion" rows={2} defaultValue={inmueble?.descripcion ?? ''} />
                          </Campo>
                          <BotonEnviar>Guardar y crear ficha del inmueble</BotonEnviar>
                        </Formulario>
                      </Dialogo>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <Vacio>{puedeAgendar ? 'Sin citas todavía. Agenda la primera cuando tengas la calificación.' : 'Sin citas.'}</Vacio>
        )}
      </Tarjeta>

      <Tarjeta titulo="Inmueble">
        {inmueble ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/inmuebles/${inmueble.id}`} className="font-medium text-marino-800 hover:underline">
                {inmueble.codigo} · {etiqueta(TIPOS_INMUEBLE, inmueble.tipo)} en {inmueble.distrito}
              </Link>
              <Insignia color={colorEstadoInmueble(inmueble.estado)}>{ESTADOS_INMUEBLE[inmueble.estado]}</Insignia>
            </div>
            <p className="text-sm text-tinta">{soles(inmueble.precio)}</p>
            <p className="text-sm text-suave">{caracteristicasTexto(inmueble)}</p>
            <Link href={`/inmuebles/${inmueble.id}`} className="inline-block text-sm text-marino-700 hover:underline">
              {inmueble.estado === 'en_captacion' ? 'Subir fotos y registrar el contrato →' : 'Ver ficha del inmueble →'}
            </Link>
          </div>
        ) : (
          <Vacio>La ficha del inmueble se crea al registrar el resultado de la primera cita.</Vacio>
        )}
      </Tarjeta>
    </div>
  )
}
