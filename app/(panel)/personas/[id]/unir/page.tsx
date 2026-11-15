import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { exigirUsuario } from '@/lib/auth'
import { crearClienteServidor } from '@/lib/supabase/server'
import { ESTADOS_LEAD, TIPOS_LEAD, type EstadoLead, type TipoLead } from '@/lib/catalogos'
import { telefono } from '@/lib/formato'
import { Aviso, Tarjeta, Vacio } from '@/components/campos'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { BotonEnviar, Formulario } from '@/components/formulario'
import { unirPersonas } from '../acciones'

export const metadata: Metadata = { title: 'Unir personas' }

type LeadResumen = { id: string; tipo: TipoLead; estado: EstadoLead; asesor: { nombre: string } | null }

async function cargar(id: string) {
  const supabase = await crearClienteServidor()
  const { data } = await supabase
    .from('personas')
    .select('id, nombre, email, telefono, leads(id, tipo, estado, vigente, asesor:perfiles!leads_asesor_id_fkey(nombre))')
    .eq('id', id)
    .maybeSingle()
  if (!data) return null
  const vigentes = (data.leads as unknown as (LeadResumen & { vigente: boolean })[]).filter((l) => l.vigente)
  return { ...data, vigentes }
}

export default async function PaginaUnir({ params, searchParams }: PageProps<'/personas/[id]/unir'>) {
  await exigirUsuario()
  const { id } = await params
  const sp = await searchParams
  const persona = await cargar(id)
  if (!persona) notFound()
  const con = typeof sp.con === 'string' ? sp.con : null
  const q = typeof sp.q === 'string' ? sp.q.trim() : ''

  const volver = (
    <Link href={`/personas/${id}`} className="mb-1 inline-block text-sm text-primary hover:underline">
      ← {persona.nombre}
    </Link>
  )

  if (!con) {
    const supabase = await crearClienteServidor()
    const digitos = q.replace(/\D/g, '')
    // Solo aparecen las personas que el usuario puede ver (RLS)
    const { data: resultados } = q
      ? digitos.length >= 6
        ? await supabase
            .from('persona_telefonos')
            .select('persona:personas(id, nombre, telefono)')
            .like('telefono', `%${digitos}%`)
            .neq('persona_id', id)
            .limit(20)
            .then((r) => ({ data: (r.data ?? []).map((x) => x.persona as unknown as { id: string; nombre: string; telefono: string }) }))
        : await supabase.from('personas').select('id, nombre, telefono').ilike('nombre', `%${q}%`).neq('id', id).limit(20)
      : { data: [] }
    return (
      <div className="space-y-4">
        <div>
          {volver}
          <h1 className="text-2xl font-semibold text-foreground">Unir con otra persona</h1>
          <p className="text-sm text-muted-foreground">
            Busca el otro registro de {persona.nombre}. Todo lo del otro registro pasará a este perfil.
          </p>
        </div>
        <form className="flex flex-wrap gap-2">
          <Input name="q" defaultValue={q} placeholder="Teléfono o nombre" className="max-w-xs" />
          <Button type="submit">Buscar</Button>
        </form>
        {q && (
          <Tarjeta titulo="Resultados">
            {(resultados ?? []).length === 0 ? (
              <Vacio>No se encontró a nadie que puedas ver con esa búsqueda.</Vacio>
            ) : (
              <ul className="divide-y divide-border">
                {(resultados ?? []).map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      {r.nombre} · <span className="text-muted-foreground">{telefono(r.telefono)}</span>
                    </span>
                    <Link href={`/personas/${id}/unir?con=${r.id}`} className="text-sm font-medium text-primary hover:underline">
                      Elegir
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>
        )}
      </div>
    )
  }

  const otra = await cargar(con)
  if (!otra || otra.id === id) notFound()
  const conflictos = (['propietario', 'interesado'] as TipoLead[]).flatMap((tipo) => {
    const a = persona.vigentes.find((l) => l.tipo === tipo)
    const b = otra.vigentes.find((l) => l.tipo === tipo)
    return a && b ? [{ tipo, opciones: [a, b] }] : []
  })

  return (
    <div className="space-y-4">
      <div>
        {volver}
        <h1 className="text-2xl font-semibold text-foreground">Unir personas</h1>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {[
          { p: persona, rol: 'Se queda' },
          { p: otra, rol: 'Se une y desaparece' },
        ].map(({ p, rol }) => (
          <Tarjeta key={p.id} titulo={`${rol}: ${p.nombre}`}>
            <p className="text-sm text-muted-foreground">
              {telefono(p.telefono)} · {p.email ?? 'sin correo'}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {p.vigentes.length
                ? p.vigentes.map((l) => `${TIPOS_LEAD[l.tipo]} (${ESTADOS_LEAD[l.estado]})`).join(', ')
                : 'Sin leads vigentes'}
            </p>
          </Tarjeta>
        ))}
      </div>
      <Tarjeta titulo="Confirmar">
        <Formulario accion={unirPersonas.bind(null, id, otra.id)}>
          {conflictos.map(({ tipo, opciones }) => (
            <fieldset key={tipo} className="space-y-2">
              <legend className="text-sm font-medium text-foreground">
                Las dos tienen un lead de {TIPOS_LEAD[tipo].toLowerCase()} activo. ¿Cuál sigue?
              </legend>
              {opciones.map((l, i) => (
                <label key={l.id} className="flex items-center gap-2 text-sm">
                  <input type="radio" name={`sigue_${tipo}`} value={l.id} required defaultChecked={i === 0} />
                  {i === 0 ? persona.nombre : otra.nombre}: {ESTADOS_LEAD[l.estado]} · {l.asesor?.nombre ?? 'sin asesor'}
                </label>
              ))}
              <p className="text-xs text-muted-foreground">El otro queda como ciclo anterior, con su historial visible.</p>
            </fieldset>
          ))}
          <Aviso tipo="alerta">
            Los leads, mensajes, teléfonos e historial de {otra.nombre} pasan a {persona.nombre}. Queda registrado quién unió y una
            copia de los datos de {otra.nombre}. No se puede deshacer.
          </Aviso>
          <BotonEnviar variante="peligro">Unir</BotonEnviar>
        </Formulario>
      </Tarjeta>
    </div>
  )
}
