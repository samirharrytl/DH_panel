import { crearClienteServidor } from '@/lib/supabase/server'
import { TIPOS_INMUEBLE, URGENCIAS } from '@/lib/catalogos'
import { fechaHora } from '@/lib/formato'
import { AreaTexto, Aviso, Campo, Entrada, Seleccion, SiNo, Tarjeta } from '@/components/legado'
import { BotonEnviar, Formulario } from '@/components/formulario'
import { ID_DISTRITOS, ListaDistritos } from '../../../inmuebles/compartido'
import { guardarCalificacion } from './calificacion-acciones'
import type { PropsSeccion } from '../tipos'

type Calificacion = {
  rol_contacto: 'propietario' | 'encargado' | null
  tiene_poder: boolean | null
  hipoteca: boolean | null
  hipoteca_banco: string | null
  hipoteca_saldo: number | null
  tipo_inmueble: string | null
  direccion: string | null
  distrito: string | null
  metraje: number | null
  dormitorios: number | null
  banos: number | null
  cochera: boolean | null
  precio_esperado: number | null
  urgencia: string | null
  inscrito_sunarp: boolean | null
  copropietarios: boolean | null
  copropietarios_detalle: string | null
  notas: string | null
  updated_at: string
}

const vacio = (v: unknown) => v === null || v === undefined || v === ''

// Datos del Módulo 1.2 que faltan. La preferencia y el horario de contacto viven en la persona.
function faltantes(q: Partial<Calificacion> | null, persona: { horario_preferido: string | null; medio_contacto: string | null }) {
  const c = q ?? {}
  const f: string[] = []
  if (vacio(c.rol_contacto)) f.push('Rol: propietario o encargado')
  if (c.rol_contacto === 'encargado' && vacio(c.tiene_poder)) f.push('Poder o autorización para firmar')
  if (vacio(c.hipoteca)) f.push('Hipoteca')
  if (c.hipoteca && (vacio(c.hipoteca_banco) || vacio(c.hipoteca_saldo))) f.push('Banco y saldo de la hipoteca')
  if (vacio(c.tipo_inmueble)) f.push('Tipo de inmueble')
  if (vacio(c.direccion) || vacio(c.distrito)) f.push('Dirección y distrito')
  if (vacio(c.metraje)) f.push('Metraje')
  if (vacio(c.dormitorios)) f.push('Dormitorios')
  if (vacio(c.banos)) f.push('Baños')
  if (vacio(c.cochera)) f.push('Cochera')
  if (vacio(c.precio_esperado)) f.push('Precio esperado')
  if (vacio(c.urgencia)) f.push('Urgencia o plazo')
  if (vacio(c.inscrito_sunarp)) f.push('Inscripción en SUNARP')
  if (vacio(c.copropietarios)) f.push('Copropietarios')
  if (vacio(persona.medio_contacto) || vacio(persona.horario_preferido)) f.push('Preferencia y horario de contacto (en Seguimiento → Contacto)')
  return f
}

