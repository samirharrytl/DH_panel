import { crearClienteServidor } from '@/lib/supabase/server'
import {
  ESTADOS_DERIVACION,
  ESTADOS_INMUEBLE,
  ESTADOS_LEAD,
  FORMAS_PAGO,
  IMPRESCINDIBLES,
  NIVELES,
  ORDEN_NIVEL,
  TIPOS_INMUEBLE,
  etiqueta,
  type EstadoInmueble,
  type EstadoLead,
  type Nivel,
} from '@/lib/catalogos'
import { fecha, fechaHora, hoyLima, soles } from '@/lib/formato'
import { Aviso, Campo, Casilla, Dato, Seleccion, Tarjeta, Vacio } from '@/components/campos'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { BotonAccion, BotonEnviar, Dialogo, Formulario } from '@/components/formulario'
import { ID_DISTRITOS, ListaDistritos } from '../../../inmuebles/compartido'
import { actualizarDerivacion, cambiarBusquedaActiva, crearDerivacion, guardarBusqueda, guardarCapacidad, vincularVenta } from './perfil-acciones'
import type { PropsSeccion } from '../tipos'
import { Habilita } from '@/components/campos'

type Busqueda = {
  id: string
  nombre: string
  activa: boolean
  cumplida_at: string | null
  finalidad: 'vivir' | 'invertir' | null
  distritos: string[]
  tipos: string[]
  precio_min: number | null
  precio_max: number | null
  dormitorios_min: number | null
  metraje_min: number | null
  imprescindibles: string[]
  notas: string | null
  updated_at: string
}
type Capacidad = {
  presupuesto_max: number | null
  forma_pago: keyof typeof FORMAS_PAGO | null
  cuota_inicial: number | null
  precalificacion: boolean
  mivivienda: boolean
  techo_propio: boolean
  nivel: Nivel
  nivel_at: string | null
  notas: string | null
}
type Derivacion = {
  id: string
  entidad: string
  tipo_entidad: 'banco' | 'broker'
  estado: keyof typeof ESTADOS_DERIVACION
  derivado_el: string
  respuesta_el: string | null
  notas: string | null
}
type VentaLead = {
  id: string
  estado: EstadoLead
  inmuebles: { codigo: string; estado: EstadoInmueble; etapa_captacion: string | null }[]
}

const alcanza = (actual: Nivel, exigido: Nivel) => ORDEN_NIVEL.indexOf(actual) >= ORDEN_NIVEL.indexOf(exigido)
const nivelParam = (v: unknown, defecto: Nivel) => (typeof v === 'string' && v in NIVELES ? (v as Nivel) : defecto)
const resumenBusqueda = (b: Busqueda) => {
  const partes = [
    b.tipos.length ? b.tipos.map((t) => etiqueta(TIPOS_INMUEBLE, t)).join(' o ') : null,
    b.distritos.length ? b.distritos.join(', ') : null,
    b.precio_min !== null || b.precio_max !== null
      ? `${b.precio_min !== null ? `desde ${soles(b.precio_min)}` : ''}${b.precio_min !== null && b.precio_max !== null ? ' ' : ''}${
          b.precio_max !== null ? `hasta ${soles(b.precio_max)}` : ''
        }`
      : null,
    b.dormitorios_min !== null ? `${b.dormitorios_min}+ dorm.` : null,
    b.metraje_min !== null ? `desde ${b.metraje_min} m²` : null,
  ]
  return partes.filter(Boolean).join(' · ') || 'Sin filtros: cualquier inmueble'
}

