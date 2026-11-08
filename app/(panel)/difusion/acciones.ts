'use server'

import { revalidatePath } from 'next/cache'
import { exigirUsuario } from '@/lib/auth'
import { crearClienteServidor } from '@/lib/supabase/server'
import { deError, entero, exito, fallo, lista, texto, type Resultado } from '@/lib/acciones'
import { hoyLima } from '@/lib/formato'

// HU-28 y HU-29: el asesor confirma la publicación; queda una por red, cada una con su código para el
// enlace de WhatsApp.
export async function registrarPublicacion(_: Resultado | null, f: FormData): Promise<Resultado> {
  await exigirUsuario()
  const inmuebleId = texto(f, 'inmueble_id')
  const redes = lista(f, 'redes')
  const fecha = texto(f, 'fecha') ?? hoyLima()
  if (!inmuebleId) return fallo('Falta el inmueble')
  if (!redes.length) return fallo('Elige al menos una red')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return fallo('La fecha no es válida')
  if (fecha > hoyLima()) return fallo('La fecha no puede ser posterior a hoy: registra la publicación cuando la hagas')

  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.rpc('registrar_publicacion', {
    p_inmueble_id: inmuebleId,
    p_redes: redes,
    p_fecha: fecha,
    p_texto: texto(f, 'texto'),
  })
  if (error) return deError(error)
  const filas = (data ?? []) as { codigo: string; red: string }[]
  revalidatePath('/difusion')
  revalidatePath(`/inmuebles/${inmuebleId}`)
  return exito(
    filas.length === 1 ? `Publicación registrada en ${filas[0].red}` : `Publicación registrada en ${filas.length} redes`,
    { publicaciones: filas.map((p) => ({ codigo: p.codigo, red: p.red })) },
  )
}

// HU-30: enlace y métricas de la publicación, a mano mientras no haya integración con las redes
export async function guardarMetricas(_: Resultado | null, f: FormData): Promise<Resultado> {
  await exigirUsuario()
  const id = texto(f, 'id')
  const url = texto(f, 'url')
  const vistas = entero(f, 'vistas') ?? 0
  const interacciones = entero(f, 'interacciones') ?? 0
  if (!id) return fallo('Falta la publicación')
  if (url && !/^https?:\/\/\S+$/i.test(url)) return fallo('El enlace debe empezar con http:// o https://')
  if (vistas < 0 || interacciones < 0) return fallo('Las vistas e interacciones no pueden ser negativas')

  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from('publicaciones')
    .update({ url, vistas, interacciones, metricas_at: new Date().toISOString() })
    .eq('id', id)
    .select('inmueble_id')
    .maybeSingle()
  if (error) return deError(error)
  if (!data) return fallo('No se encontró la publicación')
  revalidatePath('/difusion')
  revalidatePath(`/inmuebles/${(data as { inmueble_id: string }).inmueble_id}`)
  return exito('Métricas guardadas')
}
