import { DISTRITOS_LIMA } from '@/lib/catalogos'
import { num } from '@/lib/formato'
import { Badge } from '@/components/ui/badge'
import type { Acceso } from './tipos'
import { Hash, IdCard, KeyRound } from 'lucide-react'

// Piezas sin estado que comparten la base de propiedades, la ficha del lead y la agenda

export const ID_DISTRITOS = 'distritos-lima'

// Sugerencias para los campos de distrito: se renderiza una vez por página y los campos usan list={ID_DISTRITOS}
export function ListaDistritos() {
  return (
    <datalist id={ID_DISTRITOS}>
      {DISTRITOS_LIMA.map((d) => (
        <option key={d} value={d} />
      ))}
    </datalist>
  )
}

export function caracteristicasTexto(i: {
  metraje: number | null
  dormitorios: number | null
  banos: number | null
  cocheras?: number | null
}) {
  return [
    i.metraje ? `${num(i.metraje)} m²` : null,
    i.dormitorios ? `${i.dormitorios} dorm.` : null,
    i.banos ? `${i.banos} ${i.banos === 1 ? 'baño' : 'baños'}` : null,
    i.cocheras ? `${i.cocheras} ${i.cocheras === 1 ? 'cochera' : 'cocheras'}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

export const tieneAcceso = (a: Acceso) => Boolean(a.acceso_llave || a.acceso_codigo || a.acceso_dni || a.acceso_otros)

// Consideraciones de acceso de una cita, visita o inmueble: llave, código, DNI y otras (HU-14, HU-26)
export function DatosAcceso({ acceso, vacio = 'Sin consideraciones de acceso' }: { acceso: Acceso; vacio?: string }) {
  if (!tieneAcceso(acceso)) return <p className="text-xs text-muted-foreground">{vacio}</p>
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-foreground">
      {acceso.acceso_llave && (
        <li className="inline-flex items-center gap-1.5">
          <KeyRound aria-hidden className="size-4 text-muted-foreground" />
          <span className="text-muted-foreground">Llave:</span> {acceso.acceso_llave}
        </li>
      )}
      {acceso.acceso_codigo && (
        <li className="inline-flex items-center gap-1.5">
          <Hash aria-hidden className="size-4 text-muted-foreground" />
          <span className="text-muted-foreground">Código:</span> {acceso.acceso_codigo}
        </li>
      )}
      {acceso.acceso_dni && (
        <li className="inline-flex items-center gap-1.5">
          <IdCard aria-hidden className="size-4 text-muted-foreground" />
          Piden DNI
        </li>
      )}
      {acceso.acceso_otros && (
        <li className="basis-full whitespace-pre-wrap">
          <span className="text-muted-foreground">Otros:</span> {acceso.acceso_otros}
        </li>
      )}
    </ul>
  )
}

// Días entre dos fechas YYYY-MM-DD (negativo si `hasta` ya pasó)
export const diasEntre = (desde: string, hasta: string) => Math.round((Date.parse(hasta) - Date.parse(desde)) / 86_400_000)

// HU-17: estado del vencimiento del contrato frente al parámetro de aviso
export function vencimientoContrato(venceEl: string | null, hoy: string, avisoDias: number) {
  if (!venceEl) return null
  const dias = diasEntre(hoy, venceEl)
  return { dias, vencido: dias < 0, porVencer: dias >= 0 && dias <= avisoDias }
}

export function InsigniaVencimiento({ venceEl, hoy, avisoDias }: { venceEl: string | null; hoy: string; avisoDias: number }) {
  const v = vencimientoContrato(venceEl, hoy, avisoDias)
  if (!v || (!v.vencido && !v.porVencer)) return null
  if (v.vencido) return <Badge variant="rojo">Contrato vencido</Badge>
  return <Badge variant="ambar">{v.dias === 0 ? 'Contrato vence hoy' : `Contrato vence en ${v.dias} d`}</Badge>
}

export const enlaceMapa = (direccion: string, distrito?: string | null) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([direccion, distrito, 'Lima, Perú'].filter(Boolean).join(', '))}`
