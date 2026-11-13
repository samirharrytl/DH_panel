import type { Metadata } from 'next'
import Link from 'next/link'
import { exigirUsuario } from '@/lib/auth'
import { crearClienteServidor } from '@/lib/supabase/server'
import { ESTADOS_CITA } from '@/lib/catalogos'
import { diaLargo, hora, hoyLima } from '@/lib/formato'
import { EncabezadoPagina, Seleccion, Vacio } from '@/components/campos'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { AccionesCita, type CitaBasica } from '@/components/acciones-cita'
import { DatosAcceso, enlaceMapa } from '../inmuebles/compartido'
import { ChevronLeft, ChevronRight, MapPin, Navigation } from 'lucide-react'

export const metadata: Metadata = { title: 'Agenda' }

type CitaAgenda = CitaBasica & {
  direccion: string
  distrito: string | null
  duracion_min: number
  acceso_llave: string | null
  acceso_codigo: string | null
  acceso_dni: boolean
  acceso_otros: string | null
  notas: string | null
  lead: { persona: { nombre: string } | null } | null
  inmueble: { id: string; codigo: string } | null
  asesor: { nombre: string } | null
}

const COLOR_CITA = { programada: 'azul', realizada: 'verde', cancelada: 'gris', no_asistio: 'ambar' } as const

const sumarDias = (dia: string, n: number) => new Date(Date.parse(`${dia}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

// HU-14 y HU-26: citas con propietarios y visitas de interesados de un día, agrupadas por distrito
export default async function PaginaAgenda({ searchParams }: PageProps<'/agenda'>) {
  const usuario = await exigirUsuario()
  const sp = await searchParams
  const dia = typeof sp.dia === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sp.dia) ? sp.dia : hoyLima()
  const asesor = usuario.esAdmin && typeof sp.asesor === 'string' ? sp.asesor : ''

  const supabase = await crearClienteServidor()
  let consulta = supabase
    .from('citas')
    .select('*, lead:leads(persona:personas(nombre)), inmueble:inmuebles(id, codigo), asesor:perfiles!citas_asesor_id_fkey(nombre)')
    .gte('inicio', `${dia}T00:00:00-05:00`)
    .lt('inicio', `${sumarDias(dia, 1)}T00:00:00-05:00`)
    .order('inicio')
  // La RLS ya limita al asesor a sus leads y sus citas
  if (asesor) consulta = consulta.eq('asesor_id', asesor)
  const [{ data, error }, { data: asesores }] = await Promise.all([
    consulta,
    usuario.esAdmin ? supabase.from('perfiles').select('id, nombre').eq('activo', true).order('nombre') : { data: null },
  ])
  const citas = (data ?? []) as unknown as CitaAgenda[]

  const grupos = new Map<string, CitaAgenda[]>()
  for (const c of citas) {
    const d = c.distrito || 'Sin distrito'
    grupos.set(d, [...(grupos.get(d) ?? []), c])
  }
  const enlace = (d: string) => `/agenda?dia=${d}${asesor ? `&asesor=${asesor}` : ''}`

  return (
    <>
      <EncabezadoPagina titulo="Agenda" descripcion={diaLargo(dia)} />

      <form className="mb-6 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3">
        <Link href={enlace(sumarDias(dia, -1))} className={buttonVariants({ variant: 'outline', size: 'sm' })} aria-label="Día anterior">
          <ChevronLeft aria-hidden />
        </Link>
        <Link href={enlace(hoyLima())} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          Hoy
        </Link>
        <Link href={enlace(sumarDias(dia, 1))} className={buttonVariants({ variant: 'outline', size: 'sm' })} aria-label="Día siguiente">
          <ChevronRight aria-hidden />
        </Link>
        <Input type="date" name="dia" defaultValue={dia} className="w-auto sm:h-9" aria-label="Día" />
        {usuario.esAdmin && (
          <Seleccion name="asesor" defaultValue={asesor} className="w-auto sm:h-9" aria-label="Asesor">
            <option value="">Todos los asesores</option>
            {asesores?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre}
              </option>
            ))}
          </Seleccion>
        )}
        <button type="submit" className={buttonVariants({ variant: 'default', size: 'sm' })}>
          Ver
        </button>
      </form>

      {error && <Vacio>No se pudo cargar la agenda: {error.message}</Vacio>}
      {!error && citas.length === 0 && <Vacio>No hay citas ni visitas este día.</Vacio>}

      <div className="space-y-5">
        {[...grupos].map(([distrito, lista]) => (
          <section key={distrito}>
            <h2 className="mb-3 flex items-center gap-2 font-titulo text-lg font-semibold text-primary">
              <MapPin aria-hidden className="size-5 text-exito-vivo" />
              {distrito}
              <Badge variant="gris">{lista.length}</Badge>
            </h2>
            <ul className="space-y-2">
              {lista.map((c) => (
                <li key={c.id} className="space-y-2 rounded-2xl border border-border bg-card px-4 py-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-titulo text-lg font-semibold text-primary tabular-nums">{hora(c.inicio)}</span>
                    <Badge variant={c.tipo === 'visita' ? 'marino' : 'azul'}>{c.tipo === 'visita' ? 'Visita' : 'Cita con propietario'}</Badge>
                    <Badge variant={COLOR_CITA[c.estado]}>{ESTADOS_CITA[c.estado]}</Badge>
                    <Link href={`/leads/${c.lead_id}?tab=${c.tipo === 'visita' ? 'visitas' : 'citas'}`} className="font-medium text-primary hover:underline">
                      {c.lead?.persona?.nombre ?? 'Lead'}
                    </Link>
                    {c.inmueble && (
                      <Link href={`/inmuebles/${c.inmueble.id}`} className="text-sm text-primary hover:underline">
                        {c.inmueble.codigo}
                      </Link>
                    )}
                    {usuario.esAdmin && c.asesor && <span className="text-xs text-muted-foreground">Asesor: {c.asesor.nombre}</span>}
                  </div>
                  <a href={enlaceMapa(c.direccion, c.distrito)} target="_blank" rel="noreferrer" className="inline-flex items-start gap-1 text-sm text-primary hover:underline">
                    <Navigation aria-hidden className="mt-0.5 size-4 shrink-0" />
                    {c.direccion}
                  </a>
                  <DatosAcceso acceso={c} />
                  {c.notas && <p className="text-sm whitespace-pre-wrap text-muted-foreground">{c.notas}</p>}
                  <AccionesCita cita={c} compacto />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  )
}
