import type { Metadata } from 'next'
import { EncabezadoPagina } from '@/components/campos'
import { Lanzador } from './lanzador'

export const metadata: Metadata = { title: 'Guías' }

export default function PaginaGuias() {
  return (
    <>
      <EncabezadoPagina
        titulo="Guías"
        descripcion="Recorridos dentro del panel: la guía te lleva a cada pantalla, te señala dónde tocar y avanza contigo. Puedes salir cuando quieras."
      />
      <Lanzador />
    </>
  )
}
