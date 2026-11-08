import { crearClienteServidor } from '@/lib/supabase/server'
import { ESTADOS_DERIVACION, FORMAS_PAGO, IMPRESCINDIBLES, NIVELES, ORDEN_NIVEL, TIPOS_INMUEBLE, type Nivel } from '@/lib/catalogos'
import { fecha, fechaHora, hoyLima, soles } from '@/lib/formato'
import { AreaTexto, Aviso, Campo, Casilla, Dato, Entrada, Insignia, Seleccion, Tarjeta, Vacio } from '@/components/ui'
import { BotonEnviar, Dialogo, Formulario } from '@/components/formulario'
import { ID_DISTRITOS, ListaDistritos } from '../../../inmuebles/compartido'
import { actualizarDerivacion, crearDerivacion, guardarBusqueda, guardarCapacidad } from './perfil-acciones'
import type { PropsSeccion } from '../tipos'

type Busqueda = {
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

const alcanza = (actual: Nivel, exigido: Nivel) => ORDEN_NIVEL.indexOf(actual) >= ORDEN_NIVEL.indexOf(exigido)
const nivelParam = (v: unknown, defecto: Nivel) => (typeof v === 'string' && v in NIVELES ? (v as Nivel) : defecto)

// HU-19 a HU-21: perfil de búsqueda, capacidad financiera y derivación a banco o bróker
export async function SeccionPerfil({ lead }: PropsSeccion) {
  const supabase = await crearClienteServidor()
  const [{ data: b }, { data: c }, { data: derivaciones }, { data: params }] = await Promise.all([
    supabase.from('busquedas').select('*').eq('lead_id', lead.id).maybeSingle(),
    supabase.from('capacidad_financiera').select('*').eq('lead_id', lead.id).maybeSingle(),
    supabase.from('derivaciones').select('*').eq('lead_id', lead.id).order('created_at', { ascending: false }),
    supabase.from('parametros').select('clave, valor').in('clave', ['nivel_visita', 'nivel_compraventa']),
  ])
  const busqueda = b as Busqueda | null
  const capacidad = c as Capacidad | null
  const valor = new Map((params ?? []).map((p) => [p.clave, p.valor]))
  const nivel = capacidad?.nivel ?? 'no_validada'
  const exigeVisita = nivelParam(valor.get('nivel_visita'), 'declarada')
  const exigeCompra = nivelParam(valor.get('nivel_compraventa'), 'precalificada')
  const editable = lead.vigente
  const otrosImprescindibles = (busqueda?.imprescindibles ?? []).filter((x) => !IMPRESCINDIBLES.includes(x))

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ListaDistritos />
      <Tarjeta titulo="Perfil de búsqueda">
        <Formulario accion={guardarBusqueda}>
          <input type="hidden" name="lead_id" value={lead.id} />
          <fieldset disabled={!editable} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo etiqueta="Finalidad">
                <Seleccion name="finalidad" defaultValue={busqueda?.finalidad ?? ''}>
                  <option value="">Sin dato</option>
                  <option value="vivir">Vivir</option>
                  <option value="invertir">Invertir</option>
                </Seleccion>
              </Campo>
              <Campo etiqueta="Distritos" ayuda="Separados por comas. Vacío: cualquiera.">
                <Entrada name="distritos" list={ID_DISTRITOS} defaultValue={busqueda?.distritos.join(', ') ?? ''} placeholder="Miraflores, San Isidro" />
              </Campo>
            </div>
            <fieldset>
              <legend className="mb-1 text-sm font-medium text-tinta">Tipo de inmueble (vacío: cualquiera)</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {Object.entries(TIPOS_INMUEBLE).map(([k, v]) => (
                  <Casilla key={k} name="tipos" value={k} defaultChecked={busqueda?.tipos.includes(k)} etiqueta={v} />
                ))}
              </div>
            </fieldset>
            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta="Precio desde (S/)">
                <Entrada name="precio_min" type="number" min={0} step="0.01" defaultValue={busqueda?.precio_min ?? ''} />
              </Campo>
              <Campo etiqueta="Precio hasta (S/)">
                <Entrada name="precio_max" type="number" min={0} step="0.01" defaultValue={busqueda?.precio_max ?? ''} />
              </Campo>
              <Campo etiqueta="Dormitorios mínimos">
                <Entrada name="dormitorios_min" type="number" min={0} defaultValue={busqueda?.dormitorios_min ?? ''} />
              </Campo>
              <Campo etiqueta="Metraje mínimo (m²)">
                <Entrada name="metraje_min" type="number" min={0} step="0.01" defaultValue={busqueda?.metraje_min ?? ''} />
              </Campo>
            </div>
            <fieldset>
              <legend className="mb-1 text-sm font-medium text-tinta">Imprescindibles</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {IMPRESCINDIBLES.map((x) => (
                  <Casilla key={x} name="imprescindibles" value={x} defaultChecked={busqueda?.imprescindibles.includes(x)} etiqueta={x[0].toUpperCase() + x.slice(1)} />
                ))}
              </div>
            </fieldset>
            <Campo etiqueta="Otros imprescindibles" ayuda="Separados por comas.">
              <Entrada name="otros_imprescindibles" defaultValue={otrosImprescindibles.join(', ')} />
            </Campo>
            <Campo etiqueta="Notas">
              <AreaTexto name="notas" rows={2} defaultValue={busqueda?.notas ?? ''} />
            </Campo>
            {editable && <BotonEnviar>Guardar perfil</BotonEnviar>}
          </fieldset>
        </Formulario>
        {busqueda && <p className="mt-3 text-xs text-suave">Actualizado el {fechaHora(busqueda.updated_at)}</p>}
      </Tarjeta>

      <div className="space-y-4">
        <Tarjeta titulo="Capacidad financiera" acciones={<Insignia color={nivel === 'no_validada' ? 'gris' : 'verde'}>{NIVELES[nivel]}</Insignia>}>
          <ul className="mb-4 space-y-1 text-sm">
            <li>
              {alcanza(nivel, exigeVisita) ? '✅' : '⛔'} Agendar visita (exige {NIVELES[exigeVisita]})
            </li>
            <li>
              {alcanza(nivel, exigeCompra) ? '✅' : '⛔'} Iniciar la compraventa (exige {NIVELES[exigeCompra]})
            </li>
          </ul>
          <Formulario accion={guardarCapacidad}>
            <input type="hidden" name="lead_id" value={lead.id} />
            <fieldset disabled={!editable} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Campo etiqueta="Presupuesto máximo (S/)">
                  <Entrada name="presupuesto_max" type="number" min={0} step="0.01" defaultValue={capacidad?.presupuesto_max ?? ''} />
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
                  <Entrada name="cuota_inicial" type="number" min={0} step="0.01" defaultValue={capacidad?.cuota_inicial ?? ''} />
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
                <AreaTexto name="notas" rows={2} defaultValue={capacidad?.notas ?? ''} />
              </Campo>
              {editable && <BotonEnviar>Guardar capacidad</BotonEnviar>}
            </fieldset>
          </Formulario>
          {capacidad?.nivel_at && <p className="mt-3 text-xs text-suave">Nivel actualizado el {fechaHora(capacidad.nivel_at)}</p>}
        </Tarjeta>

        <Tarjeta
          titulo="Derivación a banco o bróker"
          acciones={
            editable && (
              <Dialogo titulo="Derivar a banco o bróker" boton="+ Derivar">
                <Formulario accion={crearDerivacion}>
                  <input type="hidden" name="lead_id" value={lead.id} />
                  <Campo etiqueta="Entidad">
                    <Entrada name="entidad" required placeholder="Nombre del banco o bróker" />
                  </Campo>
                  <Campo etiqueta="Tipo">
                    <Seleccion name="tipo_entidad" defaultValue="banco">
                      <option value="banco">Banco</option>
                      <option value="broker">Bróker</option>
                    </Seleccion>
                  </Campo>
                  <Campo etiqueta="Notas">
                    <AreaTexto name="notas" rows={2} />
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
                <li key={d.id} className="space-y-1 border-l-2 border-marino-200 pl-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-tinta">{d.entidad}</span>
                    <span className="text-xs text-suave">{d.tipo_entidad === 'banco' ? 'Banco' : 'Bróker'}</span>
                    <Insignia color={['precalificado', 'aprobado'].includes(d.estado) ? 'verde' : ['rechazado', 'desistio'].includes(d.estado) ? 'gris' : 'azul'}>
                      {ESTADOS_DERIVACION[d.estado]}
                    </Insignia>
                  </div>
                  <dl className="grid grid-cols-2 gap-2">
                    <Dato etiqueta="Derivado el">{fecha(d.derivado_el)}</Dato>
                    <Dato etiqueta="Respuesta">{fecha(d.respuesta_el)}</Dato>
                  </dl>
                  {d.notas && <p className="text-sm text-suave">{d.notas}</p>}
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
                          <Entrada type="date" name="respuesta_el" defaultValue={d.respuesta_el ?? hoyLima()} />
                        </Campo>
                        <Campo etiqueta="Notas">
                          <AreaTexto name="notas" rows={2} defaultValue={d.notas ?? ''} />
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

        {capacidad?.presupuesto_max && busqueda?.precio_max && busqueda.precio_max > capacidad.presupuesto_max && (
          <Aviso tipo="alerta">
            Busca hasta {soles(busqueda.precio_max)} pero su presupuesto es {soles(capacidad.presupuesto_max)}: el match excluye lo que pase su
            presupuesto.
          </Aviso>
        )}
      </div>
    </div>
  )
}
