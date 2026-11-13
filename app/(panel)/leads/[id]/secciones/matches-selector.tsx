'use client'

import { useState } from 'react'
import { TIPOS_INMUEBLE, etiqueta } from '@/lib/catalogos'
import { fecha, num, soles } from '@/lib/formato'
import { Insignia, cx } from '@/components/legado'
import { BotonEnviar, Formulario, type Resultado } from '@/components/formulario'
import { Desglose, colorPuntaje, textoRespuesta, type DetalleMatch } from './matches-formato'

export type Sugerencia = {
  inmueble_id: string
  codigo: string
  tipo: string
  distrito: string
  precio: number | null
  dormitorios: number | null
  metraje: number | null
  puntaje: number
  detalle: DetalleMatch
  ultimo_envio_at: string | null
  ultima_respuesta: string | null
}

// HU-22: el asesor marca hasta `maximo` sugerencias y las envía en un solo mensaje
export function SelectorMatches({
  leadId,
  sugerencias,
  maximo,
  habilitado,
  accion,
}: {
  leadId: string
  sugerencias: Sugerencia[]
  maximo: number
  habilitado: boolean
  accion: (previo: Resultado | null, f: FormData) => Promise<Resultado>
}) {
  const [elegidos, setElegidos] = useState<string[]>([])
  const lleno = elegidos.length >= maximo

  const alternar = (id: string) =>
    setElegidos((e) => (e.includes(id) ? e.filter((x) => x !== id) : e.length >= maximo ? e : [...e, id]))

  return (
    <Formulario accion={accion} alTerminar={() => setElegidos([])} className="space-y-3">
      <input type="hidden" name="lead_id" value={leadId} />
      <ul className="space-y-2">
        {sugerencias.map((s) => {
          const marcado = elegidos.includes(s.inmueble_id)
          const bloqueado = !habilitado || (!marcado && lleno)
          const puntaje = Number(s.puntaje)
          return (
            <li key={s.inmueble_id}>
              <label
                className={cx(
                  'flex gap-3 rounded-lg border px-3 py-2',
                  marcado ? 'border-marino-800 bg-marino-50' : 'border-borde-suave',
                  bloqueado ? 'cursor-default' : 'cursor-pointer hover:border-marino-200',
                )}
              >
                <input
                  type="checkbox"
                  name="inmueble"
                  value={s.inmueble_id}
                  checked={marcado}
                  disabled={bloqueado}
                  onChange={() => alternar(s.inmueble_id)}
                  className="mt-1 size-4 shrink-0 rounded border-tenue accent-marino-800"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
                    <p className="text-sm font-medium text-tinta">
                      {s.codigo} · {etiqueta(TIPOS_INMUEBLE, s.tipo)} en {s.distrito}
                    </p>
                    <Insignia color={colorPuntaje(puntaje)}>{num(puntaje)} pts</Insignia>
                  </div>
                  <p className="text-xs text-suave">
                    {[
                      soles(s.precio),
                      s.dormitorios !== null ? `${s.dormitorios} dorm.` : null,
                      s.metraje !== null ? `${num(s.metraje)} m²` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  <Desglose detalle={s.detalle} className="mt-1.5" />
                  {s.ultimo_envio_at && (
                    <p className="mt-1 text-xs text-amber-800">
                      Ya enviado el {fecha(s.ultimo_envio_at)} · {textoRespuesta(s.ultima_respuesta)}
                    </p>
                  )}
                </div>
              </label>
            </li>
          )
        })}
      </ul>
      {habilitado && (
        <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-2 border-t border-borde-suave bg-white px-4 py-3">
          <p className="text-sm text-suave">
            {elegidos.length ? `${elegidos.length} de ${maximo} elegidos` : `Elige hasta ${maximo} para enviar`}
          </p>
          {elegidos.length > 0 && (
            <BotonEnviar variante="whatsapp">
              Enviar {elegidos.length === 1 ? '1 opción' : `${elegidos.length} opciones`}
            </BotonEnviar>
          )}
        </div>
      )}
    </Formulario>
  )
}
