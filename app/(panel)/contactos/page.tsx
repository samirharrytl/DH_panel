import type { Metadata } from 'next'
import Link from 'next/link'
import { exigirUsuario } from '@/lib/auth'
import { crearClienteServidor } from '@/lib/supabase/server'
import { ESTADOS_LEAD, colorEstado, type EstadoLead, type TipoLead } from '@/lib/catalogos'
import { fechaCorta, telefono } from '@/lib/formato'
import { EncabezadoPagina, Seleccion, Vacio } from '@/components/campos'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { TipoLead as DistintivoTipo } from '@/components/tipo-lead'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'Contactos' }

const textoParam = (v: string | string[] | undefined) => (typeof v === 'string' && v.trim() ? v.trim() : '')

type LeadContacto = {
  id: string
  tipo: TipoLead
  estado: EstadoLead
  vigente: boolean
  asesor_id: string | null
  asesor: { nombre: string } | null
}
type PersonaContacto = {
  id: string
  nombre: string
  telefono: string
  email: string | null
  no_contactar: boolean
  created_at: string
  leads: LeadContacto[]
}

// Contactos: la lista de personas con todos sus leads, para buscar una y ver su ficha completa
export default async function PaginaContactos({ searchParams }: PageProps<'/contactos'>) {
  const usuario = await exigirUsuario()
  const sp = await searchParams
  const f = {
    q: textoParam(sp.q),
    relacion: textoParam(sp.relacion),
    asesor: textoParam(sp.asesor),
    baja: textoParam(sp.baja),
    desde: textoParam(sp.desde),
    hasta: textoParam(sp.hasta),
  }
  const supabase = await crearClienteServidor()
  const digitos = f.q.replace(/\D/g, '')

  let idsTelefono: string[] = []
  if (digitos.length >= 3) {
    const { data } = await supabase.from('persona_telefonos').select('persona_id').like('telefono', `%${digitos}%`)
    idsTelefono = [...new Set((data ?? []).map((x) => x.persona_id))]
  }

  let consulta = supabase
    .from('personas')
    .select(
      'id, nombre, telefono, email, no_contactar, created_at, leads(id, tipo, estado, vigente, asesor_id, asesor:perfiles!leads_asesor_id_fkey(nombre))',
    )
  if (f.q) {
    const limpio = f.q.replace(/[,()%*]/g, ' ').trim()
    const ors = [`nombre.ilike.%${limpio}%`, `email.ilike.%${limpio}%`]
    if (idsTelefono.length) ors.push(`id.in.(${idsTelefono.join(',')})`)
    consulta = consulta.or(ors.join(','))
  }
  if (f.desde) consulta = consulta.gte('created_at', `${f.desde}T00:00:00-05:00`)
  if (f.hasta) consulta = consulta.lte('created_at', `${f.hasta}T23:59:59-05:00`)

  const [{ data, error }, { data: asesores }] = await Promise.all([
    consulta.order('created_at', { ascending: false }).limit(300),
    usuario.esAdmin ? supabase.from('perfiles').select('id, nombre').eq('activo', true).order('nombre') : Promise.resolve({ data: null }),
  ])

  const personas = ((data ?? []) as unknown as PersonaContacto[]).filter((p) => {
    const leads = p.leads ?? []
    if (f.relacion && !leads.some((l) => l.tipo === f.relacion)) return false
    if (f.asesor === 'sin_asignar' && !leads.some((l) => l.vigente && !l.asesor_id)) return false
    if (f.asesor && f.asesor !== 'sin_asignar' && !leads.some((l) => l.asesor_id === f.asesor)) return false
    if (f.baja === 'si' && !p.no_contactar) return false
    if (f.baja === 'no' && p.no_contactar) return false
    return true
  })
  const hayFiltros = Object.values(f).some(Boolean)

  return (
    <>
      <EncabezadoPagina
        titulo="Contactos"
        descripcion="Cada persona con todos sus leads. Busca por nombre, correo o cualquiera de sus teléfonos."
      />

      <form className="mb-4 grid grid-cols-2 gap-2 rounded-2xl border border-border bg-card p-3 sm:grid-cols-3 lg:grid-cols-6" data-guia="contactos-filtros">
        <Input name="q" defaultValue={f.q} placeholder="Nombre, correo o teléfono" className="col-span-2 lg:col-span-2" />
        <Seleccion name="relacion" defaultValue={f.relacion} aria-label="Relación">
          <option value="">Propietarios e interesados</option>
          <option value="propietario">Solo propietarios</option>
          <option value="interesado">Solo interesados</option>
        </Seleccion>
        {usuario.esAdmin ? (
          <Seleccion name="asesor" defaultValue={f.asesor} aria-label="Asesor">
            <option value="">Todos los asesores</option>
            <option value="sin_asignar">Sin asignar</option>
            {asesores?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre}
              </option>
            ))}
          </Seleccion>
        ) : (
          <span className="hidden lg:block" />
        )}
        <Seleccion name="baja" defaultValue={f.baja} aria-label="Baja">
          <option value="">Con y sin Baja</option>
          <option value="no">Sin Baja</option>
          <option value="si">Solo en Baja</option>
        </Seleccion>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-muted-foreground">
            Desde
            <Input type="date" name="desde" defaultValue={f.desde} />
          </label>
          <label className="text-xs text-muted-foreground">
            Hasta
            <Input type="date" name="hasta" defaultValue={f.hasta} />
          </label>
        </div>
        <div className="col-span-2 flex items-end gap-2 sm:col-span-3 lg:col-span-2">
          <button type="submit" className={cn(buttonVariants({ variant: 'default' }), 'flex-1')}>
            Filtrar
          </button>
          {hayFiltros && (
            <Link href="/contactos" className={buttonVariants({ variant: 'ghost' })}>
              Limpiar
            </Link>
          )}
        </div>
      </form>

      {error && <Vacio>No se pudieron cargar los contactos: {error.message}</Vacio>}
      {!error && personas.length === 0 && <Vacio>No hay contactos con estos filtros.</Vacio>}

      <ul className="space-y-2" data-guia="contactos-lista">
        {personas.map((p) => {
          const vigentes = (p.leads ?? []).filter((l) => l.vigente)
          return (
            <li key={p.id}>
              <Link
                href={`/personas/${p.id}`}
                className="grid gap-x-3 gap-y-1 rounded-2xl border border-border bg-card px-4 py-3 transition-colors hover:border-primary md:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_auto]"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{p.nombre}</p>
                  <p className="text-xs text-muted-foreground">
                    {telefono(p.telefono)}
                    {p.email && ` · ${p.email}`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {vigentes.length ? (
                    vigentes.map((l) => (
                      <span key={l.id} className="inline-flex items-center gap-1">
                        <DistintivoTipo tipo={l.tipo} />
                        <Badge variant={colorEstado(l.estado)}>{ESTADOS_LEAD[l.estado]}</Badge>
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">Sin leads vigentes</span>
                  )}
                  {p.no_contactar && <Badge variant="rojo">No contactar</Badge>}
                </div>
                <div className="text-right text-xs text-muted-foreground md:text-left">
                  <span className="block">{vigentes.length} lead(s) vigente(s)</span>
                  <span className="block">Desde el {fechaCorta(p.created_at)}</span>
                  {usuario.esAdmin && <span className="block">{vigentes.find((l) => l.asesor)?.asesor?.nombre ?? 'Sin asesor'}</span>}
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
      {personas.length >= 300 && <p className="mt-3 text-center text-xs text-muted-foreground">Mostrando 300 contactos. Usa los filtros.</p>}
    </>
  )
}
