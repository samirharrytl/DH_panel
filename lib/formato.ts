// Formatos para Perú: fechas en America/Lima (UTC-5 todo el año, sin horario de verano) y soles.
export const ZONA = 'America/Lima'

const fFecha = new Intl.DateTimeFormat('es-PE', { timeZone: ZONA, day: '2-digit', month: '2-digit', year: 'numeric' })
const fFechaCorta = new Intl.DateTimeFormat('es-PE', { timeZone: ZONA, day: 'numeric', month: 'short' })
const fDia = new Intl.DateTimeFormat('es-PE', { timeZone: ZONA, weekday: 'long', day: 'numeric', month: 'long' })
const fHora = new Intl.DateTimeFormat('es-PE', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hour12: false })
const fSoles = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', maximumFractionDigits: 0 })
const fNumero = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 1 })

type Fecha = string | Date | null | undefined
const aFecha = (d: Fecha) => (d ? (typeof d === 'string' ? new Date(d.length === 10 ? `${d}T12:00:00-05:00` : d) : d) : null)

export const fecha = (d: Fecha) => (aFecha(d) ? fFecha.format(aFecha(d)!) : '—')
export const fechaCorta = (d: Fecha) => (aFecha(d) ? fFechaCorta.format(aFecha(d)!) : '—')
export const hora = (d: Fecha) => (aFecha(d) ? fHora.format(aFecha(d)!) : '—')
export const fechaHora = (d: Fecha) => (aFecha(d) ? `${fFecha.format(aFecha(d)!)} ${fHora.format(aFecha(d)!)}` : '—')
export const diaLargo = (d: Fecha) => {
  if (!aFecha(d)) return '—'
  const t = fDia.format(aFecha(d)!)
  return t.charAt(0).toUpperCase() + t.slice(1)
}
export const soles = (n: number | string | null | undefined) =>
  n === null || n === undefined || n === '' ? '—' : fSoles.format(Number(n)).replace('S/', 'S/ ').replace('  ', ' ')
export const num = (n: number | string | null | undefined) => (n === null || n === undefined ? '—' : fNumero.format(Number(n)))

export function telefono(t: string | null | undefined) {
  if (!t) return '—'
  if (t.startsWith('51') && t.length === 11) return `+51 ${t.slice(2, 5)} ${t.slice(5, 8)} ${t.slice(8)}`
  return `+${t}`
}

// Fecha de hoy en Lima como YYYY-MM-DD
export function hoyLima(desplazamientoDias = 0) {
  const d = new Date(Date.now() + desplazamientoDias * 86_400_000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(d)
}

// Valor de <input type="datetime-local"> (hora de Lima) a ISO con zona, y viceversa
export const localAIso = (valor: string) => (valor.length === 16 ? `${valor}:00-05:00` : `${valor}-05:00`)
export function isoALocal(iso: string | Date) {
  const d = new Date(new Date(iso).getTime() - 5 * 3_600_000)
  return d.toISOString().slice(0, 16)
}

// Momento actual en milisegundos. Las páginas se renderizan por petición, así que es seguro usarlo al renderizar.
export const ahoraMs = () => Date.now()

export function relativo(d: Fecha) {
  const f = aFecha(d)
  if (!f) return '—'
  const min = Math.round((Date.now() - f.getTime()) / 60_000)
  const futuro = min < 0
  const abs = Math.abs(min)
  const t =
    abs < 1 ? 'ahora' : abs < 60 ? `${abs} min` : abs < 1440 ? `${Math.round(abs / 60)} h` : `${Math.round(abs / 1440)} d`
  if (t === 'ahora') return t
  return futuro ? `en ${t}` : `hace ${t}`
}
