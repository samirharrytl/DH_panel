'use server'

import { revalidatePath } from 'next/cache'
import { exigirUsuario } from '@/lib/auth'
import { crearClienteServidor } from '@/lib/supabase/server'
import { casilla, deError, entero, exito, fallo, lista, numero, siNo, texto, type Resultado } from '@/lib/acciones'
import { CONSERVACION, TIPOS_INMUEBLE } from '@/lib/catalogos'
import { describirInmueble, enviarMensaje, variablesLead } from '@/lib/mensajeria'

function refrescar(inmuebleId: string | null, leadId?: string | null) {
  revalidatePath('/inmuebles')
  revalidatePath('/')
  if (inmuebleId) revalidatePath(`/inmuebles/${inmuebleId}`)
  if (leadId) revalidatePath(`/leads/${leadId}`)
}

async function leadDelInmueble(inmuebleId: string) {
  const supabase = await crearClienteServidor()
  const { data } = await supabase.from('inmuebles').select('propietario_lead_id').eq('id', inmuebleId).maybeSingle()
  return (data?.propietario_lead_id as string | null) ?? null
}

// Datos del inmueble. Solo las columnas con GRANT; la RLS deja editar al admin y al asesor del inmueble.
export async function editarInmueble(_: Resultado | null, f: FormData): Promise<Resultado> {
  await exigirUsuario()
  const id = texto(f, 'inmueble_id')
  const tipo = texto(f, 'tipo')
  const conservacion = texto(f, 'conservacion')
  const direccion = texto(f, 'direccion')
  const distrito = texto(f, 'distrito')
  const precio = numero(f, 'precio')
  if (!id) return fallo('Inmueble no indicado')
  if (!tipo || !(tipo in TIPOS_INMUEBLE)) return fallo('Elige el tipo de inmueble')
  if (!direccion || !distrito) return fallo('La dirección y el distrito son obligatorios')
  if (!precio || precio <= 0) return fallo('Indica el precio de venta')
  if (conservacion && !(conservacion in CONSERVACION)) return fallo('Estado de conservación no válido')
  const rentMin = numero(f, 'rentabilidad_min')
  const rentMax = numero(f, 'rentabilidad_max')
  if (rentMax !== null && rentMin === null) return fallo('Indica la rentabilidad mínima')
  if (rentMin !== null && rentMax !== null && rentMax < rentMin) return fallo('La rentabilidad máxima no puede ser menor que la mínima')

  const otras = (texto(f, 'otras_caracteristicas') ?? '')
    .split(',')
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean)
  const caracteristicas = [...new Set([...lista(f, 'caracteristicas'), ...otras])]

  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from('inmuebles')
    .update({
      tipo,
      direccion,
      distrito,
      referencia: texto(f, 'referencia'),
      metraje: numero(f, 'metraje'),
      dormitorios: entero(f, 'dormitorios'),
      banos: entero(f, 'banos'),
      cocheras: entero(f, 'cocheras') ?? 0,
      ascensor: casilla(f, 'ascensor'),
      mascotas: casilla(f, 'mascotas'),
      caracteristicas,
      precio_esperado: numero(f, 'precio_esperado'),
      precio,
      conservacion,
      descripcion: texto(f, 'descripcion'),
      destacado: casilla(f, 'destacado'),
      rentabilidad_min: rentMin,
      rentabilidad_max: rentMax,
      anios_recupero: numero(f, 'anios_recupero'),
    })
    .eq('id', id)
    .select('id, propietario_lead_id')
  if (error) return deError(error)
  if (!data?.length) return fallo('No puedes editar este inmueble')
  refrescar(id, data[0].propietario_lead_id as string | null)
  return exito('Inmueble actualizado')
}

// Datos de acceso (llave, código, DNI, otros): las visitas los copian al agendarse (HU-26)
export async function editarAcceso(_: Resultado | null, f: FormData): Promise<Resultado> {
  await exigirUsuario()
  const id = texto(f, 'inmueble_id')
  if (!id) return fallo('Inmueble no indicado')
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from('inmuebles')
    .update({
      acceso_llave: texto(f, 'acceso_llave'),
      acceso_codigo: texto(f, 'acceso_codigo'),
      acceso_dni: casilla(f, 'acceso_dni'),
      acceso_otros: texto(f, 'acceso_otros'),
    })
    .eq('id', id)
    .select('id')
  if (error) return deError(error)
  if (!data?.length) return fallo('No puedes editar este inmueble')
  refrescar(id)
  return exito('Datos de acceso actualizados')
}

