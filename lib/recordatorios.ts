// Qué recordatorio automático le toca a una cita o visita programada (sin dependencias, para probarlo con node).
// Lima es UTC-5 todo el año. Solo se envía entre las 8:00 y las 20:59 de Lima.
// shortcut: no interpreta el horario preferido del lead (texto libre), cambiarlo cuando sea un rango estructurado.
const LIMA_MS = 5 * 3_600_000

const diaLima = (ms: number) => new Date(ms - LIMA_MS).toISOString().slice(0, 10)
const horaLima = (ms: number) => new Date(ms - LIMA_MS).getUTCHours()

export function avisoQueToca(
  inicio: string,
  enviados: { recordatorio_24h_at: string | null; recordatorio_dia_at: string | null },
  ahora: number,
): '24h' | 'dia' | null {
  const t = Date.parse(inicio)
  if (t <= ahora || t - ahora > 24 * 3_600_000) return null
  if (horaLima(ahora) < 8 || horaLima(ahora) >= 21) return null
  // El día de la cita va solo el del mismo día, así nunca salen los dos juntos
  if (diaLima(t) === diaLima(ahora)) return enviados.recordatorio_dia_at ? null : 'dia'
  return enviados.recordatorio_24h_at ? null : '24h'
}
