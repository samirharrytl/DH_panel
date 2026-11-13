import type { Metadata } from 'next'
import Link from 'next/link'
import { Campo } from '@/components/campos'
import { Input } from '@/components/ui/input'
import { BotonEnviar, Formulario } from '@/components/formulario'
import { pedirRecuperacion } from '../acciones'

export const metadata: Metadata = { title: 'Recuperar contraseña' }

export default function PaginaRecuperar() {
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold text-primary">Recuperar contraseña</h1>
      <p className="mb-4 text-sm text-muted-foreground">Te enviaremos un enlace para crear una nueva.</p>
      <Formulario accion={pedirRecuperacion} reiniciar>
        <Campo etiqueta="Correo">
          <Input type="email" name="email" autoComplete="email" required autoFocus />
        </Campo>
        <BotonEnviar className="w-full">Enviar enlace</BotonEnviar>
      </Formulario>
      <p className="mt-2 text-center text-sm">
        <Link href="/login" className="inline-block py-2 text-primary hover:underline">
          Volver a ingresar
        </Link>
      </p>
    </>
  )
}
