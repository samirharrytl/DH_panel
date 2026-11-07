import { exigirUsuario } from '@/lib/auth'
import { EncabezadoPagina } from '@/components/ui'

export default async function PaginaHoy() {
  const usuario = await exigirUsuario()
  return <EncabezadoPagina titulo={`Hola, ${usuario.nombre.split(' ')[0]}`} descripcion="Pendientes de hoy" />
}
