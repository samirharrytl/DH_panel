import { RESPUESTAS_MATCH, TIPOS_INMUEBLE, etiqueta, type RespuestaMatch } from '@/lib/catalogos'
import { num, soles } from '@/lib/formato'
import { cx } from '@/components/legado'

// Formatos del match compartidos por la ficha del lead (servidor y cliente) y la ficha del inmueble

export type InmuebleLinea = {
  codigo: string
  tipo: string
  distrito: string
  precio: number | string | null
  dormitorios: number | null
  metraje: number | string | null
}

// Desglose del puntaje que devuelve calcular_match (supuestos.md: zona 30, precio 25, dormitorios 15,
// metraje 10, imprescindibles 20, ±5 por respuestas previas)
export type DetalleMatch = {
  puntaje?: number | string
  zona?: number | string
  precio?: number | string
  dormitorios?: number | string
  metraje?: number | string
  imprescindibles?: number | string
  ajuste_respuestas?: number | string
  excluido?: string | null
}

// "Departamento en Miraflores · S/ 420,000 · 2 dorm. · 80 m² (DH-0003)"
export function lineaInmueble(i: InmuebleLinea) {
  const partes = [`${etiqueta(TIPOS_INMUEBLE, i.tipo)} en ${i.distrito}`]
  if (i.precio !== null && i.precio !== '') partes.push(soles(i.precio))
  if (i.dormitorios !== null) partes.push(`${i.dormitorios} dorm.`)
  if (i.metraje !== null && i.metraje !== '') partes.push(`${num(i.metraje)} m²`)
  return `${partes.join(' · ')} (${i.codigo})`
}

export const colorPuntaje = (p: number) => (p >= 80 ? 'verde' : p >= 50 ? 'ambar' : 'gris')

export const COLOR_RESPUESTA: Record<RespuestaMatch, string> = {
  me_interesa: 'verde',
  no_me_interesa: 'rojo',
  ver_parecidos: 'azul',
}

export const textoRespuesta = (r: string | null | undefined) =>
  r ? (RESPUESTAS_MATCH[r as RespuestaMatch] ?? r) : 'Sin respuesta'

const PARTES = [
  ['zona', 'Zona', 30],
  ['precio', 'Precio', 25],
  ['dormitorios', 'Dorm.', 15],
  ['metraje', 'Metraje', 10],
  ['imprescindibles', 'Imprescindibles', 20],
] as const

export function Desglose({ detalle, className }: { detalle: DetalleMatch; className?: string }) {
  const ajuste = Number(detalle.ajuste_respuestas ?? 0)
  return (
    <ul className={cx('flex flex-wrap gap-1 text-xs', className)}>
      {PARTES.map(([clave, texto, maximo]) => {
        const valor = Number(detalle[clave] ?? 0)
        return (
          <li
            key={clave}
            className={cx(
              'rounded px-1.5 py-0.5',
              valor >= maximo ? 'bg-emerald-50 text-emerald-800' : valor > 0 ? 'bg-amber-50 text-amber-800' : 'bg-gray-100 text-gray-600',
            )}
          >
            {texto} {num(valor)}/{maximo}
          </li>
        )
      })}
      {ajuste !== 0 && (
        <li className={cx('rounded px-1.5 py-0.5', ajuste > 0 ? 'bg-sky-50 text-sky-800' : 'bg-red-50 text-red-800')}>
          Respuestas previas {ajuste > 0 ? '+' : ''}
          {num(ajuste)}
        </li>
      )}
    </ul>
  )
}
