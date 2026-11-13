import Link from 'next/link'
import { crearClienteServidor } from '@/lib/supabase/server'
import { CONSERVACION, ESTADOS_CITA, ESTADOS_INMUEBLE, TIPOS_INMUEBLE, colorEstadoInmueble, etiqueta } from '@/lib/catalogos'
import { diaLargo, hora, soles } from '@/lib/formato'
import { Campo, Casilla, Seleccion, Tarjeta, Vacio } from '@/components/campos'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { BotonEnviar, Dialogo, Formulario } from '@/components/formulario'
import { AccionesCita, type CitaBasica } from '@/components/acciones-cita'
import { agendarCita, registrarResultadoCita } from '../../../agenda/acciones'
import { DatosAcceso, ID_DISTRITOS, ListaDistritos, caracteristicasTexto, enlaceMapa } from '../../../inmuebles/compartido'
import type { InmuebleVista } from '../../../inmuebles/tipos'
import type { PropsSeccion } from '../tipos'
import { MapPin } from 'lucide-react'

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
      <Tarjeta guia="lead-citas"
        titulo="Citas con el propietario"
        acciones={
          puedeAgendar && (
            <Dialogo titulo="Agendar cita" boton="+ Agendar cita" variante="exito">
              <Formulario accion={agendarCita}>
                <input type="hidden" name="lead_id" value={lead.id} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Campo etiqueta="Fecha y hora">
                    <Input type="datetime-local" name="inicio" required />
                  </Campo>
                  <Campo etiqueta="Duración (min)">
                    <Input type="number" name="duracion_min" min={15} max={480} step={15} defaultValue={60} />
                  </Campo>
                </div>
                <Campo etiqueta="Dirección">
                  <Input name="direccion" defaultValue={base.direccion} required />
                </Campo>
                <Campo etiqueta="Distrito">
                  <Input name="distrito" list={ID_DISTRITOS} defaultValue={base.distrito} />
                </Campo>
                <fieldset className="space-y-3 rounded-lg border border-border p-3">
                  <legend className="px-1 text-sm font-medium text-foreground">Consideraciones de acceso</legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Campo etiqueta="Llave">
                      <Input name="acceso_llave" defaultValue={base.acceso_llave} placeholder="La tiene el portero" />
                    </Campo>
                    <Campo etiqueta="Código">
                      <Input name="acceso_codigo" defaultValue={base.acceso_codigo} />
                    </Campo>
                  </div>
                  <Casilla name="acceso_dni" defaultChecked={base.acceso_dni} etiqueta="Piden DNI en la entrada" />
                  <Campo etiqueta="Otras">
                    <Input name="acceso_otros" defaultValue={base.acceso_otros} />
                  </Campo>
                </fieldset>
                <Campo etiqueta="Notas">
                  <Textarea name="notas" rows={2} />
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
              <li key={c.id} className="space-y-2 border-l-2 border-primary pl-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-foreground">
                    Cita {c.numero ?? ''} · {diaLargo(c.inicio)}, {hora(c.inicio)}
                  </p>
                  <Badge variant={COLOR_CITA[c.estado]}>{ESTADOS_CITA[c.estado]}</Badge>
                  {c.reprogramaciones > 0 && <Badge variant="gris">Reprogramada {c.reprogramaciones}×</Badge>}
                </div>
                <a href={enlaceMapa(c.direccion, c.distrito)} target="_blank" rel="noreferrer" className="inline-flex items-start gap-1 text-sm text-primary hover:underline">
                  <MapPin aria-hidden className="mt-0.5 size-4 shrink-0" />
                  {[c.direccion, c.distrito].filter(Boolean).join(', ')}
                </a>
                <DatosAcceso acceso={c} />
                {c.notas && <p className="text-sm whitespace-pre-wrap text-muted-foreground">{c.notas}</p>}
                {c.resultado && <p className="text-sm whitespace-pre-wrap text-foreground">Resultado: {c.resultado}</p>}
                {c.motivo_cancelacion && <p className="text-sm text-muted-foreground">Motivo: {c.motivo_cancelacion}</p>}
                {lead.vigente && (
                  <div className="flex flex-wrap gap-2">
                    <AccionesCita cita={c} compacto />
                    {c.estado === 'programada' && (
                      <Dialogo titulo="Resultado de la cita" boton="Registrar resultado" variante="default">
                        <Formulario accion={registrarResultadoCita}>
                          <input type="hidden" name="cita_id" value={c.id} />
                          <input type="hidden" name="lead_id" value={lead.id} />
                          <Campo etiqueta="Cómo fue la cita">
                            <Textarea name="resultado" rows={2} placeholder="Qué se vio, qué se acordó…" />
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
                              <Input name="direccion" defaultValue={c.direccion} required />
                            </Campo>
                            <Campo etiqueta="Distrito">
                              <Input name="distrito" list={ID_DISTRITOS} defaultValue={c.distrito ?? base.distrito} required />
                            </Campo>
                            <Campo etiqueta="Precio acordado (S/)">
                              <Input name="precio" type="number" min={1} step="0.01" defaultValue={inmueble?.precio ?? calif?.precio_esperado ?? ''} required />
                            </Campo>
                            <Campo etiqueta="Metraje (m²)">
                              <Input name="metraje" type="number" min={0} step="0.01" defaultValue={inmueble?.metraje ?? calif?.metraje ?? ''} />
                            </Campo>
                            <Campo etiqueta="Dormitorios">
                              <Input name="dormitorios" type="number" min={0} defaultValue={inmueble?.dormitorios ?? calif?.dormitorios ?? ''} />
                            </Campo>
                            <Campo etiqueta="Baños">
                              <Input name="banos" type="number" min={0} defaultValue={inmueble?.banos ?? calif?.banos ?? ''} />
                            </Campo>
                            <Campo etiqueta="Cocheras">
                              <Input name="cocheras" type="number" min={0} defaultValue={inmueble?.cocheras ?? (calif?.cochera ? 1 : 0)} />
                            </Campo>
                          </div>
                          <Casilla name="ascensor" defaultChecked={inmueble?.ascensor ?? false} etiqueta="Tiene ascensor" />
                          <Campo etiqueta="Descripción">
                            <Textarea name="descripcion" rows={2} defaultValue={inmueble?.descripcion ?? ''} />
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

      <Tarjeta guia="lead-inmueble" titulo="Inmueble">
        {inmueble ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/inmuebles/${inmueble.id}`} className="-my-2 py-2 font-medium text-primary hover:underline">
                {inmueble.codigo} · {etiqueta(TIPOS_INMUEBLE, inmueble.tipo)} en {inmueble.distrito}
              </Link>
              <Badge variant={colorEstadoInmueble(inmueble.estado)}>{ESTADOS_INMUEBLE[inmueble.estado]}</Badge>
            </div>
            <p className="text-sm text-foreground">{soles(inmueble.precio)}</p>
            <p className="text-sm text-muted-foreground">{caracteristicasTexto(inmueble)}</p>
            <Link href={`/inmuebles/${inmueble.id}`} className="-my-2 inline-block py-2 text-sm text-primary hover:underline">
              {inmueble.estado === 'en_captacion' ? 'Subir fotos y registrar el contrato' : 'Ver ficha del inmueble'}
            </Link>
          </div>
        ) : (
          <Vacio>La ficha del inmueble se crea al registrar el resultado de la primera cita.</Vacio>
        )}
      </Tarjeta>
    </div>
  )
}
