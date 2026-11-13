import { isoALocal, hoyLima, ahoraMs } from '@/lib/formato'
import { Campo, Seleccion } from '@/components/campos'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { BotonAccion, BotonEnviar, Dialogo, Formulario } from '@/components/formulario'
import { cancelarCita, enviarAvisoCita, reprogramarCita } from '@/app/(panel)/agenda/acciones'

export type CitaBasica = {
  id: string
  tipo: 'cita_propietario' | 'visita'
  lead_id: string
  inicio: string
  estado: 'programada' | 'realizada' | 'cancelada' | 'no_asistio'
  confirmacion_at: string | null
  recordatorio_24h_at: string | null
  recordatorio_dia_at: string | null
}

// Botones de una cita programada: confirmación, recordatorios cuando tocan, reprogramar y cancelar.
// Sirve para citas con propietarios y para visitas.
export function AccionesCita({ cita, compacto = false }: { cita: CitaBasica; compacto?: boolean }) {
  if (cita.estado !== 'programada') return null
  const inicio = new Date(cita.inicio).getTime()
  const ahora = ahoraMs()
  const futura = inicio > ahora
  const toca24h = futura && !cita.recordatorio_24h_at && inicio - ahora <= 24 * 3_600_000
  const esHoy = isoALocal(cita.inicio).slice(0, 10) === hoyLima()
  const tocaDia = futura && esHoy && !cita.recordatorio_dia_at
  const palabra = cita.tipo === 'visita' ? 'visita' : 'cita'

  return (
    <div className="flex flex-wrap gap-2">
      {!cita.confirmacion_at && futura && (
        <BotonAccion accion={enviarAvisoCita.bind(null, cita.id, 'confirmacion')} variante="whatsapp">
          Enviar confirmación
        </BotonAccion>
      )}
      {toca24h && (
        <BotonAccion accion={enviarAvisoCita.bind(null, cita.id, '24h')} variante="whatsapp">
          Recordatorio 24 h
        </BotonAccion>
      )}
      {tocaDia && (
        <BotonAccion accion={enviarAvisoCita.bind(null, cita.id, 'dia')} variante="whatsapp">
          Recordatorio de hoy
        </BotonAccion>
      )}
      <Dialogo titulo={`Reprogramar ${palabra}`} boton={compacto ? 'Reprogramar' : `Reprogramar ${palabra}`}>
        <Formulario accion={reprogramarCita}>
          <input type="hidden" name="cita_id" value={cita.id} />
          <input type="hidden" name="lead_id" value={cita.lead_id} />
          <Campo etiqueta="Nueva fecha y hora">
            <Input type="datetime-local" name="inicio" defaultValue={isoALocal(cita.inicio)} required />
          </Campo>
          <Campo etiqueta="Motivo">
            <Input name="motivo" placeholder="Lo pidió por WhatsApp" />
          </Campo>
          <BotonEnviar>Reprogramar</BotonEnviar>
        </Formulario>
      </Dialogo>
      <Dialogo titulo={`Cancelar ${palabra}`} boton="Cancelar" variante="peligro">
        <Formulario accion={cancelarCita}>
          <input type="hidden" name="cita_id" value={cita.id} />
          <input type="hidden" name="lead_id" value={cita.lead_id} />
          <Campo etiqueta="Qué pasó">
            <Seleccion name="estado" defaultValue="cancelada">
              <option value="cancelada">Se canceló</option>
              <option value="no_asistio">No asistió</option>
            </Seleccion>
          </Campo>
          <Campo etiqueta="Motivo">
            <Textarea name="motivo" rows={2} />
          </Campo>
          <BotonEnviar variante="peligro">Confirmar</BotonEnviar>
        </Formulario>
      </Dialogo>
    </div>
  )
}