// HU-15: filas de las fotos ya subidas a Storage desde el navegador
export async function registrarFotos(inmuebleId: string, rutas: string[]): Promise<Resultado> {
  await exigirUsuario()
  if (!rutas.length) return exito()
  if (rutas.some((r) => !r.startsWith(`${inmuebleId}/`) || r.includes('..'))) return fallo('Ruta de foto no válida')
  const supabase = await crearClienteServidor()
  const { data: ultima } = await supabase
    .from('inmueble_fotos')
    .select('orden')
    .eq('inmueble_id', inmuebleId)
    .order('orden', { ascending: false })
    .limit(1)
    .maybeSingle()
  const base = ((ultima?.orden as number | undefined) ?? -1) + 1
  const { error } = await supabase
    .from('inmueble_fotos')
    .insert(rutas.map((ruta, i) => ({ inmueble_id: inmuebleId, ruta, orden: base + i })))
  if (error) return deError(error)
  refrescar(inmuebleId, await leadDelInmueble(inmuebleId))
  return exito(`${rutas.length} foto(s) agregada(s)`)
}

export async function borrarFoto(fotoId: string): Promise<Resultado> {
  await exigirUsuario()
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.from('inmueble_fotos').delete().eq('id', fotoId).select('inmueble_id, ruta')
  if (error) return deError(error)
  if (!data?.length) return fallo('No puedes borrar esta foto')
  const { inmueble_id, ruta } = data[0] as { inmueble_id: string; ruta: string }
  const { error: e } = await supabase.storage.from('inmuebles').remove([ruta])
  refrescar(inmueble_id, await leadDelInmueble(inmueble_id))
  return exito(e ? 'Foto quitada de la ficha (el archivo no se pudo borrar de Storage)' : 'Foto borrada')
}

// La portada es la foto con menor `orden` (así la elige v_inmuebles)
export async function hacerPortada(fotoId: string): Promise<Resultado> {
  await exigirUsuario()
  const supabase = await crearClienteServidor()
  const { data: foto } = await supabase.from('inmueble_fotos').select('inmueble_id').eq('id', fotoId).maybeSingle()
  if (!foto) return fallo('Foto no encontrada')
  const { data: primera } = await supabase
    .from('inmueble_fotos')
    .select('orden')
    .eq('inmueble_id', foto.inmueble_id)
    .order('orden')
    .limit(1)
    .maybeSingle()
  const { data, error } = await supabase
    .from('inmueble_fotos')
    .update({ orden: ((primera?.orden as number | undefined) ?? 0) - 1 })
    .eq('id', fotoId)
    .select('id')
  if (error) return deError(error)
  if (!data?.length) return fallo('No puedes editar este inmueble')
  refrescar(foto.inmueble_id as string)
  return exito('Portada actualizada')
}

function datosContrato(f: FormData) {
  const fecha = texto(f, 'fecha_firma')
  const exclusividad = siNo(f, 'exclusividad')
  const autoriza = siNo(f, 'autoriza_publicar')
  const plazo = entero(f, 'plazo_meses')
  const comision = numero(f, 'comision_pct')
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: 'Indica la fecha de firma' }
  if (exclusividad === null) return { error: 'Indica si el contrato es con exclusividad' }
  if (autoriza === null) return { error: 'Indica si el propietario autoriza publicar el inmueble' }
  if (!plazo || plazo <= 0) return { error: 'Indica el plazo en meses' }
  if (comision === null || comision < 0 || comision > 100) return { error: 'La comisión debe estar entre 0 % y 100 %' }
  return {
    datos: {
      p_fecha_firma: fecha,
      p_exclusividad: exclusividad,
      p_plazo_meses: plazo,
      p_comision_pct: comision,
      p_autoriza_publicar: autoriza,
      p_notas: texto(f, 'notas'),
    },
  }
}

