import Link from 'next/link'
import { crearClienteServidor } from '@/lib/supabase/server'
import {
  ESTADOS_INMUEBLE,
  ETAPAS_CAPTACION,
  TIPOS_INMUEBLE,
  URGENCIAS,
  colorEstadoInmueble,
  etiqueta,
} from '@/lib/catalogos'
import { fechaHora } from '@/lib/formato'
import { Aviso, Campo, Seleccion, SiNo, Tarjeta, Vacio } from '@/components/campos'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { BotonEnviar, Dialogo, Formulario } from '@/components/formulario'
import { ID_DISTRITOS, ListaDistritos } from '../../../inmuebles/compartido'
import { editarInmueble } from '../../../inmuebles/acciones'
import type { InmuebleVista } from '../../../inmuebles/tipos'
import { agregarInmueble, guardarCaptacion } from './inmuebles-acciones'
import type { PropsSeccion } from '../tipos'

type Captacion = {
  inmueble_id: string
  rol_contacto: 'propietario' | 'encargado' | null
  tiene_poder: boolean | null
  hipoteca: boolean | null
  hipoteca_banco: string | null
  hipoteca_saldo: number | null
  urgencia: string | null
  inscrito_sunarp: boolean | null
  copropietarios: boolean | null
  copropietarios_detalle: string | null
  notas: string | null
  updated_at: string
}

const vacio = (v: unknown) => v === null || v === undefined || v === ''

// Lo que falta para tener la ficha completa de ese inmueble (la preferencia de contacto vive en la persona)
function faltantes(i: InmuebleVista, c: Captacion | null, persona: { horario_preferido: string | null; medio_contacto: string | null }) {
  const f: string[] = []
  if (vacio(i.tipo)) f.push('tipo de inmueble')
  if (vacio(i.direccion) || vacio(i.distrito)) f.push('dirección y distrito')
  if (vacio(i.metraje)) f.push('metraje')
  if (vacio(i.dormitorios)) f.push('dormitorios')
  if (vacio(i.banos)) f.push('baños')
  if (vacio(i.precio_esperado)) f.push('precio esperado')
  if (vacio(c?.rol_contacto)) f.push('rol: propietario o encargado')
  if (c?.rol_contacto === 'encargado' && vacio(c.tiene_poder)) f.push('poder o autorización para firmar')
  if (vacio(c?.hipoteca)) f.push('hipoteca')
  if (c?.hipoteca && (vacio(c.hipoteca_banco) || vacio(c.hipoteca_saldo))) f.push('banco y saldo de la hipoteca')
  if (vacio(c?.urgencia)) f.push('urgencia o plazo')
  if (vacio(c?.inscrito_sunarp)) f.push('inscripción en SUNARP')
  if (vacio(c?.copropietarios)) f.push('copropietarios')
  if (vacio(persona.medio_contacto) || vacio(persona.horario_preferido)) f.push('preferencia y horario de contacto (en Seguimiento)')
  return f
}

