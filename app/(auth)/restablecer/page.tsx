import type { Metadata } from 'next'
import Link from 'next/link'
import { Aviso, Campo, Entrada } from '@/components/legado'
import { BotonEnviar, Formulario } from '@/components/formulario'
import { crearClienteServidor } from '@/lib/supabase/server'
import { restablecerContrasena } from '../acciones'

export const metadata: Metadata = { title: 'Nueva contraseña' }

export default async function PaginaRestablecer() {
  const supabase = await crearClienteServidor()
  const { data } = await supabase.auth.getClaims()
  if (!data?.claims) {
    return (
      <>
        <Aviso tipo="alerta">El enlace venció o ya se usó.</Aviso>
        <p className="mt-4 text-center text-sm">
          <Link href="/recuperar" className="text-marino-700 hover:underline">
            Pedir un enlace nuevo
          </Link>
        </p>
      </>
    )
  }
  return (
    <>
      <h1 className="mb-4 text-lg font-semibold text-tinta">Crea tu nueva contraseña</h1>
      <Formulario accion={restablecerContrasena}>
        <Campo etiqueta="Nueva contraseña" ayuda="Al menos 8 caracteres.">
          <Entrada type="password" name="password" autoComplete="new-password" minLength={8} required />
        </Campo>
        <Campo etiqueta="Repite la contraseña">
          <Entrada type="password" name="confirmar" autoComplete="new-password" minLength={8} required />
        </Campo>
        <BotonEnviar className="w-full">Guardar e ingresar</BotonEnviar>
      </Formulario>
    </>
  )
}