function rutaContrato(f: FormData, inmuebleId: string) {
  const ruta = texto(f, 'archivo_ruta')
  if (!ruta) return { ruta: null }
  if (!ruta.startsWith(`${inmuebleId}/`) || ruta.includes('..')) return { error: 'Ruta de la copia escaneada no válida' }
  return { ruta }
}

// HU-16: el inmueble pasa a "En cartera" y el propietario a Cliente
export async function registrarContrato(_: Resultado | null, f: FormData): Promise<Resultado> {
  await exigirUsuario()
  const inmuebleId = texto(f, 'inmueble_id')
  if (!inmuebleId) return fallo('Inmueble no indicado')
  const c = datosContrato(f)
  if (c.error || !c.datos) return fallo(c.error ?? 'Datos incompletos')
  const archivo = rutaContrato(f, inmuebleId)
  if (archivo.error) return fallo(archivo.error)
  const supabase = await crearClienteServidor()
  const { error } = await supabase.rpc('registrar_contrato', { p_inmueble_id: inmuebleId, ...c.datos, p_archivo_ruta: archivo.ruta })
  if (error) return deError(error)
  refrescar(inmuebleId, await leadDelInmueble(inmuebleId))
  revalidatePath('/leads')
  return exito('Contrato registrado: el inmueble está En cartera y el propietario es Cliente')
}

// HU-17: renovar registra un contrato nuevo ligado al anterior
export async function renovarContrato(_: Resultado | null, f: FormData): Promise<Resultado> {
  await exigirUsuario()
  const inmuebleId = texto(f, 'inmueble_id')
  const contratoId = texto(f, 'contrato_id')
  if (!inmuebleId || !contratoId) return fallo('Contrato no indicado')
  const c = datosContrato(f)
  if (c.error || !c.datos) return fallo(c.error ?? 'Datos incompletos')
  const archivo = rutaContrato(f, inmuebleId)
  if (archivo.error) return fallo(archivo.error)
  const supabase = await crearClienteServidor()
  const { error } = await supabase.rpc('renovar_contrato', { p_contrato_id: contratoId, ...c.datos, p_archivo_ruta: archivo.ruta })
  if (error) return deError(error)
  refrescar(inmuebleId, await leadDelInmueble(inmuebleId))
  return exito('Contrato renovado')
}

export async function retirarInmueble(_: Resultado | null, f: FormData): Promise<Resultado> {
  await exigirUsuario()
  const inmuebleId = texto(f, 'inmueble_id')
  if (!inmuebleId) return fallo('Inmueble no indicado')
  const supabase = await crearClienteServidor()
  const { error } = await supabase.rpc('retirar_inmueble', { p_inmueble_id: inmuebleId, p_motivo: texto(f, 'motivo') })
  if (error) return deError(error)
  refrescar(inmuebleId, await leadDelInmueble(inmuebleId))
  return exito('Inmueble retirado de la base')
}

// HU-30: envía al propietario el resumen del periodo con la plantilla "insights" y lo guarda
export async function enviarInsights(inmuebleId: string, desde: string, hasta: string, resumen: string): Promise<Resultado> {
  await exigirUsuario()
  const supabase = await crearClienteServidor()
  const leadId = await leadDelInmueble(inmuebleId)
  if (!leadId) return fallo('El inmueble no tiene propietario registrado')
  const { personaId, ...variables } = await variablesLead(leadId)
  const { data: i } = await supabase.from('inmuebles').select('codigo, tipo, distrito').eq('id', inmuebleId).single()
  const envio = await enviarMensaje({
    personaId,
    leadId,
    plantilla: 'insights',
    variables: { ...variables, inmueble: i ? describirInmueble(i) : variables.inmueble, resumen },
    metadata: { inmueble_id: inmuebleId, desde, hasta },
  })
  if (!envio.ok) return fallo(envio.error)
  const { error } = await supabase.rpc('guardar_insights', {
    p_inmueble_id: inmuebleId,
    p_desde: desde,
    p_hasta: hasta,
    p_texto: envio.cuerpo,
    p_mensaje_id: envio.mensajeId,
  })
  if (error) return deError(error)
  refrescar(inmuebleId, leadId)
  return exito(envio.advertencia ?? 'Resumen enviado al propietario')
}
