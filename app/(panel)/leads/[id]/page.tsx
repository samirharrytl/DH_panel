import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { exigirUsuario } from '@/lib/auth'
import { cargarLead } from '@/lib/datos/lead'
import { Aviso } from '@/components/ui'
import { Pestanas } from '@/components/pestanas'
import { Encabezado } from './encabezado'
import { SeccionResumen } from './secciones/resumen'
import { SeccionHistorial } from './secciones/historial'
import { SeccionChat } from './secciones/chat'
import { SeccionCalificacion } from './secciones/calificacion'
import { SeccionCitas } from './secciones/citas'
import { SeccionPerfil } from './secciones/perfil'
import { SeccionMatches } from './secciones/matches'
import { SeccionVisitas } from './secciones/visitas'
import { SeccionCierre } from './secciones/cierre'

export async function generateMetadata({ params }: PageProps<'/leads/[id]'>): Promise<Metadata> {
  const lead = await cargarLead((await params).id)
  return { title: lead?.persona.nombre ?? 'Lead' }
}

const REGISTRO: Record<string, string> = {
  nuevo: 'Lead registrado.',
  persona_existente: 'El teléfono ya existía: el lead se unió al registro de esa persona y su historial está abajo.',
  ya_activo: 'Este lead ya estaba activo: se unió a su registro. Revisa dónde quedó la conversación.',
  retomado: 'Lead que regresa dentro del plazo: se retomó donde quedó.',
  nuevo_ciclo: 'Lead que regresa después del plazo: se trata como nuevo, con su historial anterior visible.',
  baja: 'Esta persona pidió no ser contactada (Baja). No se le enviarán mensajes salvo que pida volver.',
}

export default async function PaginaLead({ params, searchParams }: PageProps<'/leads/[id]'>) {
  const usuario = await exigirUsuario()
  const { id } = await params
  const sp = await searchParams
  const lead = await cargarLead(id)
  if (!lead) notFound()

  const pestanas =
    lead.tipo === 'propietario'
      ? [
          { clave: 'resumen', texto: 'Seguimiento' },
          { clave: 'chat', texto: 'Chat' },
          { clave: 'calificacion', texto: 'Calificación' },
          { clave: 'citas', texto: 'Citas e inmueble' },
          { clave: 'historial', texto: 'Historial' },
        ]
      : [
          { clave: 'resumen', texto: 'Seguimiento' },
          { clave: 'chat', texto: 'Chat' },
          { clave: 'perfil', texto: 'Perfil y capacidad' },
          { clave: 'matches', texto: 'Matches' },
          { clave: 'visitas', texto: 'Visitas' },
          { clave: 'cierre', texto: 'Compraventa' },
          { clave: 'historial', texto: 'Historial' },
        ]
  if (lead.tipo === 'propietario' && lead.estado === 'cliente') pestanas.splice(4, 0, { clave: 'cierre', texto: 'Postventa' })
  const tab = typeof sp.tab === 'string' && pestanas.some((p) => p.clave === sp.tab) ? sp.tab : 'resumen'
  const props = { lead, usuario }
  const registro = typeof sp.registro === 'string' ? REGISTRO[sp.registro] : null

  return (
    <>
      <Encabezado lead={lead} usuario={usuario} />
      {registro && (
        <Aviso tipo={sp.registro === 'baja' ? 'alerta' : sp.registro === 'nuevo' ? 'exito' : 'info'} className="mb-4">
          {registro}
        </Aviso>
      )}
      {!lead.vigente && (
        <Aviso tipo="alerta" className="mb-4">
          Este es un ciclo anterior del lead (ciclo {lead.ciclo}). Se conserva como historial.
        </Aviso>
      )}
      <Suspense>
        <Pestanas
          param="tab"
          porDefecto="resumen"
          items={pestanas.map((p) => ({ href: `/leads/${lead.id}?tab=${p.clave}`, texto: p.texto }))}
        />
      </Suspense>
      {tab === 'resumen' && <SeccionResumen {...props} />}
      {tab === 'chat' && <SeccionChat {...props} />}
      {tab === 'historial' && <SeccionHistorial {...props} />}
      {tab === 'calificacion' && <SeccionCalificacion {...props} />}
      {tab === 'citas' && <SeccionCitas {...props} />}
      {tab === 'perfil' && <SeccionPerfil {...props} />}
      {tab === 'matches' && <SeccionMatches {...props} />}
      {tab === 'visitas' && <SeccionVisitas {...props} />}
      {tab === 'cierre' && <SeccionCierre {...props} />}
    </>
  )
}
