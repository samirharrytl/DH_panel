import 'server-only'
import type { PostgrestError } from '@supabase/supabase-js'

import type { Resultado } from '@/lib/resultado'
export type { Resultado }

export const exito = (mensaje?: string, datos?: Record<string, unknown>): Resultado => ({ ok: true, mensaje, datos })
export const fallo = (error: string): Resultado => ({ ok: false, error })

// Traduce errores de Postgres/PostgREST a un mensaje para el usuario. Las funciones SQL ya lanzan
// mensajes en español con raise exception; esos se muestran tal cual.
export function mensajeError(error: PostgrestError | Error | null | undefined): string {
  if (!error) return 'Ocurrió un error inesperado'
  const e = error as PostgrestError
  if (e.code === '42501' && !/^[A-ZÁÉÍÓÚÑ]/.test(e.message)) return 'No tienes permiso para esta acción'
  if (e.code === '23505') return 'Ya existe un registro con esos datos'
  if (e.code === '23514') return 'Algún dato no es válido'
  if (e.code === 'PGRST116') return 'No se encontró el registro'
  return e.message || 'Ocurrió un error inesperado'
}

export const deError = (error: PostgrestError | Error | null | undefined): Resultado => fallo(mensajeError(error))

// Lectura de FormData
export const texto = (f: FormData, k: string) => {
  const v = f.get(k)
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}
export const numero = (f: FormData, k: string) => {
  const v = texto(f, k)
  if (v === null) return null
  const n = Number(v.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}
export const entero = (f: FormData, k: string) => {
  const n = numero(f, k)
  return n === null ? null : Math.trunc(n)
}
export const casilla = (f: FormData, k: string) => f.get(k) === 'on' || f.get(k) === 'true'
export const siNo = (f: FormData, k: string) => {
  const v = f.get(k)
  return v === 'si' ? true : v === 'no' ? false : null
}
export const lista = (f: FormData, k: string) =>
  f
    .getAll(k)
    .map((v) => String(v).trim())
    .filter(Boolean)