function FormularioBusqueda({ leadId, busqueda, editable }: { leadId: string; busqueda: Busqueda | null; editable: boolean }) {
  const otrosImprescindibles = (busqueda?.imprescindibles ?? []).filter((x) => !IMPRESCINDIBLES.includes(x))
  return (
    <Formulario accion={guardarBusqueda}>
      <input type="hidden" name="lead_id" value={leadId} />
      {busqueda && <input type="hidden" name="busqueda_id" value={busqueda.id} />}
      <fieldset disabled={!editable} className="space-y-4">
        <Campo etiqueta="Nombre de la búsqueda" ayuda="Por ejemplo: «Depa para vivir» o «Terreno para invertir».">
          <Input name="nombre" defaultValue={busqueda?.nombre ?? ''} required placeholder="Depa para vivir" />
        </Campo>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Finalidad">
            <Seleccion name="finalidad" defaultValue={busqueda?.finalidad ?? ''}>
              <option value="">Sin dato</option>
              <option value="vivir">Vivir</option>
              <option value="invertir">Invertir</option>
            </Seleccion>
          </Campo>
          <Campo etiqueta="Distritos" ayuda="Separados por comas. Vacío: cualquiera.">
            <Input name="distritos" list={ID_DISTRITOS} defaultValue={busqueda?.distritos.join(', ') ?? ''} placeholder="Miraflores, San Isidro" />
          </Campo>
        </div>
        <fieldset>
          <legend className="mb-1 text-sm font-medium text-foreground">Tipo de inmueble (vacío: cualquiera)</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {Object.entries(TIPOS_INMUEBLE).map(([k, v]) => (
              <Casilla key={k} name="tipos" value={k} defaultChecked={busqueda?.tipos.includes(k)} etiqueta={v} />
            ))}
          </div>
        </fieldset>
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Precio desde (S/)">
            <Input name="precio_min" type="number" min={0} step="0.01" defaultValue={busqueda?.precio_min ?? ''} />
          </Campo>
          <Campo etiqueta="Precio hasta (S/)">
            <Input name="precio_max" type="number" min={0} step="0.01" defaultValue={busqueda?.precio_max ?? ''} />
          </Campo>
          <Campo etiqueta="Dormitorios mínimos">
            <Input name="dormitorios_min" type="number" min={0} defaultValue={busqueda?.dormitorios_min ?? ''} />
          </Campo>
          <Campo etiqueta="Metraje mínimo (m²)">
            <Input name="metraje_min" type="number" min={0} step="0.01" defaultValue={busqueda?.metraje_min ?? ''} />
          </Campo>
        </div>
        <fieldset>
          <legend className="mb-1 text-sm font-medium text-foreground">Imprescindibles</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {IMPRESCINDIBLES.map((x) => (
              <Casilla key={x} name="imprescindibles" value={x} defaultChecked={busqueda?.imprescindibles.includes(x)} etiqueta={x[0].toUpperCase() + x.slice(1)} />
            ))}
          </div>
        </fieldset>
        <Campo etiqueta="Otros imprescindibles" ayuda="Separados por comas.">
          <Input name="otros_imprescindibles" defaultValue={otrosImprescindibles.join(', ')} />
        </Campo>
        <Campo etiqueta="Notas">
          <Textarea name="notas" rows={2} defaultValue={busqueda?.notas ?? ''} />
        </Campo>
        {editable && <BotonEnviar>{busqueda ? 'Guardar búsqueda' : 'Agregar búsqueda'}</BotonEnviar>}
      </fieldset>
    </Formulario>
  )
}

function resumenVenta(v: VentaLead) {
  const inmuebles = v.inmuebles.length
    ? v.inmuebles.map((i) => `${i.codigo} (${ESTADOS_INMUEBLE[i.estado]})`).join(', ')
    : 'sin inmuebles abiertos'
  return `${ESTADOS_LEAD[v.estado]} · ${inmuebles}`
}

