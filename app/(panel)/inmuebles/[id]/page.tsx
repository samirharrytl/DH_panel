import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { exigirUsuario } from '@/lib/auth'
import { crearClienteServidor } from '@/lib/supabase/server'
import { CONSERVACION, ESTADOS_INMUEBLE, TIPOS_INMUEBLE, colorEstadoInmueble, etiqueta } from '@/lib/catalogos'
import { fecha, fechaHora, hoyLima, num, soles } from '@/lib/formato'
import { Aviso, Campo, Casilla, Dato, EncabezadoPagina, Seleccion, Tarjeta, Vacio } from '@/components/campos'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { BotonAccion, BotonEnviar, Dialogo, Formulario } from '@/components/formulario'
import { SubirFotos } from '@/components/subir-archivos'
import { borrarFoto, editarAcceso, editarInmueble, hacerPortada, registrarFotos, retirarInmueble } from '../acciones'
import { DatosAcceso, ID_DISTRITOS, InsigniaVencimiento, ListaDistritos, caracteristicasTexto, enlaceMapa } from '../compartido'
import type { Contrato, InmuebleVista } from '../tipos'
import { FormularioContrato } from './contrato'
import { DifusionInmueble } from './extra/difusion'
import { NovedadesInmueble } from './extra/novedades'

const cargar = async (id: string) => {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const supabase = await crearClienteServidor()
  const { data } = await supabase.from('v_inmuebles').select('*').eq('id', id).maybeSingle()
  return data as InmuebleVista | null
}

export async function generateMetadata({ params }: PageProps<'/inmuebles/[id]'>): Promise<Metadata> {
  const i = await cargar((await params).id)
  return { title: i?.codigo ?? 'Inmueble' }
}

const CARACTERISTICAS = ['terraza', 'jardín', 'piscina', 'amoblado', 'vista exterior']

