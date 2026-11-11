'use server'

import { revalidatePath } from 'next/cache'
import { exigirAdmin } from '@/lib/auth'
import { crearClienteServidor } from '@/lib/supabase/server'
import { deError, exito, fallo, texto, type Resultado } from '@/lib/acciones'

function interpretar(tipo: string, crudo: string): unknown {
  switch (tipo) {
    case 'entero': {
      const n = Number(crudo)
      if (!Number.isInteger(n) || n < 0) throw new Error('Ingresa un número entero mayor o igual a 0')
      return n
    }
    case 'decimal': {
      const n = Number(crudo.replace(',', '.'))
      if (!crudo.trim() || !Number.isFinite(n) || n < 0) throw new Error('Ingresa un número mayor o igual a 0, por ejemplo 0.0703')
      return n
    }
    case 'lista_enteros': {
      const dias = crudo
        .split(/[,\s]+/)
        .filter(Boolean)
        .map(Number)
      if (dias.some((d) => !Number.isInteger(d) || d < 1)) throw new Error('Ingresa días separados por coma, por ejemplo: 1, 3, 4')
      const ordenados = [...new Set(dias)].sort((a, b) => a - b)
      return ordenados
    }
    case 'lista_texto':
      return crudo
        .split(/\n|,/)
        .map((s) => s.trim())
        .filter(Boolean)
    default:
      return crudo.trim()
  }
}

// HU-03: el administrador cambia parámetros sin tocar el código
export async function guardarParametro(_: Resultado | null, f: FormData): Promise<Resultado> {
  await exigirAdmin()
  const clave = texto(f, 'clave')
  const tipo = texto(f, 'tipo') ?? 'texto'
  if (!clave) return fallo('Parámetro no válido')
  let valor: unknown
  try {
    valor = interpretar(tipo, String(f.get('valor') ?? ''))
  } catch (e) {
    return fallo((e as Error).message)
  }
  const supabase = await crearClienteServidor()
  const { error } = await supabase.from('parametros').update({ valor }).eq('clave', clave)
  if (error) return deError(error)
  revalidatePath('/', 'layout')
  return exito('Guardado')
}

export async function restablecerParametro(clave: string): Promise<Resultado> {
  await exigirAdmin()
  const supabase = await crearClienteServidor()
  const { data } = await supabase.from('parametros').select('valor_defecto').eq('clave', clave).single()
  const { error } = await supabase.from('parametros').update({ valor: data?.valor_defecto }).eq('clave', clave)
  if (error) return deError(error)
  revalidatePath('/', 'layout')
  return exito('Restablecido')
}
