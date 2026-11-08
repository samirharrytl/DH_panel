'use client'

import Link from 'next/link'
import { AreaTexto, Aviso, Campo, Casilla, Entrada } from '@/components/ui'
import { BotonEnviar, Dialogo, Formulario } from '@/components/formulario'
import { registrarPublicacion } from './acciones'

// HU-28: confirmar la publicación del día con sus redes, fecha y texto. Al terminar lleva a la lista de
// publicaciones, donde cada red tiene su enlace de WhatsApp y el texto listo para copiar (HU-29).
export function RegistrarPublicacion({
  inmueble,
  texto,
  redes,
  hoy,
  destino,
  esAdmin,
  variante = 'secundario',
  tamano = 'sm',
}: {
  inmueble: { id: string; codigo: string; descripcion: string }
  texto: string
  redes: string[]
  hoy: string
  destino?: string
  esAdmin: boolean
  variante?: 'primario' | 'secundario'
  tamano?: 'sm' | 'md'
}) {
  return (
    <Dialogo titulo={`Registrar publicación · ${inmueble.codigo}`} boton="Registrar publicación" variante={variante} tamano={tamano}>
      <Formulario
        accion={registrarPublicacion}
        alTerminar={() => {
          if (!destino) return
          window.setTimeout(() => document.getElementById(destino)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150)
        }}
      >
        <input type="hidden" name="inmueble_id" value={inmueble.id} />
        <p className="text-sm text-suave">{inmueble.descripcion}</p>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-tinta">¿Dónde lo publicaste?</legend>
          {redes.length ? (
            <div className="grid grid-cols-2 gap-2">
              {redes.map((r) => (
                <Casilla key={r} name="redes" value={r} defaultChecked etiqueta={r} />
              ))}
            </div>
          ) : (
            <Aviso tipo="alerta">
              No hay redes configuradas.{' '}
              {esAdmin ? (
                <Link href="/configuracion/parametros" className="font-medium underline">
                  Agrégalas en Configuración → Parámetros
                </Link>
              ) : (
                'Pídele al administrador que las agregue en Configuración → Parámetros.'
              )}
            </Aviso>
          )}
        </fieldset>
        <Campo etiqueta="Fecha de publicación">
          <Entrada type="date" name="fecha" defaultValue={hoy} max={hoy} required />
        </Campo>
        <Campo
          etiqueta="Texto de la publicación"
          ayuda="Muestra la zona, nunca la dirección exacta. Cada red recibe su propio enlace de WhatsApp al final del texto."
        >
          <AreaTexto name="texto" defaultValue={texto} rows={9} />
        </Campo>
        <BotonEnviar>Confirmar publicación</BotonEnviar>
      </Formulario>
    </Dialogo>
  )
}