// HU-15 a HU-18: ficha del inmueble con fotos, datos, acceso y contrato
export default async function PaginaInmueble({ params }: PageProps<'/inmuebles/[id]'>) {
  const usuario = await exigirUsuario()
  const i = await cargar((await params).id)
  if (!i) notFound()
  const supabase = await crearClienteServidor()
  const [{ data: fotos }, { data: contratos }, { data: param }] = await Promise.all([
    supabase.from('inmueble_fotos').select('id, ruta').eq('inmueble_id', i.id).order('orden').order('created_at'),
    supabase.from('contratos').select('*').eq('inmueble_id', i.id).order('created_at', { ascending: false }),
    supabase.from('parametros').select('valor').eq('clave', 'contrato_aviso_dias').maybeSingle(),
  ])
  const puedeEditar = usuario.esAdmin || i.asesor_id === usuario.id
  const activo = i.estado === 'en_captacion' || i.estado === 'en_cartera'
  const hoy = hoyLima()
  const avisoDias = Number(param?.valor ?? 30)
  const historial = (contratos ?? []) as Contrato[]
  const vigente = historial.find((c) => c.estado === 'vigente') ?? null

  // Buckets privados: URLs firmadas por una hora
  // (las copias de contratos solo las puede leer quien edita el inmueble)
  const copias = puedeEditar ? historial.flatMap((c) => (c.archivo_ruta ? [c.archivo_ruta] : [])) : []
  const [{ data: firmadasFotos }, { data: firmadasContratos }] = await Promise.all([
    fotos?.length ? supabase.storage.from('inmuebles').createSignedUrls(fotos.map((f) => f.ruta), 3600) : { data: [] },
    copias.length ? supabase.storage.from('contratos').createSignedUrls(copias, 3600) : { data: [] },
  ])
  const url = new Map([...(firmadasFotos ?? []), ...(firmadasContratos ?? [])].map((s) => [s.path, s.signedUrl]))

  return (
    <>
      <ListaDistritos />
      <EncabezadoPagina
        volver={{ href: '/inmuebles', texto: 'Base de propiedades' }}
        titulo={
          <span className="flex flex-wrap items-center gap-2">
            {i.codigo} · {etiqueta(TIPOS_INMUEBLE, i.tipo)} en {i.distrito}
            <Badge variant={colorEstadoInmueble(i.estado)}>{ESTADOS_INMUEBLE[i.estado]}</Badge>
            <InsigniaVencimiento venceEl={i.contrato_vence_el} hoy={hoy} avisoDias={avisoDias} />
          </span>
        }
        descripcion={
          <>
            {soles(i.precio)} · {caracteristicasTexto(i) || 'Sin características'}
            {i.propietario_lead_id && (
              <>
                {' · '}
                <Link href={`/leads/${i.propietario_lead_id}?tab=citas`} className="text-primary hover:underline">
                  {i.propietario_nombre ?? 'Propietario'}
                </Link>
              </>
            )}
          </>
        }
      />
      {i.estado === 'retirado' && <Aviso tipo="alerta" className="mb-4">Retirado el {fecha(i.retirado_at)}: {i.motivo_retiro}</Aviso>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-4">
          <Tarjeta guia="inm-fotos" titulo={`Fotos (${fotos?.length ?? 0})`}>
            {fotos?.length ? (
              <ul className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {fotos.map((f, n) => (
                  <li key={f.id} className="space-y-1">
                    <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-accent">
                      {url.get(f.ruta) && (
                        <Image src={url.get(f.ruta)!} alt={`Foto ${n + 1} de ${i.codigo}`} fill unoptimized sizes="200px" className="object-cover" />
                      )}
                      {n === 0 && <Badge className="absolute top-1 left-1">Portada</Badge>}
                    </div>
                    {puedeEditar && (
                      <div className="flex flex-wrap gap-1">
                        {n > 0 && (
                          <BotonAccion accion={hacerPortada.bind(null, f.id)} variante="ghost">
                            Portada
                          </BotonAccion>
                        )}
                        <BotonAccion accion={borrarFoto.bind(null, f.id)} variante="ghost" confirmar="¿Borrar esta foto?">
                          Borrar
                        </BotonAccion>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <Vacio>Sin fotos todavía.</Vacio>
            )}
            {puedeEditar && activo && <SubirFotos inmuebleId={i.id} registrar={registrarFotos} />}
          </Tarjeta>

          <Tarjeta guia="inm-datos"
            titulo="Datos del inmueble"
            acciones={
              puedeEditar &&
              activo && (
                <Dialogo titulo="Editar inmueble" boton="Editar" ancho="sm:max-w-2xl">
                  <Formulario accion={editarInmueble}>
                    <input type="hidden" name="inmueble_id" value={i.id} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Campo etiqueta="Tipo">
                        <Seleccion name="tipo" defaultValue={i.tipo}>
                          {Object.entries(TIPOS_INMUEBLE).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </Seleccion>
                      </Campo>
                      <Campo etiqueta="Estado de conservación">
                        <Seleccion name="conservacion" defaultValue={i.conservacion ?? ''}>
                          <option value="">Sin dato</option>
                          {Object.entries(CONSERVACION).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </Seleccion>
                      </Campo>
                      <Campo etiqueta="Dirección" className="sm:col-span-2">
                        <Input name="direccion" defaultValue={i.direccion} required />
                      </Campo>
                      <Campo etiqueta="Distrito">
                        <Input name="distrito" list={ID_DISTRITOS} defaultValue={i.distrito} required />
                      </Campo>
                      <Campo etiqueta="Referencia">
                        <Input name="referencia" defaultValue={i.referencia ?? ''} />
                      </Campo>
                      <Campo etiqueta="Precio de venta (S/)">
                        <Input name="precio" type="number" min={1} step="0.01" defaultValue={i.precio ?? ''} required />
                      </Campo>
                      <Campo etiqueta="Precio esperado por el propietario (S/)">
                        <Input name="precio_esperado" type="number" min={0} step="0.01" defaultValue={i.precio_esperado ?? ''} />
                      </Campo>
                      <Campo etiqueta="Metraje (m²)">
                        <Input name="metraje" type="number" min={0} step="0.01" defaultValue={i.metraje ?? ''} />
                      </Campo>
                      <Campo etiqueta="Dormitorios">
                        <Input name="dormitorios" type="number" min={0} defaultValue={i.dormitorios ?? ''} />
                      </Campo>
                      <Campo etiqueta="Baños">
                        <Input name="banos" type="number" min={0} defaultValue={i.banos ?? ''} />
                      </Campo>
                      <Campo etiqueta="Cocheras">
                        <Input name="cocheras" type="number" min={0} defaultValue={i.cocheras} />
                      </Campo>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                      <Casilla name="ascensor" defaultChecked={i.ascensor} etiqueta="Ascensor" />
                      <Casilla name="mascotas" defaultChecked={i.mascotas} etiqueta="Acepta mascotas" />
                      {CARACTERISTICAS.map((c) => (
                        <Casilla key={c} name="caracteristicas" value={c} defaultChecked={i.caracteristicas.includes(c)} etiqueta={c[0].toUpperCase() + c.slice(1)} />
                      ))}
                    </div>
                    <Campo etiqueta="Otras características" ayuda="Separadas por comas.">
                      <Input name="otras_caracteristicas" defaultValue={i.caracteristicas.filter((c) => !CARACTERISTICAS.includes(c)).join(', ')} />
                    </Campo>
                    <Campo etiqueta="Descripción" ayuda="Se publica en el sitio web: no pongas la dirección exacta.">
                      <Textarea name="descripcion" defaultValue={i.descripcion ?? ''} />
                    </Campo>
                    <p className="text-sm font-medium text-foreground">Sitio web</p>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Campo etiqueta="Rentabilidad mín. (% anual)">
                        <Input name="rentabilidad_min" type="number" min={0} step="0.1" defaultValue={i.rentabilidad_min ?? ''} />
                      </Campo>
                      <Campo etiqueta="Rentabilidad máx. (% anual)">
                        <Input name="rentabilidad_max" type="number" min={0} step="0.1" defaultValue={i.rentabilidad_max ?? ''} />
                      </Campo>
                      <Campo etiqueta="Años de recupero">
                        <Input name="anios_recupero" type="number" min={0.1} step="0.1" defaultValue={i.anios_recupero ?? ''} />
                      </Campo>
                    </div>
                    <Casilla name="destacado" defaultChecked={i.destacado} etiqueta="Destacado en el sitio web" />
                    <BotonEnviar>Guardar</BotonEnviar>
                  </Formulario>
                </Dialogo>
              )
            }
          >
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Dato etiqueta="Dirección" className="col-span-2">
                <a href={enlaceMapa(i.direccion, i.distrito)} target="_blank" rel="noreferrer" className="py-2 text-primary hover:underline">
                  {i.direccion}
                </a>
                {i.referencia && <span className="block text-xs text-muted-foreground">{i.referencia}</span>}
              </Dato>
              <Dato etiqueta="Conservación">{etiqueta(CONSERVACION, i.conservacion)}</Dato>
              <Dato etiqueta="Precio de venta">{soles(i.precio)}</Dato>
              <Dato etiqueta="Precio esperado">{soles(i.precio_esperado)}</Dato>
              <Dato etiqueta="Metraje">{i.metraje ? `${num(i.metraje)} m²` : '—'}</Dato>
              <Dato etiqueta="Dormitorios / baños">
                {i.dormitorios ?? '—'} / {i.banos ?? '—'}
              </Dato>
              <Dato etiqueta="Cocheras">{i.cocheras}</Dato>
              <Dato etiqueta="Rentabilidad (sitio web)">
                {i.rentabilidad_min === null
                  ? '—'
                  : `${num(i.rentabilidad_min)}${i.rentabilidad_max !== null && i.rentabilidad_max !== i.rentabilidad_min ? `–${num(i.rentabilidad_max)}` : ''} % anual`}
                {i.anios_recupero !== null && <span className="block text-xs text-muted-foreground">Recupero en {num(i.anios_recupero)} años</span>}
              </Dato>
              <Dato etiqueta="En el sitio web">
                {i.estado === 'en_cartera' && i.autoriza_publicar ? (i.destacado ? 'Publicado, destacado' : 'Publicado') : 'No se muestra'}
              </Dato>
              <Dato etiqueta="Extras">
                {[i.ascensor && 'ascensor', i.mascotas && 'mascotas', ...i.caracteristicas].filter(Boolean).join(', ') || '—'}
              </Dato>
            </dl>
            {i.descripcion && <p className="mt-3 text-sm whitespace-pre-wrap text-foreground">{i.descripcion}</p>}
          </Tarjeta>

          <DifusionInmueble inmuebleId={i.id} puedeEditar={puedeEditar} />
          <NovedadesInmueble inmuebleId={i.id} puedeEditar={puedeEditar} />
        </div>

        <div className="space-y-4">
          <Tarjeta guia="inm-contrato"
            titulo="Contrato"
            acciones={
              puedeEditar &&
              activo && (
                <>
                  {i.estado === 'en_captacion' && (
                    <Dialogo titulo="Registrar contrato firmado" boton="Registrar contrato" variante="exito">
                      <FormularioContrato inmuebleId={i.id} hoy={hoy} />
                    </Dialogo>
                  )}
                  {vigente && (
                    <Dialogo titulo="Renovar contrato" boton="Renovar">
                      <FormularioContrato inmuebleId={i.id} contratoId={vigente.id} hoy={hoy} />
                    </Dialogo>
                  )}
                  <Dialogo titulo="Retirar inmueble" boton="Retirar" variante="peligro">
                    <Formulario accion={retirarInmueble}>
                      <input type="hidden" name="inmueble_id" value={i.id} />
                      <p className="text-sm text-muted-foreground">El inmueble sale de la base: deja de publicarse y de ofrecerse en el match.</p>
                      <Campo etiqueta="Motivo">
                        <Textarea name="motivo" rows={2} required placeholder="Venció el contrato, el propietario lo retiró…" />
                      </Campo>
                      <BotonEnviar variante="peligro">Retirar</BotonEnviar>
                    </Formulario>
                  </Dialogo>
                </>
              )
            }
          >
            {vigente ? (
              <dl className="grid grid-cols-2 gap-3">
                <Dato etiqueta="Firmado">{fecha(vigente.fecha_firma)}</Dato>
                <Dato etiqueta="Vence">{fecha(vigente.vence_el)}</Dato>
                <Dato etiqueta="Plazo">{vigente.plazo_meses} meses</Dato>
                <Dato etiqueta="Comisión">{num(vigente.comision_pct)} %</Dato>
                <Dato etiqueta="Exclusividad">{vigente.exclusividad ? 'Sí' : 'No'}</Dato>
                <Dato etiqueta="Autoriza publicar">{vigente.autoriza_publicar ? 'Sí' : 'No'}</Dato>
                {vigente.notas && (
                  <Dato etiqueta="Notas" className="col-span-2">
                    {vigente.notas}
                  </Dato>
                )}
              </dl>
            ) : (
              <Vacio>{i.estado === 'en_captacion' ? 'Aún no hay contrato firmado. Al registrarlo, el inmueble pasa a En cartera.' : 'Sin contrato vigente.'}</Vacio>
            )}
            {historial.length > 0 && (
              <ul className="mt-3 space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
                {historial.map((c) => (
                  <li key={c.id}>
                    {fecha(c.fecha_firma)} → {fecha(c.vence_el)} · {c.estado}
                    {c.archivo_ruta && url.get(c.archivo_ruta) && (
                      <>
                        {' · '}
                        <a href={url.get(c.archivo_ruta) ?? undefined} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                          Ver copia
                        </a>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>

          <Tarjeta guia="inm-acceso"
            titulo="Acceso"
            acciones={
              puedeEditar &&
              activo && (
                <Dialogo titulo="Datos de acceso" boton="Editar">
                  <Formulario accion={editarAcceso}>
                    <input type="hidden" name="inmueble_id" value={i.id} />
                    <Campo etiqueta="Llave">
                      <Input name="acceso_llave" defaultValue={i.acceso_llave ?? ''} />
                    </Campo>
                    <Campo etiqueta="Código">
                      <Input name="acceso_codigo" defaultValue={i.acceso_codigo ?? ''} />
                    </Campo>
                    <Casilla name="acceso_dni" defaultChecked={i.acceso_dni} etiqueta="Piden DNI en la entrada" />
                    <Campo etiqueta="Otras">
                      <Textarea name="acceso_otros" rows={2} defaultValue={i.acceso_otros ?? ''} />
                    </Campo>
                    <BotonEnviar>Guardar</BotonEnviar>
                  </Formulario>
                </Dialogo>
              )
            }
          >
            <DatosAcceso acceso={i} />
            <p className="mt-2 text-xs text-muted-foreground">Las visitas toman estos datos al agendarse.</p>
          </Tarjeta>

          <Tarjeta guia="inm-interes" titulo="Interés acumulado">
            <dl className="grid grid-cols-2 gap-3">
              <Dato etiqueta="Leads generados">{i.leads_interesados}</Dato>
              <Dato etiqueta="Veces enviado como match">{i.veces_match}</Dato>
              <Dato etiqueta="Me interesa">{i.me_interesa}</Dato>
              <Dato etiqueta="Visitas realizadas">{i.visitas_realizadas}</Dato>
            </dl>
          </Tarjeta>

          <p className="text-xs text-muted-foreground">
            Asesor: {i.asesor_nombre ?? '—'} · Creado el {fechaHora(i.created_at)}
          </p>
        </div>
      </div>
    </>
  )
}
