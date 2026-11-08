import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { exigirUsuario } from '@/lib/auth'
import { crearClienteServidor } from '@/lib/supabase/server'
import { ESTADOS_INMUEBLE, TIPOS_INMUEBLE, colorEstadoInmueble, etiqueta } from '@/lib/catalogos'
import { hoyLima, soles } from '@/lib/formato'
import { EncabezadoPagina, Entrada, Insignia, Seleccion, Vacio, claseBoton, cx } from '@/components/ui'
import { ID_DISTRITOS, InsigniaVencimiento, ListaDistritos, caracteristicasTexto } from './compartido'
import type { InmuebleVista } from './tipos'

export const metadata: Metadata = { title: 'Inmuebles' }

const param = (v: string | string[] | undefined) => (typeof v === 'string' ? v.trim() : '')

// HU-18: base de propiedades con filtros por estado, distrito, tipo y precio
export default async function PaginaInmuebles({ searchParams }: PageProps<'/inmuebles'>) {
  await exigirUsuario()
  const sp = await searchParams
  const f = {
    estado: param(sp.estado) || 'activos',
    distrito: param(sp.distrito),
    tipo: param(sp.tipo),
    min: Number(param(sp.min)) || 0,
    max: Number(param(sp.max)) || 0,
  }
  const supabase = await crearClienteServidor()
  let consulta = supabase.from('v_inmuebles').select('*')
  if (f.estado === 'activos') consulta = consulta.in('estado', ['en_captacion', 'en_cartera'])
  else if (f.estado !== 'todos') consulta = consulta.eq('estado', f.estado)
  if (f.distrito) consulta = consulta.ilike('distrito', f.distrito.replace(/[%_]/g, ''))
  if (f.tipo) consulta = consulta.eq('tipo', f.tipo)
  if (f.min) consulta = consulta.gte('precio', f.min)
  if (f.max) consulta = consulta.lte('precio', f.max)
  const [{ data, error }, { data: aviso }] = await Promise.all([
    consulta.order('created_at', { ascending: false }).limit(300),
    supabase.from('parametros').select('valor').eq('clave', 'contrato_aviso_dias').maybeSingle(),
  ])
  const inmuebles = (data ?? []) as InmuebleVista[]
  const portadas = inmuebles.flatMap((i) => (i.foto_portada ? [i.foto_portada] : []))
  const { data: firmadas } = portadas.length ? await supabase.storage.from('inmuebles').createSignedUrls(portadas, 3600) : { data: [] }
  const url = new Map((firmadas ?? []).map((s) => [s.path, s.signedUrl]))
  const hoy = hoyLima()
  const avisoDias = Number(aviso?.valor ?? 30)
  const hayFiltros = f.estado !== 'activos' || f.distrito || f.tipo || f.min || f.max

  return (
    <>
      <EncabezadoPagina titulo="Inmuebles" descripcion="Base de propiedades. Los inmuebles se crean al registrar el resultado de la cita con el propietario." />
      <ListaDistritos />

      <form className="mb-4 grid grid-cols-2 gap-2 rounded-xl border border-borde bg-white p-3 sm:grid-cols-3 lg:grid-cols-6">
        <Seleccion name="estado" defaultValue={f.estado} aria-label="Estado">
          <option value="activos">En captación y en cartera</option>
          <option value="todos">Todos los estados</option>
          {Object.entries(ESTADOS_INMUEBLE).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Seleccion>
        <Entrada name="distrito" list={ID_DISTRITOS} defaultValue={f.distrito} placeholder="Distrito" aria-label="Distrito" />
        <Seleccion name="tipo" defaultValue={f.tipo} aria-label="Tipo">
          <option value="">Todos los tipos</option>
          {Object.entries(TIPOS_INMUEBLE).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Seleccion>
        <Entrada name="min" type="number" min={0} defaultValue={f.min || ''} placeholder="Precio desde (S/)" aria-label="Precio desde" />
        <Entrada name="max" type="number" min={0} defaultValue={f.max || ''} placeholder="Precio hasta (S/)" aria-label="Precio hasta" />
        <div className="flex gap-2">
          <button type="submit" className={cx(claseBoton('primario'), 'flex-1')}>
            Filtrar
          </button>
          {hayFiltros && (
            <Link href="/inmuebles" className={claseBoton('fantasma')}>
              Limpiar
            </Link>
          )}
        </div>
      </form>

      {error && <Vacio>No se pudieron cargar los inmuebles: {error.message}</Vacio>}
      {!error && inmuebles.length === 0 && <Vacio>No hay inmuebles con estos filtros.</Vacio>}

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {inmuebles.map((i) => (
          <li key={i.id}>
            <Link href={`/inmuebles/${i.id}`} className="block overflow-hidden rounded-xl border border-borde bg-white shadow-tarjeta hover:border-marino-200">
              <div className="relative aspect-[4/3] bg-marino-50">
                {i.foto_portada && url.get(i.foto_portada) ? (
                  <Image src={url.get(i.foto_portada)!} alt={`Portada de ${i.codigo}`} fill unoptimized sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className="object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-suave">Sin fotos</div>
                )}
              </div>
              <div className="space-y-1 p-3">
                <div className="flex flex-wrap items-center gap-1">
                  <span className="font-medium text-tinta">{i.codigo}</span>
                  <Insignia color={colorEstadoInmueble(i.estado)}>{ESTADOS_INMUEBLE[i.estado]}</Insignia>
                  <InsigniaVencimiento venceEl={i.contrato_vence_el} hoy={hoy} avisoDias={avisoDias} />
                </div>
                <p className="text-sm text-tinta">
                  {etiqueta(TIPOS_INMUEBLE, i.tipo)} en {i.distrito} · <span className="font-medium">{soles(i.precio)}</span>
                </p>
                <p className="text-xs text-suave">{caracteristicasTexto(i) || 'Sin características'}</p>
                <p className="text-xs text-suave">
                  {i.propietario_nombre ?? '—'} · {i.leads_interesados} leads · {i.me_interesa} «Me interesa» · {i.visitas_realizadas} visitas
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {inmuebles.length >= 300 && <p className="mt-3 text-center text-xs text-suave">Mostrando los primeros 300. Usa los filtros.</p>}
    </>
  )
}
