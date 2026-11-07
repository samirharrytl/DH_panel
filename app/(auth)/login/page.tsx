import type { Metadata } from 'next'
import Link from 'next/link'
import { Aviso, Campo, Entrada } from '@/components/ui'
import { BotonEnviar, Formulario } from '@/components/formulario'
import { iniciarSesion } from '../acciones'

export const metadata: Metadata = { title: 'Ingresar' }

const MOTIVOS: Record<string, string> = {
  inactividad: 'Tu sesión se cerró por inactividad. Vuelve a ingresar.',
  sin_acceso: 'Tu usuario no tiene acceso al panel o fue desactivado.',
  salida: 'Cerraste sesión.',
}

export default async function PaginaLogin({ searchParams }: PageProps<'/login'>) {
  const { motivo, siguiente } = await searchParams
  return (
    <>
      <h1 className="mb-4 text-lg font-semibold text-tinta">Ingresar</h1>
      {typeof motivo === 'string' && MOTIVOS[motivo] && (
        <Aviso tipo={motivo === 'salida' ? 'info' : 'alerta'} className="mb-4">
          {MOTIVOS[motivo]}
        </Aviso>
      )}
      <Formulario accion={iniciarSesion}>
        <input type="hidden" name="siguiente" value={typeof siguiente === 'string' ? siguiente : ''} />
        <Campo etiqueta="Correo">
          <Entrada type="email" name="email" autoComplete="email" required autoFocus />
        </Campo>
        <Campo etiqueta="Contraseña">
          <Entrada type="password" name="password" autoComplete="current-password" required />
        </Campo>
        <BotonEnviar className="w-full">Ingresar</BotonEnviar>
      </Formulario>
      <p className="mt-4 text-center text-sm">
        <Link href="/recuperar" className="text-marino-700 hover:underline">
          ¿Olvidaste tu contraseña?
        </Link>
      </p>
    </>
  )
}
