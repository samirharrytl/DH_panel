import type { Metadata } from 'next'
import { crearClienteServidor } from '@/lib/supabase/server'
import { variablesEnOrden } from '@/lib/plantillas'
import { Tarjeta } from '@/components/campos'
import { Badge } from '@/components/ui/badge'
import { BotonAccion } from '@/components/formulario'
import { guardarPlantilla, restablecerPlantilla } from './acciones'
import { EditorPlantilla } from './editor'

export const metadata: Metadata = { title: 'Plantillas' }

const CATEGORIAS: Record<string, string> = {
  bienvenida: 'Bienvenida',
  refuerzo: 'Refuerzos',
  retorno: 'Lead que regresa',
  match: 'Matches',
  novedades: 'Novedades',
  cita: 'Confirmación de citas y visitas',
  recordatorio: 'Recordatorios',
  visita: 'Después de la visita',
  insights: 'Insights al propietario',
  testimonio: 'Testimonio y reseña',
}

export default async function PaginaPlantillas() {
  const supabase = await crearClienteServidor()
  const { data: plantillas } = await supabase.from('plantillas').select('*').order('orden')

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Mensajes personalizados con el nombre y neutros en género. Las variables entre corchetes se reemplazan al enviar.
      </p>
      {Object.entries(CATEGORIAS).map(([cat, titulo]) => {
        const lista = plantillas?.filter((p) => p.categoria === cat) ?? []
        if (!lista.length) return null
        return (
          <section key={cat} className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">{titulo}</h2>
            {lista.map((p) => (
              <Tarjeta
                key={p.clave}
                titulo={
                  <span className="flex flex-wrap items-center gap-2">
                    {p.nombre}
                    {p.meta_nombre ? (
                      <Badge variant="verde">Meta: {p.meta_nombre}</Badge>
                    ) : (
                      <Badge variant="gris">Sin plantilla de Meta</Badge>
                    )}
                  </span>
                }
                acciones={
                  p.cuerpo !== p.cuerpo_defecto && (
                    <BotonAccion
                      accion={restablecerPlantilla.bind(null, p.clave)}
                      variante="ghost"
                      confirmar="¿Volver al texto por defecto?"
                    >
                      Restablecer
                    </BotonAccion>
                  )
                }
              >
                {p.descripcion && <p className="mb-3 text-sm text-muted-foreground">{p.descripcion}</p>}
                <EditorPlantilla
                  clave={p.clave}
                  cuerpo={p.cuerpo}
                  metaNombre={p.meta_nombre}
                  metaIdioma={p.meta_idioma}
                  accion={guardarPlantilla}
                />
                {p.meta_nombre && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Parámetros para Meta:{' '}
                    {variablesEnOrden(p.cuerpo)
                      .map((v, i) => `{{${i + 1}}} = [${v}]`)
                      .join(' · ') || 'ninguno'}
                  </p>
                )}
              </Tarjeta>
            ))}
          </section>
        )
      })}
    </div>
  )
}
