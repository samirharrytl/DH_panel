import Link from 'next/link'
import { crearClienteServidor } from '@/lib/supabase/server'
import {
  CONSERVACION,
  ESTADOS_CITA,
  ESTADOS_INMUEBLE,
  ETAPAS_CAPTACION,
  TIPOS_INMUEBLE,
  colorEstadoInmueble,
  etiqueta,
} from '@/lib/catalogos'
import { diaLargo, hora, soles } from '@/lib/formato'
import { Aviso, Campo, Casilla, Seleccion, Tarjeta, Vacio } from '@/components/campos'
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
  inmueble_id: string | null
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

const describir = (i: InmuebleVista) =>
  [i.codigo, [etiqueta(TIPOS_INMUEBLE, i.tipo), i.distrito].filter(Boolean).join(' en ')].filter(Boolean).join(' · ')

// HU-14 y HU-15: cada cita es de un inmueble; varias citas se agrupan por inmueble
export async function SeccionCitas({ lead }: PropsSeccion) {
  const supabase = await crearClienteServidor()
  const [{ data: citas }, { data: filas }] = await Promise.all([
    supabase.from('citas').select('*').eq('lead_id', lead.id).eq('tipo', 'cita_propietario').order('inicio', { ascending: false }),
    supabase.from('v_inmuebles').select('*').eq('propietario_lead_id', lead.id).order('numero'),
  ])
  const lista = (citas ?? []) as Cita[]
  const inmuebles = (filas ?? []) as InmuebleVista[]
  const enCaptacion = inmuebles.filter((i) => i.estado === 'en_captacion')
  const mapa = new Map(inmuebles.map((i) => [i.id, i]))
  const puedeAgendar = lead.vigente && lead.estado !== 'baja' && enCaptacion.length > 0
  const primero = enCaptacion[0] ?? null

  // La dirección y el acceso se proponen desde el primer inmueble en captación
  const base = {
    direccion: primero?.direccion ?? '',
    distrito: primero?.distrito ?? '',
    acceso_llave: primero?.acceso_llave ?? '',
    acceso_codigo: primero?.acceso_codigo ?? '',
    acceso_dni: primero?.acceso_dni ?? false,
    acceso_otros: primero?.acceso_otros ?? '',
  }

  const grupos = new Map<string | null, Cita[]>()
  for (const c of lista) {
    const clave = c.inmueble_id
    grupos.set(clave, [...(grupos.get(clave) ?? []), c])
  }
  const nombreGrupo = (id: string | null) => {
    const i = id ? mapa.get(id) : null
    return i ? describir(i) : 'Cita sin inmueble asignado'
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
                <Campo
                  etiqueta="Inmueble de la cita"
                  ayuda={enCaptacion.length > 1 ? 'Obligatorio: el propietario tiene varios inmuebles en captación.' : undefined}
                  falta={!primero}
                >
                  <Seleccion name="inmueble_id" defaultValue={primero?.id ?? ''} required>
                    {enCaptacion.map((i) => (
                      <option key={i.id} value={i.id}>
                        {describir(i)}
                      </option>
                    ))}
                  </Seleccion>
                </Campo>
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
        {!lead.vigente && <Aviso tipo="alerta" className="mb-3">Es un ciclo anterior del lead: solo lectura.</Aviso>}
        {lead.vigente && lead.estado !== 'baja' && enCaptacion.length === 0 && (
          <Aviso tipo="alerta" className="mb-3">
            Agrega un inmueble en captación para poder agendar la cita.{' '}
            <Link href={`/leads/${lead.id}?tab=inmuebles`} className="font-medium underline">
              Ir a Inmuebles
            </Link>
            .
          </Aviso>
        )}
        {lista.length ? (
          <div className="space-y-5">
            {[...grupos.entries()].map(([id, cs]) => {
              const i = id ? mapa.get(id) : null
              return (
                <section key={id ?? 'sin'} className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2 border-b border-border pb-1">
                    <p className="text-sm font-semibold text-foreground">{nombreGrupo(id)}</p>
                    {i?.etapa_captacion && (
                      <Badge variant="azul">{etiqueta(ETAPAS_CAPTACION, i.etapa_captacion)}</Badge>
                    )}
                    {i && (
                      <Link href={`/inmuebles/${i.id}`} className="text-xs text-primary hover:underline">
                        Ver ficha
                      </Link>
                    )}
                  </div>
                  <ul className="space-y-4">
                    {cs.map((c) => {
                      const inm = c.inmueble_id ? mapa.get(c.inmueble_id) ?? null : null
                      return (
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
                                        <Seleccion name="tipo" defaultValue={inm?.tipo ?? 'departamento'} required>
                                          {Object.entries(TIPOS_INMUEBLE).map(([k, v]) => (
                                            <option key={k} value={k}>
                                              {v}
                                            </option>
                                          ))}
                                        </Seleccion>
                                      </Campo>
                                      <Campo etiqueta="Estado del inmueble">
                                        <Seleccion name="conservacion" defaultValue={inm?.conservacion ?? ''} required>
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
                                        <Input name="distrito" list={ID_DISTRITOS} defaultValue={c.distrito ?? inm?.distrito ?? base.distrito} required />
                                      </Campo>
                                      <Campo etiqueta="Precio acordado (S/)">
                                        <Input name="precio" type="number" min={1} step="0.01" defaultValue={inm?.precio ?? inm?.precio_esperado ?? ''} required />
                                      </Campo>
                                      <Campo etiqueta="Metraje (m²)">
                                        <Input name="metraje" type="number" min={0} step="0.01" defaultValue={inm?.metraje ?? ''} />
                                      </Campo>
                                      <Campo etiqueta="Dormitorios">
                                        <Input name="dormitorios" type="number" min={0} defaultValue={inm?.dormitorios ?? ''} />
                                      </Campo>
                                      <Campo etiqueta="Baños">
                                        <Input name="banos" type="number" min={0} defaultValue={inm?.banos ?? ''} />
                                      </Campo>
                                      <Campo etiqueta="Cocheras">
                                        <Input name="cocheras" type="number" min={0} defaultValue={inm?.cocheras ?? 0} />
                                      </Campo>
                                    </div>
                                    <Casilla name="ascensor" defaultChecked={inm?.ascensor ?? false} etiqueta="Tiene ascensor" />
                                    <Campo etiqueta="Descripción">
                                      <Textarea name="descripcion" rows={2} defaultValue={inm?.descripcion ?? ''} />
                                    </Campo>
                                    <BotonEnviar>Guardar resultado</BotonEnviar>
                                  </Formulario>
                                </Dialogo>
                              )}
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </section>
              )
            })}
          </div>
        ) : (
          <Vacio>
            {puedeAgendar
              ? 'Sin citas todavía. Agenda la primera con el inmueble en captación.'
              : 'Sin citas. Agrega un inmueble en captación para agendar.'}
          </Vacio>
        )}
      </Tarjeta>

      <Tarjeta guia="lead-inmueble" titulo={`Inmuebles (${inmuebles.length})`}>
        {inmuebles.length ? (
          <ul className="space-y-3">
            {inmuebles.map((i) => (
              <li key={i.id} className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/inmuebles/${i.id}`} className="font-medium text-primary hover:underline">
                    {describir(i)}
                  </Link>
                  <Badge variant={colorEstadoInmueble(i.estado)}>{ESTADOS_INMUEBLE[i.estado]}</Badge>
                  {i.etapa_captacion && <Badge variant="azul">{etiqueta(ETAPAS_CAPTACION, i.etapa_captacion)}</Badge>}
                </div>
                <p className="text-sm text-foreground">{soles(i.precio ?? i.precio_esperado)}</p>
                <p className="text-sm text-muted-foreground">{caracteristicasTexto(i) || 'Sin características'}</p>
              </li>
            ))}
          </ul>
        ) : (
          <Vacio>
            Sin inmuebles del propietario.{' '}
            <Link href={`/leads/${lead.id}?tab=inmuebles`} className="text-primary hover:underline">
              Agregar el primero
            </Link>
            .
          </Vacio>
        )}
      </Tarjeta>
    </div>
  )
}
