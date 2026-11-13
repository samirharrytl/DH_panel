import Link from 'next/link'
import { crearClienteServidor } from '@/lib/supabase/server'
import { INTENCIONES, etiqueta } from '@/lib/catalogos'
import { fecha, fechaHora, hoyLima } from '@/lib/formato'
import { Aviso, Campo, Dato, Seleccion, SiNo, Tarjeta, Vacio } from '@/components/campos'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { BotonAccion, BotonEnviar, Dialogo, Formulario } from '@/components/formulario'
import { guardarIntencion, guardarTestimonio, pedirTestimonio } from './cierre-acciones'
import type { PropsSeccion } from '../tipos'

type Testimonio = {
  id: string
  rol: 'comprador' | 'vendedor'
  programado_para: string
  pedido_at: string | null
  dio_testimonio: boolean | null
  dio_resena: boolean | null
  autoriza_redes: boolean | null
  testimonio: string | null
  notas: string | null
  compraventa: { fecha_cierre: string | null; inmueble: { codigo: string } | null } | null
  pedidor: { nombre: string } | null
}

const siNoTexto = (v: boolean | null) => (v === true ? 'Sí' : v === false ? 'No' : '—')

// Postventa de un lead en Cliente, comprador o propietario: testimonio y reseña (HU-32) e intención (HU-33)
export async function Postventa({ lead, resenaUrl }: Pick<PropsSeccion, 'lead'> & { resenaUrl: string }) {
  const supabase = await crearClienteServidor()
  const { data } = await supabase
    .from('testimonios')
    .select(
      'id, rol, programado_para, pedido_at, dio_testimonio, dio_resena, autoriza_redes, testimonio, notas, compraventa:compraventas(fecha_cierre, inmueble:inmuebles(codigo)), pedidor:perfiles(nombre)',
    )
    .eq('lead_id', lead.id)
    .order('programado_para', { ascending: false })
  const testimonios = (data ?? []) as unknown as Testimonio[]
  const p = lead.persona
  const hoy = hoyLima()

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Tarjeta guia="lead-testimonio" titulo="Testimonio y reseña">
        {p.no_contactar && (
          <Aviso tipo="alerta" className="mb-3">
            Esta persona está en Baja: no se le envían mensajes. Puedes registrar lo que haya dado por otro medio.
          </Aviso>
        )}
        {!resenaUrl && testimonios.some((t) => !t.pedido_at) && (
          <Aviso tipo="alerta" className="mb-3">
            Falta el enlace para la reseña en Google. Configúralo en Configuración → Parámetros antes de pedirla.
          </Aviso>
        )}
        {testimonios.length === 0 ? (
          <Vacio>
            El pedido de testimonio se programa al cerrar la compraventa
            {lead.tipo === 'propietario' ? ' de su inmueble' : ''}.
          </Vacio>
        ) : (
          <ul className="space-y-3">
            {testimonios.map((t) => {
              const toca = !t.pedido_at && t.programado_para <= hoy
              const codigo = t.compraventa?.inmueble?.codigo
              return (
                <li key={t.id} className={cn('rounded-lg border px-3 py-3', toca ? 'border-amber-300 bg-amber-50' : 'border-border')}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Como {t.rol}
                        {codigo && ` · ${codigo}`}
                        {t.compraventa?.fecha_cierre && (
                          <span className="font-normal text-muted-foreground"> · cierre del {fecha(t.compraventa.fecha_cierre)}</span>
                        )}
                      </p>
                      <p className={cn('text-xs', toca ? 'text-amber-800' : 'text-muted-foreground')}>
                        {t.pedido_at
                          ? `Pedido el ${fechaHora(t.pedido_at)}${t.pedidor ? ` por ${t.pedidor.nombre}` : ''}`
                          : toca
                            ? `Toca pedirlo desde el ${fecha(t.programado_para)}`
                            : `Se pedirá el ${fecha(t.programado_para)}`}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {toca && !p.no_contactar && (
                        <BotonAccion accion={pedirTestimonio.bind(null, t.id)} variante="whatsapp">
                          Pedir testimonio y reseña
                        </BotonAccion>
                      )}
                      <Dialogo titulo="Respuesta del cliente" boton="Registrar respuesta">
                        <Formulario accion={guardarTestimonio}>
                          <input type="hidden" name="testimonio_id" value={t.id} />
                          <input type="hidden" name="lead_id" value={lead.id} />
                          <div className="grid gap-3 sm:grid-cols-3">
                            <Campo etiqueta="¿Dio testimonio?">
                              <SiNo name="dio_testimonio" valor={t.dio_testimonio} />
                            </Campo>
                            <Campo etiqueta="¿Dejó reseña?">
                              <SiNo name="dio_resena" valor={t.dio_resena} />
                            </Campo>
                            <Campo etiqueta="¿Autoriza redes?">
                              <SiNo name="autoriza_redes" valor={t.autoriza_redes} />
                            </Campo>
                          </div>
                          <Campo etiqueta="Testimonio" ayuda="Tal como lo dio el cliente.">
                            <Textarea name="testimonio" rows={4} defaultValue={t.testimonio ?? ''} />
                          </Campo>
                          <Campo etiqueta="Notas">
                            <Textarea name="notas" rows={2} defaultValue={t.notas ?? ''} />
                          </Campo>
                          <BotonEnviar>Guardar</BotonEnviar>
                        </Formulario>
                      </Dialogo>
                    </div>
                  </div>
                  <dl className="mt-3 grid grid-cols-3 gap-3">
                    <Dato etiqueta="Testimonio">{siNoTexto(t.dio_testimonio)}</Dato>
                    <Dato etiqueta="Reseña en Google">{siNoTexto(t.dio_resena)}</Dato>
                    <Dato etiqueta="Uso en redes">
                      {t.autoriza_redes ? <Badge variant="verde">Autorizado</Badge> : siNoTexto(t.autoriza_redes)}
                    </Dato>
                  </dl>
                  {t.testimonio && (
                    <blockquote className="mt-3 border-l-2 border-primary pl-3 text-sm whitespace-pre-wrap text-foreground">
                      “{t.testimonio}”
                    </blockquote>
                  )}
                  {t.notas && <p className="mt-2 text-xs whitespace-pre-wrap text-muted-foreground">Notas: {t.notas}</p>}
                </li>
              )
            })}
          </ul>
        )}
      </Tarjeta>

      <Tarjeta guia="lead-intencion"
        titulo="Intención y marketing"
        acciones={
          <Dialogo titulo="Intención del cliente" boton="Editar">
            <Formulario accion={guardarIntencion}>
              <input type="hidden" name="lead_id" value={lead.id} />
              <input type="hidden" name="persona_id" value={p.id} />
              <Campo etiqueta="Intención" ayuda="Es de la persona: vale para todos sus registros, como propietario o interesado.">
                <Seleccion name="intencion" defaultValue={p.intencion ?? ''}>
                  <option value="">Sin registrar</option>
                  {Object.entries(INTENCIONES).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Seleccion>
              </Campo>
              <BotonEnviar>Guardar</BotonEnviar>
            </Formulario>
          </Dialogo>
        }
      >
        <dl className="grid grid-cols-2 gap-3">
          <Dato etiqueta="Intención">{p.intencion ? etiqueta(INTENCIONES, p.intencion) : 'Sin registrar'}</Dato>
          <Dato etiqueta="Acepta marketing">
            {lead.consentimiento_marketing ? <Badge variant="verde">Sí</Badge> : <Badge variant="gris">No</Badge>}
          </Dato>
          {p.no_contactar && (
            <Dato etiqueta="Contacto">
              <Badge variant="rojo">Baja</Badge>
            </Dato>
          )}
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">
          Los clientes siguen en la lista de marketing según su intención. El marketing respeta las bajas y solo se envía a
          quien aceptó recibirlo (consentimiento del lead, Ley 29733).
        </p>
        <Link
          href={p.intencion ? `/marketing?intencion=${p.intencion}` : '/marketing'}
          className="-mb-2 inline-block py-2 text-sm text-primary hover:underline"
        >
          Ver lista de marketing
        </Link>
      </Tarjeta>
    </div>
  )
}
