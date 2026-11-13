import { Suspense } from 'react'
import { EncabezadoPagina } from '@/components/campos'
import { Pestanas } from '@/components/pestanas'

const GUIAS = [
  { href: '/guias/leads', texto: 'Gestión de leads' },
  { href: '/guias/inmuebles', texto: 'Gestión de inmuebles' },
]

export default function LayoutGuias({ children }: LayoutProps<'/guias'>) {
  return (
    <>
      <EncabezadoPagina
        titulo="Guías"
        descripcion="Qué hacer en el panel, paso a paso. Los nombres resaltados son los botones y pestañas que ves en pantalla."
      />
      <Suspense>
        <Pestanas items={GUIAS} />
      </Suspense>
      <div className="max-w-3xl space-y-4">{children}</div>
    </>
  )
}
