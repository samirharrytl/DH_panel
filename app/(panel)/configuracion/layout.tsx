import { Suspense } from 'react'
import { exigirAdmin } from '@/lib/auth'
import { Pestanas } from '@/components/pestanas'

const SECCIONES = [
  { href: '/configuracion/usuarios', texto: 'Usuarios' },
  { href: '/configuracion/parametros', texto: 'Parámetros' },
  { href: '/configuracion/plantillas', texto: 'Plantillas' },
]

export default async function LayoutConfiguracion({ children }: LayoutProps<'/configuracion'>) {
  await exigirAdmin()
  return (
    <>
      <h1 className="mb-3 text-2xl font-semibold text-tinta">Configuración</h1>
      <Suspense>
        <Pestanas items={SECCIONES} />
      </Suspense>
      {children}
    </>
  )
}
