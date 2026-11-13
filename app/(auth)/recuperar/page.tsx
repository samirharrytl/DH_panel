import type { Metadata } from 'next'
import Link from 'next/link'
import { Campo, Entrada } from '@/components/legado'
import { BotonEnviar, Formulario } from '@/components/formulario'
import { pedirRecuperacion } from '../acciones'

export const metadata: Metadata = { title: 'Recuperar contraseña' }

export default function PaginaRecuperar() {
  return (
    <>
      <h1 className="mb-1 text-lg font-semibold text-tinta">Recuperar contraseña</h1>
      <p className="mb-4 text-sm text-suave">Te enviaremos un enlace para crear una nueva.</p>
      <Formulario accion={pedirRecuperacion} reiniciar>
        <Campo etiqueta="Correo">
          <Entrada type="email" name="email" autoComplete="email" required autoFocus />
        </Campo>
        <BotonEnviar className="w-full">Enviar enlace</BotonEnviar>
      </Formulario>
      <p className="mt-4 text-center text-sm">
        <Link href="/login" className="text-marino-700 hover:underline">
          Volver a ingresar
        </Link>
      </p>
    </>
  )
}
