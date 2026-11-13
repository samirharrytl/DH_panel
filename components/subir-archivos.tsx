'use client'

import Image from 'next/image'
import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { crearClienteNavegador } from '@/lib/supabase/navegador'
import { Boton, cx } from '@/components/legado'
import type { Resultado } from '@/lib/resultado'

// Buckets privados de Storage. Las políticas solo dejan subir a quien puede editar el inmueble, y la
// carpeta raíz de cada archivo es el id del inmueble.
export type Bucket = 'inmuebles' | 'contratos'

const REGLAS: Record<Bucket, { tipos: Record<string, string>; maxMb: number; texto: string }> = {
  inmuebles: {
    tipos: { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' },
    maxMb: 10,
    texto: 'JPG, PNG o WEBP de hasta 10 MB',
  },
  contratos: {
    tipos: { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' },
    maxMb: 20,
    texto: 'PDF, JPG o PNG de hasta 20 MB',
  },
}

export function validarArchivo(bucket: Bucket, archivo: File): string | null {
  const r = REGLAS[bucket]
  if (!r.tipos[archivo.type]) return `${archivo.name}: formato no admitido (${r.texto})`
  if (archivo.size > r.maxMb * 1024 * 1024) return `${archivo.name}: pesa más de ${r.maxMb} MB`
  return null
}

function traducir(mensaje: string) {
  if (/row-level security|unauthorized|not authorized/i.test(mensaje)) return 'no tienes permiso para subir archivos a este inmueble'
  if (/size|too large/i.test(mensaje)) return 'el archivo es demasiado grande'
  if (/mime|type/i.test(mensaje)) return 'formato no admitido'
  return mensaje
}

export type Subida = { subidos: { archivo: File; ruta: string }[]; errores: string[] }

// Sube los archivos desde el navegador con la sesión del usuario, en `${inmuebleId}/${uuid}.${ext}`.
export async function subirArchivos(bucket: Bucket, inmuebleId: string, archivos: File[]): Promise<Subida> {
  const supabase = crearClienteNavegador()
  const resultados = await Promise.all(
    archivos.map(async (archivo) => {
      const invalido = validarArchivo(bucket, archivo)
      if (invalido) return { archivo, error: invalido }
      const ruta = `${inmuebleId}/${crypto.randomUUID()}.${REGLAS[bucket].tipos[archivo.type]}`
      const { error } = await supabase.storage.from(bucket).upload(ruta, archivo, { contentType: archivo.type, upsert: false })
      return error ? { archivo, error: `${archivo.name}: ${traducir(error.message)}` } : { archivo, ruta }
    }),
  )
  return {
    subidos: resultados.flatMap((r) => ('ruta' in r && r.ruta ? [{ archivo: r.archivo, ruta: r.ruta }] : [])),
    errores: resultados.flatMap((r) => ('error' in r && r.error ? [r.error] : [])),
  }
}

// Sube fotos del inmueble y registra sus filas con la Server Action. Si el registro falla, borra lo subido
// para no dejar archivos huérfanos.
export async function subirFotosInmueble(
  inmuebleId: string,
  archivos: File[],
  registrar: (inmuebleId: string, rutas: string[]) => Promise<Resultado>,
): Promise<{ subidos: File[]; error: string | null }> {
  const { subidos, errores } = await subirArchivos('inmuebles', inmuebleId, archivos)
  if (subidos.length) {
    const r = await registrar(
      inmuebleId,
      subidos.map((s) => s.ruta),
    )
    if (!r.ok) {
      await crearClienteNavegador()
        .storage.from('inmuebles')
        .remove(subidos.map((s) => s.ruta))
      return { subidos: [], error: r.error }
    }
  }
  return {
    subidos: subidos.map((s) => s.archivo),
    error: errores.length ? `No se subieron ${errores.length} archivo(s): ${errores.join(' · ')}` : null,
  }
}

export type ArchivoElegido = { id: string; archivo: File; vista: string | null }

// Archivos elegidos y aún no subidos, con vista previa de las imágenes. No usa `name`, así que los
// archivos nunca viajan dentro del FormData de una Server Action.
export function useArchivos(bucket: Bucket, multiple = true) {
  const [items, setItems] = useState<ArchivoElegido[]>([])
  const [error, setError] = useState<string | null>(null)
  const vistas = useRef(new Set<string>())

  useEffect(() => {
    const set = vistas.current
    return () => set.forEach((u) => URL.revokeObjectURL(u))
  }, [])

  const liberar = (i: ArchivoElegido) => {
    if (!i.vista) return
    URL.revokeObjectURL(i.vista)
    vistas.current.delete(i.vista)
  }

  function agregar(lista: FileList | null) {
    if (!lista?.length) return
    const nuevos: ArchivoElegido[] = []
    const errores: string[] = []
    for (const archivo of Array.from(lista)) {
      const invalido = validarArchivo(bucket, archivo)
      if (invalido) {
        errores.push(invalido)
        continue
      }
      const vista = archivo.type.startsWith('image/') ? URL.createObjectURL(archivo) : null
      if (vista) vistas.current.add(vista)
      nuevos.push({ id: crypto.randomUUID(), archivo, vista })
    }
    setError(errores.length ? errores.join(' · ') : null)
    if (multiple) {
      setItems([...items, ...nuevos])
    } else if (nuevos.length) {
      items.forEach(liberar)
      setItems(nuevos.slice(0, 1))
    }
  }

  function quitar(archivos: File[]) {
    const fuera = items.filter((i) => archivos.includes(i.archivo))
    fuera.forEach(liberar)
    setItems(items.filter((i) => !archivos.includes(i.archivo)))
  }

  function limpiar() {
    items.forEach(liberar)
    setItems([])
    setError(null)
  }

  return { bucket, multiple, items, error, setError, agregar, quitar, limpiar, archivos: items.map((i) => i.archivo) }
}

export type ControlArchivos = ReturnType<typeof useArchivos>

const tamano = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`)

export function SelectorArchivos({
  control,
  etiqueta,
  disabled,
}: {
  control: ControlArchivos
  etiqueta: string
  disabled?: boolean
}) {
  const entrada = useRef<HTMLInputElement>(null)
  const reglas = REGLAS[control.bucket]
  return (
    <div className="space-y-2">
      <input
        ref={entrada}
        type="file"
        accept={Object.keys(reglas.tipos).join(',')}
        multiple={control.multiple}
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          control.agregar(e.target.files)
          e.target.value = ''
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Boton variante="secundario" tamano="sm" disabled={disabled} onClick={() => entrada.current?.click()}>
          {etiqueta}
        </Boton>
        <span className="text-xs text-suave">{reglas.texto}</span>
      </div>
      {control.error && <p className="text-xs text-red-700">{control.error}</p>}
      {control.items.length > 0 && (
        <ul className={cx(control.bucket === 'inmuebles' ? 'grid grid-cols-3 gap-2 sm:grid-cols-4' : 'space-y-1')}>
          {control.items.map((i) => (
            <li key={i.id} className="relative">
              {i.vista && control.bucket === 'inmuebles' ? (
                <div className="relative aspect-square overflow-hidden rounded-lg border border-borde bg-fondo">
                  <Image src={i.vista} alt={i.archivo.name} fill unoptimized sizes="120px" className="object-cover" />
                </div>
              ) : (
                <p className="truncate rounded-lg border border-borde px-3 py-2 pr-9 text-sm text-tinta">
                  {i.archivo.name} <span className="text-xs text-suave">({tamano(i.archivo.size)})</span>
                </p>
              )}
              <button
                type="button"
                onClick={() => control.quitar([i.archivo])}
                disabled={disabled}
                className="absolute top-1 right-1 rounded-full bg-white/90 px-1.5 text-sm text-suave shadow hover:text-red-700"
                aria-label={`Quitar ${i.archivo.name}`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Subir más fotos a un inmueble existente (galería de la ficha)
export function SubirFotos({
  inmuebleId,
  registrar,
}: {
  inmuebleId: string
  registrar: (inmuebleId: string, rutas: string[]) => Promise<Resultado>
}) {
  const fotos = useArchivos('inmuebles')
  const [pendiente, iniciar] = useTransition()
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)
  const router = useRouter()

  return (
    <div className="space-y-2">
      <SelectorArchivos control={fotos} etiqueta="Elegir fotos" disabled={pendiente} />
      {fotos.items.length > 0 && (
        <Boton
          tamano="sm"
          disabled={pendiente}
          onClick={() => {
            setAviso(null)
            iniciar(async () => {
              const r = await subirFotosInmueble(inmuebleId, fotos.archivos, registrar)
              fotos.quitar(r.subidos)
              setAviso(
                r.error
                  ? { ok: false, texto: r.error }
                  : { ok: true, texto: `${r.subidos.length} foto(s) agregada(s)` },
              )
              if (r.subidos.length) router.refresh()
            })
          }}
        >
          {pendiente ? 'Subiendo…' : `Subir ${fotos.items.length} foto(s)`}
        </Boton>
      )}
      {aviso && <p className={cx('text-xs', aviso.ok ? 'text-emerald-700' : 'text-red-700')}>{aviso.texto}</p>}
    </div>
  )
}
