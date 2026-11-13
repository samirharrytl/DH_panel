import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { exigirUsuario } from '@/lib/auth'
import { crearClienteServidor } from '@/lib/supabase/server'
import { fecha, hoyLima, num, soles } from '@/lib/formato'
import { Aviso, Dato, EncabezadoPagina, EnlaceBoton, Insignia, Tarjeta, Vacio } from '@/components/legado'
import { parametrosDifusion, urlPortada } from './datos'
import { ListaPublicaciones } from './publicaciones'
import { RegistrarPublicacion } from './registrar'
import {
  COLUMNAS_INMUEBLE,
  COLUMNAS_PUBLICACION,
  aPublicaciones,
  describirCorto,
  textoSugerido,
  type InmuebleDifusion,
} from './texto'

export const metadata: Metadata = { title: 'Difusión' }

type Sugerencia = {
  inmueble_id: string
  codigo: string
  tipo: string
  distrito: string
  precio: number | null
  en_cartera_at: string | null
  publicaciones: number
  ultima_publicacion: string | null
  interes: number
  motivo: string
}

const DIAS_RECIENTES = 30

export default async function PaginaDifusion() {
  const usuario = await exigirUsuario()
  const supabase = await crearClienteServidor()
  const hoy = hoyLima()

  const [{ data: sugeridas, error: errorSugerencias }, parametros, { data: filas, error: errorPublicaciones }] = await Promise.all([
    supabase.rpc('sugerir_publicaciones'),
    parametrosDifusion(supabase),
    supabase
      .from('publicaciones')
      .select(COLUMNAS_PUBLICACION)
      .gte('publicada_el', hoyLima(-DIAS_RECIENTES))
      .order('publicada_el', { ascending: false })
      .order('created_at', { ascending: false }),
  ])
  const sugerencias = (sugeridas ?? []) as Sugerencia[]
  const publicaciones = aPublicaciones(filas)
  const destacada = sugerencias[0]

  const [{ data: detalles }, portada] = await Promise.all([
    sugerencias.length
      ? supabase.from('inmuebles').select(COLUMNAS_INMUEBLE).in('id', sugerencias.map((s) => s.inmueble_id))
      : Promise.resolve({ data: [] }),
    destacada ? urlPortada(supabase, destacada.inmueble_id) : Promise.resolve(null),
  ])
  const porId = new Map(((detalles ?? []) as InmuebleDifusion[]).map((i) => [i.id, i]))

  const registrar = (s: Sugerencia, destacado = false) => {
    const detalle = porId.get(s.inmueble_id)
    return (
      <RegistrarPublicacion
        inmueble={{ id: s.inmueble_id, codigo: s.codigo, descripcion: `${s.codigo} · ${describirCorto(s)} · ${soles(s.precio)}` }}
        texto={detalle ? textoSugerido(detalle) : ''}
        redes={parametros.redes}
        hoy={hoy}
        destino="publicaciones"
        esAdmin={usuario.esAdmin}
        variante={destacado ? 'primario' : 'secundario'}
        tamano={destacado ? 'md' : 'sm'}
      />
    )
  }

  const totalVistas = publicaciones.reduce((t, p) => t + p.vistas, 0)
  const totalLeads = publicaciones.reduce((t, p) => t + p.leads, 0)
  const todoPublicadoHoy = destacada?.ultima_publicacion === hoy

  return (
    <>
      <EncabezadoPagina
        titulo="Difusión"
        descripcion="Qué publicar hoy en redes y en el Canal de WhatsApp, y cuánto interés genera cada publicación."
      />

      {!parametros.numero && (
        <Aviso tipo="alerta" className="mb-4">
          Falta el número de WhatsApp de DepaHost, así que las publicaciones no tienen enlace para atribuir los leads.{' '}
          {usuario.esAdmin ? (
            <Link href="/configuracion/parametros" className="font-medium underline">
              Configúralo en Configuración → Parámetros
            </Link>
          ) : (
            'Pídele al administrador que lo configure en Configuración → Parámetros.'
          )}
        </Aviso>
      )}

      <div className="space-y-4">
        {errorSugerencias && <Aviso tipo="error">No se pudo calcular la sugerencia: {errorSugerencias.message}</Aviso>}

        {!errorSugerencias && !destacada && (
          <Tarjeta titulo="Sugerido para hoy">
            <Vacio>No hay inmuebles en cartera con autorización del propietario para publicar.</Vacio>
          </Tarjeta>
        )}

        {destacada && (
          <Tarjeta
            titulo={todoPublicadoHoy ? 'Todo publicado hoy' : 'Sugerido para hoy'}
            acciones={<Insignia color={colorMotivo(destacada, hoy)}>{destacada.motivo}</Insignia>}
          >
            {todoPublicadoHoy && (
              <Aviso tipo="exito" className="mb-4">
                Hoy ya se publicaron todos los inmuebles disponibles. Este es el siguiente en la rotación.
              </Aviso>
            )}
            <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
              <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-marino-50">
                {portada ? (
                  <Image
                    src={portada}
                    alt={`Foto de portada de ${destacada.codigo}`}
                    fill
                    unoptimized
                    sizes="(min-width: 640px) 40vw, 100vw"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-suave">Sin fotos</div>
                )}
              </div>
              <div className="min-w-0 space-y-4">
                <div>
                  <p className="font-mono text-xs text-suave">{destacada.codigo}</p>
                  <p className="text-lg font-semibold text-tinta">{describirCorto(destacada)}</p>
                  <p className="text-xl font-semibold text-marino-800">
                    {destacada.precio ? soles(destacada.precio) : 'Precio por definir'}
                  </p>
                </div>
                <dl className="grid grid-cols-2 gap-3">
                  <Dato etiqueta="Publicaciones">{num(destacada.publicaciones)}</Dato>
                  <Dato etiqueta="Última publicación">{fecha(destacada.ultima_publicacion)}</Dato>
                  <Dato etiqueta="Interés acumulado">{num(destacada.interes)}</Dato>
                  <Dato etiqueta="En cartera desde">{fecha(destacada.en_cartera_at)}</Dato>
                </dl>
                <div className="flex flex-wrap gap-2">
                  {registrar(destacada, true)}
                  <EnlaceBoton href={`/inmuebles/${destacada.inmueble_id}`} variante="secundario">
                    Ver ficha y fotos
                  </EnlaceBoton>
                </div>
              </div>
            </div>
          </Tarjeta>
        )}

        {sugerencias.length > 1 && (
          <Tarjeta titulo="Siguientes en la rotación">
            <p className="mb-3 text-sm text-suave">
              Primero los nuevos, luego los que generan menos interés y los que llevan más tiempo sin publicarse. Solo
              inmuebles en cartera con autorización para publicar.
            </p>
            <ul className="divide-y divide-borde-suave">
              {sugerencias.slice(1).map((s) => (
                <li key={s.inmueble_id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <Link href={`/inmuebles/${s.inmueble_id}`} className="font-medium text-tinta hover:underline">
                      {s.codigo} · {describirCorto(s)}
                    </Link>
                    <p className="text-sm text-marino-800">{s.precio ? soles(s.precio) : 'Precio por definir'}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-suave">
                      <Insignia color={colorMotivo(s, hoy)}>{s.motivo}</Insignia>
                      <span>
                        {s.publicaciones === 1 ? '1 publicación' : `${s.publicaciones} publicaciones`}
                        {s.ultima_publicacion && ` · última el ${fecha(s.ultima_publicacion)}`}
                      </span>
                    </div>
                  </div>
                  {registrar(s)}
                </li>
              ))}
            </ul>
          </Tarjeta>
        )}

        <Tarjeta
          id="publicaciones"
          className="scroll-mt-20"
          titulo={`Publicaciones de los últimos ${DIAS_RECIENTES} días`}
          acciones={
            publicaciones.length > 0 && (
              <span className="text-xs text-suave">
                {publicaciones.length} · {num(totalVistas)} vistas · {num(totalLeads)} leads
              </span>
            )
          }
        >
          {errorPublicaciones && <Aviso tipo="error">No se pudieron cargar las publicaciones: {errorPublicaciones.message}</Aviso>}
          {!errorPublicaciones && publicaciones.length === 0 ? (
            <Vacio>Todavía no hay publicaciones registradas en este periodo.</Vacio>
          ) : (
            <ListaPublicaciones publicaciones={publicaciones} numero={parametros.numero} hoy={hoy} />
          )}
          {!usuario.esAdmin && publicaciones.length > 0 && (
            <p className="mt-3 text-xs text-suave">Los leads de cada publicación cuentan solo los que tienes asignados.</p>
          )}
        </Tarjeta>
      </div>
    </>
  )
}

function colorMotivo(s: Sugerencia, hoy: string) {
  if (s.publicaciones === 0) return 'azul'
  if (s.ultima_publicacion === hoy) return 'gris'
  return 'ambar'
}