// El propietario puede tener varios inmuebles: cada uno lleva su ficha de captación y su etapa
export async function SeccionInmuebles({ lead }: PropsSeccion) {
  const supabase = await crearClienteServidor()
  const { data: filas } = await supabase
    .from('v_inmuebles')
    .select('*')
    .eq('propietario_lead_id', lead.id)
    .order('numero')
  const inmuebles = (filas ?? []) as InmuebleVista[]
  const { data: captaciones } = inmuebles.length
    ? await supabase
        .from('inmueble_captacion')
        .select('*')
        .in(
          'inmueble_id',
          inmuebles.map((i) => i.id),
        )
    : { data: null }
  const mapa = new Map(((captaciones ?? []) as Captacion[]).map((c) => [c.inmueble_id, c]))
  const { data: compradores } = await supabase
    .from('leads')
    .select('id, estado, persona:personas(nombre)')
    .eq('lead_venta_id', lead.id)
  const editable = lead.vigente && lead.estado !== 'baja'

  const dialogoAgregar = editable ? (
    <Dialogo titulo="Agregar inmueble" boton="+ Agregar inmueble" variante="exito">
      <Formulario accion={agregarInmueble}>
        <input type="hidden" name="lead_id" value={lead.id} />
        <p className="text-sm text-muted-foreground">
          El inmueble nace En captación. Puedes completar el tipo, la dirección y el distrito ahora o después.
        </p>
        <Campo etiqueta="Tipo de inmueble">
          <Seleccion name="tipo" defaultValue="">
            <option value="">Sin dato</option>
            {Object.entries(TIPOS_INMUEBLE).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Seleccion>
        </Campo>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Dirección" className="sm:col-span-2">
            <Input name="direccion" />
          </Campo>
          <Campo etiqueta="Distrito">
            <Input name="distrito" list={ID_DISTRITOS} />
          </Campo>
          <Campo etiqueta="Precio esperado (S/)">
            <Input name="precio_esperado" type="number" min={0} step="0.01" />
          </Campo>
        </div>
        <BotonEnviar>Agregar inmueble</BotonEnviar>
      </Formulario>
    </Dialogo>
  ) : undefined

  return (
    <div className="space-y-4">
      <ListaDistritos />
      {!!compradores?.length && (
        <Aviso tipo="info">
          {compradores.length === 1 ? 'Un interesado compra' : `${compradores.length} interesados compran`} sujeto a la venta de estos
          inmuebles:{' '}
          {compradores.map((c) => (c.persona as unknown as { nombre: string } | null)?.nombre ?? 'interesado').join(', ')}.
        </Aviso>
      )}
      <Tarjeta guia="lead-inmuebles" titulo={`Inmuebles del propietario (${inmuebles.length})`} acciones={dialogoAgregar}>
        {inmuebles.length === 0 ? (
          <Vacio>
            Sin inmuebles. Agrega el primero: la captación, las citas y la etapa se llevan por inmueble.
          </Vacio>
        ) : (
          <ul className="space-y-6">
            {inmuebles.map((i) => {
              const c = mapa.get(i.id) ?? null
              const falta = faltantes(i, c, lead.persona)
              const descripcion = [etiqueta(TIPOS_INMUEBLE, i.tipo), i.distrito].filter(Boolean).join(' en ')
              return (
                <li key={i.id} className="space-y-3 border-t border-border pt-4 first:border-0 first:pt-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/inmuebles/${i.id}`} className="font-medium text-primary hover:underline">
                      {i.codigo}
                      {descripcion ? ` · ${descripcion}` : ' · sin datos del inmueble'}
                    </Link>
                    <Badge variant={colorEstadoInmueble(i.estado)}>{ESTADOS_INMUEBLE[i.estado]}</Badge>
                    {i.etapa_captacion && (
                      <Badge variant="azul">Etapa: {etiqueta(ETAPAS_CAPTACION, i.etapa_captacion)}</Badge>
                    )}
                    <Link href={`/inmuebles/${i.id}`} className="text-xs text-primary hover:underline">
                      Ver ficha completa
                    </Link>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-lg border border-border p-3">
                      <p className="mb-2 text-sm font-medium text-foreground">Datos del inmueble</p>
                      <Formulario accion={editarInmueble}>
                        <input type="hidden" name="inmueble_id" value={i.id} />
                        <fieldset disabled={!editable} className="space-y-3">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <Campo etiqueta="Tipo">
                              <Seleccion name="tipo" defaultValue={i.tipo ?? ''}>
                                <option value="">Sin dato</option>
                                {Object.entries(TIPOS_INMUEBLE).map(([k, v]) => (
                                  <option key={k} value={k}>
                                    {v}
                                  </option>
                                ))}
                              </Seleccion>
                            </Campo>
                            <Campo etiqueta="Distrito">
                              <Input name="distrito" list={ID_DISTRITOS} defaultValue={i.distrito ?? ''} />
                            </Campo>
                            <Campo etiqueta="Dirección" className="sm:col-span-2">
                              <Input name="direccion" defaultValue={i.direccion ?? ''} />
                            </Campo>
                            <Campo etiqueta="Metraje (m²)">
                              <Input name="metraje" type="number" min={0} step="0.01" defaultValue={i.metraje ?? ''} />
                            </Campo>
                            <Campo etiqueta="Precio esperado (S/)">
                              <Input name="precio_esperado" type="number" min={0} step="0.01" defaultValue={i.precio_esperado ?? ''} />
                            </Campo>
                            <Campo etiqueta="Dormitorios">
                              <Input name="dormitorios" type="number" min={0} defaultValue={i.dormitorios ?? ''} />
                            </Campo>
                            <Campo etiqueta="Baños">
                              <Input name="banos" type="number" min={0} defaultValue={i.banos ?? ''} />
                            </Campo>
                            <Campo etiqueta="Cocheras">
                              <Input name="cocheras" type="number" min={0} defaultValue={i.cocheras} />
                            </Campo>
                          </div>
                          {editable && <BotonEnviar>Guardar datos</BotonEnviar>}
                        </fieldset>
                      </Formulario>
                    </div>

                    <div className="rounded-lg border border-border p-3">
                      <p className="mb-1 text-sm font-medium text-foreground">Ficha de captación</p>
                      <p className="mb-2 text-xs text-muted-foreground">Solo la ven el asesor del lead y el administrador.</p>
                      <Formulario accion={guardarCaptacion}>
                        <input type="hidden" name="inmueble_id" value={i.id} />
                        <input type="hidden" name="lead_id" value={lead.id} />
                        <fieldset disabled={!editable} className="space-y-3">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <Campo etiqueta="Quién es">
                              <Seleccion name="rol_contacto" defaultValue={c?.rol_contacto ?? ''}>
                                <option value="">Sin dato</option>
                                <option value="propietario">Propietario</option>
                                <option value="encargado">Encargado</option>
                              </Seleccion>
                            </Campo>
                            <Campo etiqueta="Si es encargado: poder para firmar">
                              <SiNo name="tiene_poder" valor={c?.tiene_poder} />
                            </Campo>
                            <Campo etiqueta="Hipoteca">
                              <SiNo name="hipoteca" valor={c?.hipoteca} />
                            </Campo>
                            <Campo etiqueta="Banco">
                              <Input name="hipoteca_banco" defaultValue={c?.hipoteca_banco ?? ''} />
                            </Campo>
                            <Campo etiqueta="Saldo pendiente (S/)">
                              <Input name="hipoteca_saldo" type="number" min={0} step="0.01" defaultValue={c?.hipoteca_saldo ?? ''} />
                            </Campo>
                            <Campo etiqueta="Urgencia o plazo">
                              <Seleccion name="urgencia" defaultValue={c?.urgencia ?? ''}>
                                <option value="">Sin dato</option>
                                {Object.entries(URGENCIAS).map(([k, v]) => (
                                  <option key={k} value={k}>
                                    {v}
                                  </option>
                                ))}
                              </Seleccion>
                            </Campo>
                            <Campo etiqueta="Inscrito en SUNARP">
                              <SiNo name="inscrito_sunarp" valor={c?.inscrito_sunarp} />
                            </Campo>
                            <Campo etiqueta="Copropietarios">
                              <SiNo name="copropietarios" valor={c?.copropietarios} />
                            </Campo>
                          </div>
                          <Campo etiqueta="Si hay copropietarios: quiénes y si están de acuerdo">
                            <Input name="copropietarios_detalle" defaultValue={c?.copropietarios_detalle ?? ''} />
                          </Campo>
                          <Campo etiqueta="Notas">
                            <Textarea name="notas" rows={2} defaultValue={c?.notas ?? ''} />
                          </Campo>
                          {editable && <BotonEnviar>Guardar ficha</BotonEnviar>}
                        </fieldset>
                      </Formulario>
                      {c && <p className="mt-2 text-xs text-muted-foreground">Actualizada el {fechaHora(c.updated_at)}</p>}
                    </div>
                  </div>

                  {falta.length ? (
                    <Aviso tipo="alerta">Faltan {falta.length} datos: {falta.join(', ')}.</Aviso>
                  ) : (
                    <Aviso tipo="exito">Ficha completa.</Aviso>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Tarjeta>
    </div>
  )
}
