import { obtenerUsuario } from '@/lib/auth'
import { crearClienteServidor } from '@/lib/supabase/server'
import { fecha, fechaHora, hoyLima, soles } from '@/lib/formato'
import { Aviso, Tarjeta, Vacio } from '@/components/campos'
import { BotonAccion } from '@/components/formulario'
import { parametrosDifusion } from '../../../difusion/datos'
import { ListaPublicaciones } from '../../../difusion/publicaciones'
import { RegistrarPublicacion } from '../../../difusion/registrar'
import {
  COLUMNAS_INMUEBLE,
  COLUMNAS_PUBLICACION,
  aPublicaciones,
  describirCorto,
  textoInsights,
  textoSugerido,
  type DatosInsights,
  type InmuebleDifusion,
} from '../../../difusion/texto'
import { enviarInsights } from '../../acciones'
import type { PropsExtraInmueble } from './tipos'

// HU-28 a HU-30: publicaciones de este inmueble con su enlace único y el resumen de insights al propietario
export async function DifusionInmueble({ inmuebleId, puedeEditar }: PropsExtraInmueble) {
  const supabase = await crearClienteServidor()
  const hoy = hoyLima()
  const [usuario, { data: inm }, { data: filas }, parametros, { data: ultimo }] = await Promise.all([
    obtenerUsuario(),
    supabase.from('inmuebles').select(`${COLUMNAS_INMUEBLE}, estado, autoriza_publicar, en_cartera_at`).eq('id', inmuebleId).maybeSingle(),
    supabase.from('publicaciones').select(COLUMNAS_PUBLICACION).eq('inmueble_id', inmuebleId).order('publicada_el', { ascending: false }),
    parametrosDifusion(supabase),
    supabase
      .from('insights_resumenes')
      .select('enviado_at, desde, hasta')
      .eq('inmueble_id', inmuebleId)
      .not('enviado_at', 'is', null)
      .order('enviado_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  if (!inm || inm.estado === 'en_captacion') return null
  const i = inm as InmuebleDifusion & { estado: string; autoriza_publicar: boolean; en_cartera_at: string | null }
  const publicaciones = aPublicaciones(filas)

  // Periodo del resumen: desde el último envío (o la entrada a cartera) hasta hoy
  const desde = (ultimo?.hasta ?? i.en_cartera_at ?? hoy).slice(0, 10)
  const { data: datos } = puedeEditar ? await supabase.rpc('insights_inmueble', { p_inmueble_id: inmuebleId, p_desde: desde, p_hasta: hoy }) : { data: null }
  const resumen = datos ? textoInsights(datos as DatosInsights) : null
  const diasDesdeEnvio = ultimo ? Math.floor((Date.parse(`${hoy}T12:00:00-05:00`) - Date.parse(ultimo.enviado_at)) / 86_400_000) : null

  return (
    <>
      <Tarjeta guia="inm-publicaciones"
        titulo={`Publicaciones (${publicaciones.length})`}
        acciones={
          i.estado === 'en_cartera' &&
          i.autoriza_publicar && (
            <RegistrarPublicacion
              inmueble={{ id: i.id, codigo: i.codigo, descripcion: `${i.codigo} · ${describirCorto(i)} · ${soles(i.precio)}` }}
              texto={textoSugerido(i)}
              redes={parametros.redes}
              hoy={hoy}
              esAdmin={usuario?.esAdmin ?? false}
            />
          )
        }
      >
        {!i.autoriza_publicar && <Aviso tipo="alerta" className="mb-3">El propietario no autorizó publicar este inmueble.</Aviso>}
        {publicaciones.length ? (
          <ListaPublicaciones publicaciones={publicaciones} numero={parametros.numero} hoy={hoy} mostrarInmueble={false} />
        ) : (
          <Vacio>Sin publicaciones todavía.</Vacio>
        )}
      </Tarjeta>

      {resumen && i.estado === 'en_cartera' && (
        <Tarjeta guia="inm-insights"
          titulo="Insights para el propietario"
          acciones={
            <BotonAccion accion={enviarInsights.bind(null, inmuebleId, desde, hoy, resumen)} variante="whatsapp">
              Enviar al propietario
            </BotonAccion>
          }
        >
          <p className="mb-2 text-xs text-muted-foreground">
            Del {fecha(desde)} al {fecha(hoy)} · frecuencia: cada {parametros.frecuencia} días ·{' '}
            {ultimo ? `último envío ${fechaHora(ultimo.enviado_at)}` : 'aún no se envía ninguno'}
          </p>
          {diasDesdeEnvio !== null && diasDesdeEnvio < parametros.frecuencia && (
            <Aviso tipo="info" className="mb-2">
              Faltan {parametros.frecuencia - diasDesdeEnvio} días para el siguiente resumen según la frecuencia configurada.
            </Aviso>
          )}
          <pre className="rounded-lg bg-background p-3 font-sans text-sm whitespace-pre-wrap text-foreground">{resumen}</pre>
          <p className="mt-2 text-xs text-muted-foreground">Las vistas e interacciones se ingresan a mano en cada publicación.</p>
        </Tarjeta>
      )}
    </>
  )
}