// HU-19 a HU-21: búsquedas del interesado, capacidad financiera, derivación y vende para comprar
export async function SeccionPerfil({ lead }: PropsSeccion) {
  const supabase = await crearClienteServidor()
  const [{ data: bs }, { data: c }, { data: derivaciones }, { data: params }] = await Promise.all([
    supabase.from('busquedas').select('*').eq('lead_id', lead.id).order('activa', { ascending: false }).order('updated_at', { ascending: false }),
    supabase.from('capacidad_financiera').select('*').eq('lead_id', lead.id).maybeSingle(),
    supabase.from('derivaciones').select('*').eq('lead_id', lead.id).order('created_at', { ascending: false }),
    supabase.from('parametros').select('clave, valor').in('clave', ['nivel_visita', 'nivel_compraventa']),
  ])
  const [{ data: propios }, { data: venta }] = await Promise.all([
    supabase
      .from('leads')
      .select('id, estado, inmuebles:inmuebles!inmuebles_propietario_lead_id_fkey(codigo, estado, etapa_captacion)')
      .eq('persona_id', lead.persona_id)
      .eq('tipo', 'propietario')
      .eq('vigente', true),
    lead.lead_venta_id
      ? supabase
          .from('leads')
          .select('id, estado, inmuebles:inmuebles!inmuebles_propietario_lead_id_fkey(codigo, estado, etapa_captacion)')
          .eq('id', lead.lead_venta_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const busquedas = (bs ?? []) as Busqueda[]
  const leadsVenta = (propios ?? []) as unknown as VentaLead[]
  const leadVenta = venta as unknown as VentaLead | null
  const capacidad = c as Capacidad | null
  const valor = new Map((params ?? []).map((p) => [p.clave, p.valor]))
  const nivel = capacidad?.nivel ?? 'no_validada'
  const exigeVisita = nivelParam(valor.get('nivel_visita'), 'declarada')
  const exigeCompra = nivelParam(valor.get('nivel_compraventa'), 'precalificada')
  const editable = lead.vigente

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ListaDistritos />
      <div className="space-y-4">
        <Tarjeta
          guia="lead-perfil"
          titulo={`Búsquedas (${busquedas.length})`}
          acciones={
            editable && (
              <Dialogo titulo="Agregar búsqueda" boton="+ Agregar búsqueda" variante="exito">
                <FormularioBusqueda leadId={lead.id} busqueda={null} editable />
              </Dialogo>
            )
          }
        >
          <p className="mb-3 text-xs text-muted-foreground">
            Cada búsqueda es un negocio distinto. El match usa la búsqueda activa que mejor puntaje le dé al inmueble.
          </p>
          {busquedas.length ? (
            <ul className="space-y-3">
              {busquedas.map((b) => (
                <li key={b.id} className="space-y-2 rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-foreground">{b.nombre}</p>
                    {b.activa ? (
                      <Badge variant="verde">Activa</Badge>
                    ) : b.cumplida_at ? (
                      <Badge variant="marino">Cumplida</Badge>
                    ) : (
                      <Badge variant="gris">Inactiva</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{resumenBusqueda(b)}</p>
                  {b.notas && <p className="text-sm whitespace-pre-wrap text-muted-foreground">{b.notas}</p>}
                  {capacidad?.presupuesto_max && b.precio_max && b.precio_max > capacidad.presupuesto_max && (
                    <Aviso tipo="alerta">
                      Busca hasta {soles(b.precio_max)} pero su presupuesto es {soles(capacidad.presupuesto_max)}: el match excluye lo que pase su
                      presupuesto.
                    </Aviso>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    {editable && (
                      <Dialogo titulo={`Editar «${b.nombre}»`} boton="Editar">
                        <FormularioBusqueda leadId={lead.id} busqueda={b} editable />
                      </Dialogo>
                    )}
                    {editable && (
                      <BotonAccion
                        accion={cambiarBusquedaActiva.bind(null, b.id, lead.id, !b.activa)}
                        variante="ghost"
                        confirmar={b.activa ? `¿Desactivar la búsqueda «${b.nombre}»?` : undefined}
                      >
                        {b.activa ? 'Desactivar' : 'Reactivar'}
                      </BotonAccion>
                    )}
                    <span className="text-xs text-muted-foreground">Actualizada el {fechaHora(b.updated_at)}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Vacio>Sin búsquedas. Agrega la primera para que el match tenga con qué comparar.</Vacio>
          )}
        </Tarjeta>

        <Tarjeta titulo="Vende para comprar">
          <p className="mb-3 text-sm text-muted-foreground">
            Si la compra depende de vender el inmueble del mismo propietario, marca aquí esa venta. Se ve en los dos leads.
          </p>
          {leadsVenta.length ? (
            <Formulario accion={vincularVenta}>
              <input type="hidden" name="lead_id" value={lead.id} />
              <Campo etiqueta="Venta que condiciona la compra">
                <Seleccion name="lead_venta_id" defaultValue={lead.lead_venta_id ?? ''}>
                  <option value="">Ninguno</option>
                  {leadsVenta.map((v) => (
                    <option key={v.id} value={v.id}>
                      {resumenVenta(v)}
                    </option>
                  ))}
                </Seleccion>
              </Campo>
              {editable && <BotonEnviar>Guardar vínculo</BotonEnviar>}
            </Formulario>
          ) : (
            <Vacio>
              Para vincular la compra con una venta, registra también como propietario a la misma persona.
            </Vacio>
          )}
          {leadVenta && (
            <Aviso tipo="info" className="mt-3">
              Compra sujeta a la venta de{' '}
              {leadVenta.inmuebles.length
                ? leadVenta.inmuebles.map((i) => `${i.codigo} (${ESTADOS_INMUEBLE[i.estado]})`).join(', ')
                : 'un inmueble que ya no está abierto'}
              .
            </Aviso>
          )}
        </Tarjeta>
      </div>

      <div className="space-y-4">
        <Tarjeta guia="lead-capacidad" titulo="Capacidad financiera" acciones={<Badge variant={nivel === 'no_validada' ? 'gris' : 'verde'}>{NIVELES[nivel]}</Badge>}>
          <ul className="mb-4 space-y-1 text-sm">
            <li>
              <Habilita si={alcanza(nivel, exigeVisita)}>Agendar visita (exige {NIVELES[exigeVisita]})</Habilita>
            </li>
            <li>
              <Habilita si={alcanza(nivel, exigeCompra)}>Iniciar la compraventa (exige {NIVELES[exigeCompra]})</Habilita>
            </li>
          </ul>
          <Formulario accion={guardarCapacidad}>
            <input type="hidden" name="lead_id" value={lead.id} />
            <fieldset disabled={!editable} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Campo etiqueta="Presupuesto máximo (S/)">
                  <Input name="presupuesto_max" type="number" min={0} step="0.01" defaultValue={capacidad?.presupuesto_max ?? ''} />
                </Campo>
                <Campo etiqueta="Forma de pago">
                  <Seleccion name="forma_pago" defaultValue={capacidad?.forma_pago ?? ''}>
                    <option value="">Sin dato</option>
                    {Object.entries(FORMAS_PAGO).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Seleccion>
                </Campo>
                <Campo etiqueta="Cuota inicial disponible (S/)">
                  <Input name="cuota_inicial" type="number" min={0} step="0.01" defaultValue={capacidad?.cuota_inicial ?? ''} />
                </Campo>
                <Campo etiqueta="Nivel" ayuda="Con presupuesto y forma de pago sube solo a Declarada.">
                  <Seleccion name="nivel" defaultValue={nivel}>
                    {Object.entries(NIVELES).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Seleccion>
                </Campo>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                <Casilla name="precalificacion" defaultChecked={capacidad?.precalificacion} etiqueta="Tiene precalificación bancaria" />
                <Casilla name="mivivienda" defaultChecked={capacidad?.mivivienda} etiqueta="Aplica a Fondo MiVivienda" />
                <Casilla name="techo_propio" defaultChecked={capacidad?.techo_propio} etiqueta="Aplica a Techo Propio" />
              </div>
              <Campo etiqueta="Notas">
                <Textarea name="notas" rows={2} defaultValue={capacidad?.notas ?? ''} />
              </Campo>
              {editable && <BotonEnviar>Guardar capacidad</BotonEnviar>}
            </fieldset>
          </Formulario>
          {capacidad?.nivel_at && <p className="mt-3 text-xs text-muted-foreground">Nivel actualizado el {fechaHora(capacidad.nivel_at)}</p>}
        </Tarjeta>

        <Tarjeta
          titulo="Derivación a banco o bróker"
          acciones={
            editable && (
              <Dialogo titulo="Derivar a banco o bróker" boton="+ Derivar">
                <Formulario accion={crearDerivacion}>
                  <input type="hidden" name="lead_id" value={lead.id} />
                  <Campo etiqueta="Entidad">
                    <Input name="entidad" required placeholder="Nombre del banco o bróker" />
                  </Campo>
                  <Campo etiqueta="Tipo">
                    <Seleccion name="tipo_entidad" defaultValue="banco">
                      <option value="banco">Banco</option>
                      <option value="broker">Bróker</option>
                    </Seleccion>
                  </Campo>
                  <Campo etiqueta="Notas">
                    <Textarea name="notas" rows={2} />
                  </Campo>
                  <BotonEnviar>Registrar derivación</BotonEnviar>
                </Formulario>
              </Dialogo>
            )
          }
        >
          {capacidad?.forma_pago && capacidad.forma_pago !== 'contado' && !alcanza(nivel, 'precalificada') && !derivaciones?.length && (
            <Aviso tipo="alerta" className="mb-3">
              Paga con crédito y no tiene precalificación: derívalo a un banco o bróker aliado.
            </Aviso>
          )}
          {derivaciones?.length ? (
            <ul className="space-y-3">
              {(derivaciones as Derivacion[]).map((d) => (
                <li key={d.id} className="space-y-1 border-l-2 border-primary pl-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">{d.entidad}</span>
                    <span className="text-xs text-muted-foreground">{d.tipo_entidad === 'banco' ? 'Banco' : 'Bróker'}</span>
                    <Badge variant={['precalificado', 'aprobado'].includes(d.estado) ? 'verde' : ['rechazado', 'desistio'].includes(d.estado) ? 'gris' : 'azul'}>
                      {ESTADOS_DERIVACION[d.estado]}
                    </Badge>
                  </div>
                  <dl className="grid grid-cols-2 gap-2">
                    <Dato etiqueta="Derivado el">{fecha(d.derivado_el)}</Dato>
                    <Dato etiqueta="Respuesta">{fecha(d.respuesta_el)}</Dato>
                  </dl>
                  {d.notas && <p className="text-sm text-muted-foreground">{d.notas}</p>}
                  {editable && (
                    <Dialogo titulo={`Evaluación en ${d.entidad}`} boton="Actualizar estado">
                      <Formulario accion={actualizarDerivacion}>
                        <input type="hidden" name="lead_id" value={lead.id} />
                        <input type="hidden" name="derivacion_id" value={d.id} />
                        <Campo etiqueta="Estado" ayuda="Precalificado o aprobado sube el nivel financiero.">
                          <Seleccion name="estado" defaultValue={d.estado}>
                            {Object.entries(ESTADOS_DERIVACION).map(([k, v]) => (
                              <option key={k} value={k}>
                                {v}
                              </option>
                            ))}
                          </Seleccion>
                        </Campo>
                        <Campo etiqueta="Fecha de respuesta">
                          <Input type="date" name="respuesta_el" defaultValue={d.respuesta_el ?? hoyLima()} />
                        </Campo>
                        <Campo etiqueta="Notas">
                          <Textarea name="notas" rows={2} defaultValue={d.notas ?? ''} />
                        </Campo>
                        <BotonEnviar>Guardar</BotonEnviar>
                      </Formulario>
                    </Dialogo>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <Vacio>Sin derivaciones. Aún no hay socios definidos: registra el banco o bróker que uses.</Vacio>
          )}
        </Tarjeta>
      </div>
    </div>
  )
}
