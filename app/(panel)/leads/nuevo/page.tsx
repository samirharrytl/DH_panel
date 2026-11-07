import type { Metadata } from 'next'
import { exigirUsuario } from '@/lib/auth'
import { crearClienteServidor } from '@/lib/supabase/server'
import { CANALES, TIPOS_INMUEBLE, etiqueta } from '@/lib/catalogos'
import { soles } from '@/lib/formato'
import { AreaTexto, Campo, Casilla, EncabezadoPagina, Entrada, Seleccion, Tarjeta } from '@/components/ui'
import { BotonEnviar, Formulario } from '@/components/formulario'
import { registrarLead } from '../acciones'

export const metadata: Metadata = { title: 'Registrar lead' }

export default async function PaginaNuevoLead({ searchParams }: PageProps<'/leads/nuevo'>) {
  const usuario = await exigirUsuario()
  const { tipo, telefono, nombre } = await searchParams
  const supabase = await crearClienteServidor()
  const [{ data: asesores }, { data: inmuebles }] = await Promise.all([
    usuario.esAdmin ? supabase.from('perfiles').select('id, nombre').eq('activo', true).order('nombre') : { data: null },
    supabase.from('inmuebles').select('id, codigo, tipo, distrito, precio').eq('estado', 'en_cartera').order('numero'),
  ])

  return (
    <>
      <EncabezadoPagina
        titulo="Registrar lead"
        descripcion="Si el teléfono ya existe, el lead se une a ese registro y verás su historial."
        volver={{ href: '/leads', texto: 'Leads' }}
      />
      <Tarjeta className="max-w-2xl">
        <Formulario accion={registrarLead}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Teléfono (WhatsApp)" ayuda="Celular peruano de 9 dígitos o con código de país.">
              <Entrada
                name="telefono"
                type="tel"
                inputMode="tel"
                required
                placeholder="987 654 321"
                defaultValue={typeof telefono === 'string' ? telefono : ''}
              />
            </Campo>
            <Campo etiqueta="Nombre">
              <Entrada name="nombre" required defaultValue={typeof nombre === 'string' ? nombre : ''} />
            </Campo>
            <Campo etiqueta="Tipo">
              <Seleccion name="tipo" required defaultValue={typeof tipo === 'string' ? tipo : ''}>
                <option value="" disabled>
                  Elige
                </option>
                <option value="propietario">Propietario (quiere vender)</option>
                <option value="interesado">Interesado (quiere comprar)</option>
              </Seleccion>
            </Campo>
            <Campo etiqueta="Canal de origen">
              <Seleccion name="canal" required defaultValue="">
                <option value="" disabled>
                  Elige
                </option>
                {Object.entries(CANALES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Seleccion>
            </Campo>
            <Campo etiqueta="Detalle del canal" ayuda="Opcional: campaña, portal, quién lo refirió…">
              <Entrada name="canal_detalle" />
            </Campo>
            <Campo etiqueta="Correo">
              <Entrada name="email" type="email" />
            </Campo>
            <Campo etiqueta="Inmueble que mencionó" ayuda="Opcional. Personaliza la bienvenida.">
              <Seleccion name="inmueble_id" defaultValue="">
                <option value="">Ninguno</option>
                {inmuebles?.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.codigo} · {etiqueta(TIPOS_INMUEBLE, i.tipo)} en {i.distrito} · {soles(i.precio)}
                  </option>
                ))}
              </Seleccion>
            </Campo>
            <Campo etiqueta="Código de publicación" ayuda="Si llegó por un enlace de una publicación (ej. P1A2B3C).">
              <Entrada name="codigo_publicacion" className="uppercase" />
            </Campo>
            {usuario.esAdmin && (
              <Campo etiqueta="Asignar a">
                <Seleccion name="asesor_id" defaultValue={usuario.id}>
                  <option value="">Sin asignar</option>
                  {asesores?.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nombre}
                    </option>
                  ))}
                </Seleccion>
              </Campo>
            )}
          </div>
          <Campo etiqueta="Nota inicial">
            <AreaTexto name="nota" placeholder="Qué dijo, qué busca o qué quiere vender" />
          </Campo>
          <fieldset className="space-y-2 rounded-lg bg-marino-50 p-3">
            <legend className="sr-only">Consentimiento</legend>
            <p className="text-sm font-medium text-tinta">Consentimiento (Ley 29733 de Protección de Datos Personales)</p>
            <Casilla name="consentimiento_datos" etiqueta="Aceptó el uso de sus datos personales para que DepaHost lo atienda" />
            <Casilla name="consentimiento_marketing" etiqueta="Aceptó recibir novedades y marketing de DepaHost" />
          </fieldset>
          <BotonEnviar>Registrar lead</BotonEnviar>
        </Formulario>
      </Tarjeta>
    </>
  )
}
