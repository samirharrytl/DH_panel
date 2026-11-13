import { NextResponse, type NextRequest } from 'next/server'
import { crearClienteAdmin } from '@/lib/supabase/admin'
import { TIPOS_INMUEBLE, type TipoInmueble } from '@/lib/catalogos'

// Catálogo del sitio web (landing en Astro), con la forma de `Property` del contrato
// openapi/depahost-api.json de la landing. Astro lo lee al construir y copia las fotos optimizadas a su
// sitio, así que las URLs firmadas solo tienen que durar lo que dura la caché más el build.

const FIRMA_S = 6 * 3600

type Fila = {
  id: string
  slug: string
  tipo: TipoInmueble
  distrito: string
  distrito_slug: string
  descripcion: string | null
  precio: number
  destacado: boolean
  rentabilidad_min: number | null
  rentabilidad_max: number | null
  anios_recupero: number | null
  metraje: number | null
  dormitorios: number | null
  banos: number | null
  publicado_at: string | null
  fotos: string[]
}

const n = (v: number | null) => (v === null ? null : Number(v))

// shortcut: no aplica los filtros del contrato (district, maxPrice…); la landing filtra en el navegador.
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams
  const page = Math.max(1, Number(p.get('page')) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(p.get('pageSize')) || 20))

  const supabase = crearClienteAdmin()
  const { data, error } = await supabase.rpc('inmuebles_web')
  if (error) {
    console.error('inmuebles_web', error)
    return NextResponse.json({ statusCode: 500, error: 'Internal Server Error', message: 'No se pudo leer el catálogo' }, { status: 500 })
  }
  const todas = (data ?? []) as Fila[]
  const filas = todas.slice((page - 1) * pageSize, page * pageSize)

  const rutas = filas.flatMap((f) => f.fotos)
  const { data: firmadas } = rutas.length
    ? await supabase.storage.from('inmuebles').createSignedUrls(rutas, FIRMA_S)
    : { data: [] }
  const url = new Map((firmadas ?? []).flatMap((s) => (s.path && s.signedUrl ? [[s.path, s.signedUrl]] : [])))

  const items = filas.map((f) => {
    const nombre = `${TIPOS_INMUEBLE[f.tipo] ?? 'Inmueble'} en ${f.distrito}`
    const min = n(f.rentabilidad_min)
    return {
      id: f.id,
      slug: f.slug,
      district: { id: f.distrito_slug, name: f.distrito, slug: f.distrito_slug },
      origin: 'owner',
      developer: null,
      // Solo la zona: el sitio nunca muestra la dirección exacta
      address: f.distrito,
      badge: null,
      description: f.descripcion,
      location: null,
      price: { amount: Number(f.precio), currency: 'PEN' },
      yield: min === null ? null : { min, max: n(f.rentabilidad_max) ?? min },
      paybackYears: n(f.anios_recupero),
      areaM2: n(f.metraje),
      bedrooms: f.dormitorios,
      bathrooms: f.banos,
      yearBuilt: null,
      images: f.fotos.flatMap((ruta, i) =>
        url.has(ruta) ? [{ url: url.get(ruta)!, alt: `${nombre}, foto ${i + 1}`, width: null, height: null }] : [],
      ),
      videos: [],
      featured: f.destacado,
      status: 'published',
      publishedAt: f.publicado_at ?? new Date().toISOString(),
    }
  })

  return NextResponse.json(
    { data: items, page, pageSize, total: todas.length },
    { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } },
  )
}
