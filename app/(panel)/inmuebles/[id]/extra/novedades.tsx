import Link from 'next/link'
import { crearClienteServidor } from '@/lib/supabase/server'
import { ESTADOS_LEAD, type EstadoLead } from '@/lib/catalogos'
import { Tarjeta, Vacio } from '@/components/campos'
import { Badge } from '@/components/ui/badge'
import { BotonEnviar, Formulario } from '@/components/formulario'
import { enviarMatches } from '../../../leads/[id]/secciones/matches-acciones'
import { colorPuntaje } from '../../../leads/[id]/secciones/matches-formato'
import type { PropsExtraInmueble } from './tipos'

type Interesado = { lead_id: string; nombre: string; estado: EstadoLead; puntaje: number; puede_recibir: boolean; motivo: string | null }

// HU-24: interesados activos a los que les encaja este inmueble. Respeta el tope de frecuencia y las bajas (SQL).
export async function NovedadesInmueble({ inmuebleId }: PropsExtraInmueble) {
  const supabase = await crearClienteServidor()
  const [{ data: inm }, { data }] = await Promise.all([
    supabase.from('inmuebles').select('estado').eq('id', inmuebleId).maybeSingle(),
    supabase.rpc('interesados_para_inmueble', { p_inmueble_id: inmuebleId }),
  ])
  if (inm?.estado !== 'en_cartera') return null
  const interesados = (data ?? []) as Interesado[]

  return (
    <Tarjeta titulo={`Interesados a los que les encaja (${interesados.length})`}>
      {interesados.length ? (
        <ul className="space-y-2">
          {interesados.map((x) => (
            <li key={x.lead_id} className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant={colorPuntaje(Number(x.puntaje))}>{Math.round(Number(x.puntaje))}</Badge>
              <Link href={`/leads/${x.lead_id}?tab=matches`} className="font-medium text-primary hover:underline">
                {x.nombre}
              </Link>
              <span className="text-muted-foreground">{ESTADOS_LEAD[x.estado]}</span>
              {x.puede_recibir ? (
                <Formulario accion={enviarMatches} className="ml-auto">
                  <input type="hidden" name="lead_id" value={x.lead_id} />
                  <input type="hidden" name="inmueble" value={inmuebleId} />
                  <input type="hidden" name="tipo" value="novedad" />
                  <BotonEnviar variante="whatsapp" tamano="sm">
                    Enviar novedad
                  </BotonEnviar>
                </Formulario>
              ) : (
                <span className="ml-auto text-xs text-amber-700">{x.motivo}</span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <Vacio>Ningún interesado activo encaja todavía, o ya se le envió.</Vacio>
      )}
    </Tarjeta>
  )
}
