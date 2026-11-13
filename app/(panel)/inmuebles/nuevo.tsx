'use client'

import { useRouter } from 'next/navigation'
import { CANALES, TIPOS_INMUEBLE } from '@/lib/catalogos'
import { Campo, Casilla, Seleccion } from '@/components/campos'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { BotonEnviar, Dialogo, Formulario } from '@/components/formulario'
import { registrarInmueble } from './acciones'
import { ID_DISTRITOS } from './compartido'
import { CamposContrato } from './[id]/contrato'

// Registro directo de un inmueble con contrato firmado. Al guardar abre su ficha para subir las fotos.
export function NuevoInmueble({ hoy }: { hoy: string }) {
  const router = useRouter()
  return (
    <Dialogo titulo="Nuevo inmueble" boton="Nuevo inmueble" variante="exito" ancho="sm:max-w-2xl">
      <Formulario
        accion={registrarInmueble}
        alTerminar={(r) => {
          if (typeof r.datos?.id === 'string') router.push(`/inmuebles/${r.datos.id}`)
        }}
      >
        <p className="text-sm font-medium text-foreground">Propietario</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Teléfono (WhatsApp)" ayuda="Si ya existe, se une a su registro.">
            <Input name="telefono" type="tel" inputMode="tel" required placeholder="987 654 321" />
          </Campo>
          <Campo etiqueta="Nombre">
            <Input name="nombre" required />
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
        </div>
        <Casilla name="consentimiento_datos" etiqueta="Aceptó el uso de sus datos personales (Ley 29733)" />

        <p className="text-sm font-medium text-foreground">Inmueble</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Tipo">
            <Seleccion name="tipo" required defaultValue="departamento">
              {Object.entries(TIPOS_INMUEBLE).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Seleccion>
          </Campo>
          <Campo etiqueta="Precio de venta (S/)">
            <Input name="precio" type="number" min={1} step="0.01" required />
          </Campo>
          <Campo etiqueta="Dirección" ayuda="No se publica: el sitio web muestra solo el distrito." className="sm:col-span-2">
            <Input name="direccion" required />
          </Campo>
          <Campo etiqueta="Distrito">
            <Input name="distrito" list={ID_DISTRITOS} required />
          </Campo>
          <Campo etiqueta="Metraje (m²)">
            <Input name="metraje" type="number" min={0} step="0.01" />
          </Campo>
          <Campo etiqueta="Dormitorios">
            <Input name="dormitorios" type="number" min={0} />
          </Campo>
          <Campo etiqueta="Baños">
            <Input name="banos" type="number" min={0} />
          </Campo>
          <Campo etiqueta="Cocheras">
            <Input name="cocheras" type="number" min={0} defaultValue={0} />
          </Campo>
        </div>
        <Campo etiqueta="Descripción" ayuda="Se publica en el sitio web: no pongas la dirección exacta.">
          <Textarea name="descripcion" rows={3} />
        </Campo>

        <p className="text-sm font-medium text-foreground">Contrato firmado</p>
        <CamposContrato hoy={hoy} />
        <BotonEnviar>Registrar inmueble</BotonEnviar>
      </Formulario>
    </Dialogo>
  )
}