export async function SeccionCalificacion({ lead }: PropsSeccion) {
  const supabase = await crearClienteServidor()
  const { data } = await supabase.from('calificacion_propietario').select('*').eq('lead_id', lead.id).maybeSingle()
  const q = data as Calificacion | null
  const falta = faltantes(q, lead.persona)
  const f = (v: unknown) => vacio(v)

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Tarjeta titulo="Calificación del propietario">
        <ListaDistritos />
        <Formulario accion={guardarCalificacion}>
          <input type="hidden" name="lead_id" value={lead.id} />
          <fieldset disabled={!lead.vigente} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo etiqueta="Quién es" falta={f(q?.rol_contacto)}>
                <Seleccion name="rol_contacto" defaultValue={q?.rol_contacto ?? ''}>
                  <option value="">Sin dato</option>
                  <option value="propietario">Propietario</option>
                  <option value="encargado">Encargado</option>
                </Seleccion>
              </Campo>
              <Campo etiqueta="Si es encargado: ¿tiene poder para firmar?" falta={q?.rol_contacto === 'encargado' && f(q?.tiene_poder)}>
                <SiNo name="tiene_poder" valor={q?.tiene_poder} />
              </Campo>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Campo etiqueta="Hipoteca" falta={f(q?.hipoteca)}>
                <SiNo name="hipoteca" valor={q?.hipoteca} />
              </Campo>
              <Campo etiqueta="Banco" falta={!!q?.hipoteca && f(q?.hipoteca_banco)}>
                <Entrada name="hipoteca_banco" defaultValue={q?.hipoteca_banco ?? ''} />
              </Campo>
              <Campo etiqueta="Saldo pendiente (S/)" falta={!!q?.hipoteca && f(q?.hipoteca_saldo)}>
                <Entrada name="hipoteca_saldo" type="number" min={0} step="0.01" defaultValue={q?.hipoteca_saldo ?? ''} />
              </Campo>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Campo etiqueta="Tipo de inmueble" falta={f(q?.tipo_inmueble)}>
                <Seleccion name="tipo_inmueble" defaultValue={q?.tipo_inmueble ?? ''}>
                  <option value="">Sin dato</option>
                  {Object.entries(TIPOS_INMUEBLE).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Seleccion>
              </Campo>
              <Campo etiqueta="Dirección" falta={f(q?.direccion)} className="sm:col-span-2">
                <Entrada name="direccion" defaultValue={q?.direccion ?? ''} />
              </Campo>
              <Campo etiqueta="Distrito" falta={f(q?.distrito)}>
                <Entrada name="distrito" list={ID_DISTRITOS} defaultValue={q?.distrito ?? ''} />
              </Campo>
              <Campo etiqueta="Metraje (m²)" falta={f(q?.metraje)}>
                <Entrada name="metraje" type="number" min={0} step="0.01" defaultValue={q?.metraje ?? ''} />
              </Campo>
              <Campo etiqueta="Precio esperado (S/)" falta={f(q?.precio_esperado)}>
                <Entrada name="precio_esperado" type="number" min={0} step="0.01" defaultValue={q?.precio_esperado ?? ''} />
              </Campo>
              <Campo etiqueta="Dormitorios" falta={f(q?.dormitorios)}>
                <Entrada name="dormitorios" type="number" min={0} defaultValue={q?.dormitorios ?? ''} />
              </Campo>
              <Campo etiqueta="Baños" falta={f(q?.banos)}>
                <Entrada name="banos" type="number" min={0} defaultValue={q?.banos ?? ''} />
              </Campo>
              <Campo etiqueta="Cochera" falta={f(q?.cochera)}>
                <SiNo name="cochera" valor={q?.cochera} />
              </Campo>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Campo etiqueta="Urgencia o plazo" falta={f(q?.urgencia)}>
                <Seleccion name="urgencia" defaultValue={q?.urgencia ?? ''}>
                  <option value="">Sin dato</option>
                  {Object.entries(URGENCIAS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Seleccion>
              </Campo>
              <Campo etiqueta="Inscrito en SUNARP" falta={f(q?.inscrito_sunarp)}>
                <SiNo name="inscrito_sunarp" valor={q?.inscrito_sunarp} />
              </Campo>
              <Campo etiqueta="Copropietarios" falta={f(q?.copropietarios)}>
                <SiNo name="copropietarios" valor={q?.copropietarios} />
              </Campo>
            </div>
            <Campo etiqueta="Si hay copropietarios: quiénes y si están de acuerdo">
              <Entrada name="copropietarios_detalle" defaultValue={q?.copropietarios_detalle ?? ''} />
            </Campo>
            <Campo etiqueta="Notas">
              <AreaTexto name="notas" defaultValue={q?.notas ?? ''} />
            </Campo>
            {lead.vigente && <BotonEnviar>Guardar calificación</BotonEnviar>}
          </fieldset>
        </Formulario>
        {q && <p className="mt-3 text-xs text-suave">Actualizada el {fechaHora(q.updated_at)}</p>}
      </Tarjeta>

      <Tarjeta titulo={falta.length ? `Faltan ${falta.length} datos` : 'Datos completos'}>
        {falta.length ? (
          <ul className="list-disc space-y-1 pl-5 text-sm text-tinta">
            {falta.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        ) : (
          <Aviso tipo="exito">Tienes todo lo necesario para agendar la cita.</Aviso>
        )}
      </Tarjeta>
    </div>
  )
}
