'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { crearClienteNavegador } from '@/lib/supabase/navegador'
import { renderizar, type Variables } from '@/lib/plantillas'
import { fechaHora, hora } from '@/lib/formato'
import { AreaTexto, Aviso, Entrada, Seleccion, cx } from '@/components/ui'
import { BotonEnviar, Formulario } from '@/components/formulario'
import { enviarDesdeChat, marcarLeidos, registrarManual, simularEntrante } from '@/app/(panel)/chats/acciones'

export type MensajeChat = {
  id: string
  direccion: 'entrante' | 'saliente'
  tipo: string
  cuerpo: string | null
  origen: 'whatsapp' | 'panel' | 'manual' | 'simulado' | 'celular' | 'importado'
  estado: string
  error: string | null
  metadata: { advertencia?: string; botones?: { id: string; titulo: string }[]; simulado?: boolean }
  plantilla_clave: string | null
  created_at: string
  autor: { nombre: string } | null
}

type Plantilla = { clave: string; nombre: string; cuerpo: string; meta_nombre: string | null; categoria: string }

const ICONO_ESTADO: Record<string, string> = { enviado: '✓', entregado: '✓✓', leido: '✓✓', fallido: '⚠', registrado: '' }

export function ChatCliente({
  personaId,
  leadId,
  mensajes,
  plantillas,
  variables,
  ventanaHasta,
  bloqueado,
  simulado,
}: {
  personaId: string
  leadId: string | null
  mensajes: MensajeChat[]
  plantillas: Plantilla[]
  variables: Variables
  ventanaHasta: number | null
  bloqueado: boolean
  simulado: boolean
}) {
  const router = useRouter()
  const fin = useRef<HTMLDivElement>(null)
  const [modo, setModo] = useState<'texto' | 'plantilla' | 'manual' | 'simular'>('texto')
  const [plantilla, setPlantilla] = useState('')
  const [ahora, setAhora] = useState(() => Date.now())
  const ventanaAbierta = ventanaHasta !== null && ventanaHasta > ahora
  const sinLeer = mensajes.some((m) => m.direccion === 'entrante')

  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    fin.current?.scrollIntoView({ block: 'end' })
    if (sinLeer) marcarLeidos(personaId)
  }, [mensajes.length, personaId, sinLeer])

  // Mensajes nuevos y cambios de estado de entrega en vivo
  useEffect(() => {
    const supabase = crearClienteNavegador()
    const nombre = `chat:${personaId}`
    const topico = `realtime:${nombre}`
    // channel() reutiliza el canal si ya existe; si sigue suscrito .on() falla
    // con "cannot add postgres_changes callbacks after subscribe()".
    const previo = supabase.getChannels().find((c) => c.topic === topico)
    if (previo) {
      void supabase.removeChannel(previo)
      ;(supabase as unknown as { realtime: { _remove: (c: typeof previo) => void } }).realtime?._remove?.(previo)
    }
    const canal = supabase
      .channel(nombre)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mensajes', filter: `persona_id=eq.${personaId}` }, () =>
        router.refresh(),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(canal)
    }
  }, [personaId, router])

  const elegida = plantillas.find((p) => p.clave === plantilla)
  const modoEfectivo = modo === 'texto' && !ventanaAbierta ? 'plantilla' : modo

  return (
    <div className="flex flex-col rounded-xl border border-borde bg-white shadow-tarjeta">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-borde-suave px-4 py-2 text-xs">
        <span className={ventanaAbierta ? 'text-emerald-700' : 'text-suave'}>
          {ventanaAbierta
            ? `Ventana de 24 h abierta hasta ${fechaHora(new Date(ventanaHasta!))}: puedes escribir libremente`
            : 'Ventana de 24 h cerrada: solo plantillas aprobadas por Meta'}
        </span>
        {simulado && <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800">WhatsApp simulado</span>}
      </div>

      <div className="h-[55vh] min-h-72 space-y-2 overflow-y-auto bg-[#efeae2] px-3 py-4">
        {mensajes.length === 0 && <p className="py-10 text-center text-sm text-suave">Todavía no hay mensajes.</p>}
        {mensajes.map((m) => (
          <div key={m.id} className={cx('flex', m.direccion === 'saliente' ? 'justify-end' : 'justify-start')}>
            <div
              className={cx(
                'max-w-[85%] rounded-lg px-3 py-2 text-sm shadow-sm sm:max-w-[70%]',
                m.direccion === 'saliente' ? 'bg-[#d9fdd3]' : 'bg-white',
                m.origen === 'manual' && 'border border-dashed border-gray-400',
              )}
            >
              {m.plantilla_clave && <p className="mb-0.5 text-[11px] text-suave">Plantilla: {m.plantilla_clave}</p>}
              <p className="whitespace-pre-wrap text-tinta">{m.cuerpo}</p>
              {m.metadata?.botones && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {m.metadata.botones.map((b) => (
                    <BotonRespuestaSimulada key={b.id} personaId={personaId} leadId={leadId} boton={b} activo={simulado} />
                  ))}
                </div>
              )}
              {m.error && <p className="mt-1 text-xs text-red-700">⚠ {m.error}</p>}
              {m.metadata?.advertencia && <p className="mt-1 text-[11px] text-amber-800">{m.metadata.advertencia}</p>}
              <p className="mt-0.5 text-right text-[11px] text-suave">
                {m.origen === 'manual' && 'Registrado a mano · '}
                {m.origen === 'celular' && 'Desde el celular · '}
                {m.origen === 'importado' && 'Historial del celular · '}
                {m.direccion === 'saliente' && m.autor?.nombre && `${m.autor.nombre} · `}
                {hora(m.created_at)}{' '}
                <span className={m.estado === 'leido' ? 'text-sky-600' : ''}>{ICONO_ESTADO[m.estado] ?? ''}</span>
              </p>
            </div>
          </div>
        ))}
        <div ref={fin} />
      </div>

      <div className="border-t border-borde-suave p-3">
        {bloqueado ? (
          <Aviso tipo="alerta">Esta persona pidió no ser contactada (Baja). No se le envían mensajes.</Aviso>
        ) : (
          <>
            <div className="mb-2 flex flex-wrap gap-1 text-xs">
              {(
                [
                  ['texto', 'Mensaje'],
                  ['plantilla', 'Plantilla'],
                  ['manual', 'Registrar a mano'],
                  ...(simulado ? [['simular', 'Simular cliente']] : []),
                ] as [typeof modo, string][]
              ).map(([k, t]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setModo(k)}
                  className={cx(
                    'rounded-full px-3 py-1',
                    modoEfectivo === k ? 'bg-marino-800 text-white' : 'bg-gray-100 text-suave hover:bg-gray-200',
                  )}
                >
                  {t}
                </button>
              ))}
            </div>

            {modoEfectivo === 'texto' && (
              <Formulario accion={enviarDesdeChat} reiniciar className="flex items-end gap-2">
                <input type="hidden" name="persona_id" value={personaId} />
                <input type="hidden" name="lead_id" value={leadId ?? ''} />
                <AreaTexto name="texto" rows={2} placeholder="Escribe un mensaje" required className="flex-1" />
                <BotonEnviar variante="whatsapp">Enviar</BotonEnviar>
              </Formulario>
            )}

            {modoEfectivo === 'plantilla' && (
              <Formulario accion={enviarDesdeChat} className="space-y-2" alTerminar={() => setPlantilla('')}>
                <input type="hidden" name="persona_id" value={personaId} />
                <input type="hidden" name="lead_id" value={leadId ?? ''} />
                {modo === 'texto' && !ventanaAbierta && (
                  <p className="text-xs text-suave">Fuera de la ventana de 24 horas solo puedes enviar plantillas.</p>
                )}
                <Seleccion name="plantilla" value={plantilla} onChange={(e) => setPlantilla(e.target.value)} required>
                  <option value="">Elige una plantilla</option>
                  {plantillas.map((p) => (
                    <option key={p.clave} value={p.clave}>
                      {p.nombre}
                      {!p.meta_nombre && !ventanaAbierta ? ' (sin plantilla de Meta)' : ''}
                    </option>
                  ))}
                </Seleccion>
                {elegida && (
                  <div className="rounded-lg bg-[#d9fdd3] p-2 text-sm whitespace-pre-wrap">{renderizar(elegida.cuerpo, variables)}</div>
                )}
                <BotonEnviar variante="whatsapp">Enviar plantilla</BotonEnviar>
              </Formulario>
            )}

            {modoEfectivo === 'manual' && (
              <Formulario accion={registrarManual} reiniciar className="space-y-2">
                <input type="hidden" name="persona_id" value={personaId} />
                <input type="hidden" name="lead_id" value={leadId ?? ''} />
                <p className="text-xs text-suave">
                  Para dejar constancia de un mensaje clave conversado fuera del panel. No se envía nada.
                </p>
                <Seleccion name="direccion" defaultValue="entrante">
                  <option value="entrante">Lo escribió el cliente</option>
                  <option value="saliente">Lo escribió DepaHost</option>
                </Seleccion>
                <AreaTexto name="texto" rows={2} required />
                <BotonEnviar variante="secundario">Registrar</BotonEnviar>
              </Formulario>
            )}

            {modoEfectivo === 'simular' && (
              <Formulario accion={simularEntrante} reiniciar className="flex items-end gap-2">
                <input type="hidden" name="persona_id" value={personaId} />
                <input type="hidden" name="lead_id" value={leadId ?? ''} />
                <Entrada name="texto" placeholder="Mensaje como si lo escribiera el cliente" required className="flex-1" />
                <BotonEnviar variante="secundario">Simular</BotonEnviar>
              </Formulario>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// En modo simulado, los botones de respuesta rápida se pueden "pulsar" como si fuera el cliente
function BotonRespuestaSimulada({
  personaId,
  leadId,
  boton,
  activo,
}: {
  personaId: string
  leadId: string | null
  boton: { id: string; titulo: string }
  activo: boolean
}) {
  if (!activo) {
    return <span className="rounded-full border border-sky-300 bg-white px-2 py-0.5 text-xs text-sky-700">{boton.titulo}</span>
  }
  return (
    <Formulario accion={simularEntrante} className="inline">
      <input type="hidden" name="persona_id" value={personaId} />
      <input type="hidden" name="lead_id" value={leadId ?? ''} />
      <input type="hidden" name="texto" value={boton.titulo} />
      <input type="hidden" name="boton" value={boton.id} />
      <button
        type="submit"
        title="Simular que el cliente pulsa este botón"
        className="rounded-full border border-sky-300 bg-white px-2 py-0.5 text-xs text-sky-700 hover:bg-sky-50"
      >
        {boton.titulo}
      </button>
    </Formulario>
  )
}
