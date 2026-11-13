import Link from 'next/link'
import { crearClienteServidor } from '@/lib/supabase/server'
import {
  ESTADOS_INMUEBLE,
  NIVELES,
  ORDEN_NIVEL,
  TIPOS_INMUEBLE,
  colorEstadoInmueble,
  etiqueta,
  type EstadoInmueble,
  type Nivel,
} from '@/lib/catalogos'
import { fecha, fechaHora, hoyLima, soles } from '@/lib/formato'
import { Aviso, Campo, Dato, Seleccion, Tarjeta, Vacio } from '@/components/campos'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { BotonEnviar, Dialogo, Formulario } from '@/components/formulario'
import { iniciarCompraventa, marcarCompraventaCaida, registrarCierre } from './cierre-acciones'
import { Postventa } from './cierre-postventa'
import type { PropsSeccion } from '../tipos'

type Inmueble = {
  id: string
  codigo: string
  tipo: string
  distrito: string
  precio: number | null
  estado: EstadoInmueble
  vendido_at?: string | null
}

type Compraventa = {
  id: string
  inmueble_id: string
  estado: 'en_curso' | 'cerrada' | 'caida'
  iniciada_at: string
  fecha_cierre: string | null
  precio_venta: number | null
  comision_pagada: number | null
  motivo_caida: string | null
  notas: string | null
  updated_at: string
  inmueble: Inmueble | null
  iniciador: { nombre: string } | null
  cerrador: { nombre: string } | null
}

const SELECT_COMPRAVENTA =
  'id, inmueble_id, estado, iniciada_at, fecha_cierre, precio_venta, comision_pagada, motivo_caida, notas, updated_at, inmueble:inmuebles(id, codigo, tipo, distrito, precio, estado), iniciador:perfiles!compraventas_iniciada_por_fkey(nombre), cerrador:perfiles!compraventas_cerrada_por_fkey(nombre)'

const describir = (i: Pick<Inmueble, 'codigo' | 'tipo' | 'distrito'>) =>
  `${i.codigo} · ${etiqueta(TIPOS_INMUEBLE, i.tipo)} en ${i.distrito}`

const NO_SEPARACION =
  'No existe la separación del inmueble: no hay reservas ni pagos de separación. La compraventa pasa directo de En curso a Cerrada.'

// Pestaña "Compraventa" del interesado y "Postventa" del propietario Cliente (HU-31 a HU-33)
export async function SeccionCierre({ lead }: PropsSeccion) {
  const supabase = await crearClienteServidor()
  const { data: params } = await supabase
    .from('parametros')
    .select('clave, valor')
    .in('clave', ['nivel_compraventa', 'testimonio_dias', 'resena_google_url'])
  const param = (clave: string) => params?.find((x) => x.clave === clave)?.valor as unknown
  const resenaUrl = typeof param('resena_google_url') === 'string' ? String(param('resena_google_url')).trim() : ''

  if (lead.tipo === 'propietario') {
    return (
      <div className="space-y-4">
        <InmueblesPropietario leadId={lead.id} />
        <Postventa lead={lead} resenaUrl={resenaUrl} />
      </div>
    )
  }

  const [{ data: cvs }, { data: capacidad }, { data: interesaron }, { data: visitas }, { data: cartera }] = await Promise.all([
    supabase.from('compraventas').select(SELECT_COMPRAVENTA).eq('lead_id', lead.id).order('iniciada_at', { ascending: false }),
    supabase.from('capacidad_financiera').select('nivel').eq('lead_id', lead.id).maybeSingle(),
    supabase.from('match_opciones').select('inmueble_id').eq('lead_id', lead.id).eq('respuesta', 'me_interesa'),
    supabase.from('citas').select('inmueble_id').eq('lead_id', lead.id).eq('tipo', 'visita').in('estado', ['programada', 'realizada']),
    supabase.from('inmuebles').select('id, codigo, tipo, distrito, precio, estado').eq('estado', 'en_cartera').order('numero'),
  ])
  const compraventas = (cvs ?? []) as unknown as Compraventa[]
  const enCurso = compraventas.find((c) => c.estado === 'en_curso')
  const anteriores = compraventas.filter((c) => c.estado !== 'en_curso')

  const nivelActual = ((capacidad?.nivel as Nivel | undefined) ?? 'no_validada') as Nivel
  const exigidoParam = param('nivel_compraventa')
  const nivelExigido = (typeof exigidoParam === 'string' && exigidoParam in NIVELES ? exigidoParam : 'precalificada') as Nivel
  const alcanza = ORDEN_NIVEL.indexOf(nivelActual) >= ORDEN_NIVEL.indexOf(nivelExigido)
  const puedeIniciar = lead.vigente && !['baja', 'cliente'].includes(lead.estado) && !enCurso
  const testimonioDias = Number(param('testimonio_dias') ?? 7)

  const leInteresaron = new Set((interesaron ?? []).map((x) => x.inmueble_id as string))
  const visito = new Set((visitas ?? []).map((x) => x.inmueble_id as string).filter(Boolean))
  const enCartera = (cartera ?? []) as Inmueble[]
  const preferidos = enCartera.filter((i) => leInteresaron.has(i.id) || visito.has(i.id))
  const otros = enCartera.filter((i) => !leInteresaron.has(i.id) && !visito.has(i.id))
  const porDefecto =
    (lead.inmueble_interes_id && enCartera.some((i) => i.id === lead.inmueble_interes_id) ? lead.inmueble_interes_id : null) ??
    preferidos[0]?.id ??
    ''
  const opcion = (i: Inmueble) => {
    const marcas = [leInteresaron.has(i.id) && 'le interesó', visito.has(i.id) && 'visita'].filter(Boolean).join(', ')
    return `${describir(i)} · ${soles(i.precio)}${marcas ? ` (${marcas})` : ''}`
  }

  return (
    <div className="space-y-4">
      {enCurso && <CompraventaEnCurso cv={enCurso} leadId={lead.id} comprador={lead.persona.nombre} testimonioDias={testimonioDias} />}

      {puedeIniciar && (
        <Tarjeta
          titulo="Iniciar compraventa"
          acciones={
            enCartera.length > 0 && (
              <Dialogo titulo="Iniciar compraventa" boton="Iniciar compraventa" variante="default">
                <Formulario accion={iniciarCompraventa}>
                  <input type="hidden" name="lead_id" value={lead.id} />
                  <Aviso tipo={alcanza ? 'info' : 'alerta'}>
                    Nivel financiero actual: <strong>{NIVELES[nivelActual]}</strong>. Para iniciar la compraventa se exige{' '}
                    <strong>{NIVELES[nivelExigido]}</strong> o superior.
                  </Aviso>
                  <Campo
                    etiqueta="Inmueble"
                    ayuda={preferidos.length ? 'Arriba, los que le interesaron o visitó.' : 'No marcó interés ni visitó ninguno en cartera.'}
                  >
                    <Seleccion name="inmueble_id" defaultValue={porDefecto} required>
                      <option value="">Elige el inmueble</option>
                      {preferidos.length > 0 && (
                        <optgroup label="Le interesaron o visitó">
                          {preferidos.map((i) => (
                            <option key={i.id} value={i.id}>
                              {opcion(i)}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {otros.length > 0 && (
                        <optgroup label="Otros en cartera">
                          {otros.map((i) => (
                            <option key={i.id} value={i.id}>
                              {opcion(i)}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </Seleccion>
                  </Campo>
                  <Campo etiqueta="Notas">
                    <Textarea name="notas" rows={2} placeholder="Banco, notaría, próximos pasos…" />
                  </Campo>
                  <p className="text-xs text-muted-foreground">{NO_SEPARACION}</p>
                  <BotonEnviar>Iniciar compraventa</BotonEnviar>
                </Formulario>
              </Dialogo>
            )
          }
        >
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Dato etiqueta="Nivel financiero actual">
              <Badge variant={alcanza ? 'verde' : 'ambar'}>{NIVELES[nivelActual]}</Badge>
            </Dato>
            <Dato etiqueta="Exigido para la compraventa">{NIVELES[nivelExigido]}</Dato>
            <Dato etiqueta="Le interesaron o visitó">{preferidos.length ? `${preferidos.length} en cartera` : 'Ninguno en cartera'}</Dato>
          </dl>
          {!alcanza && (
            <Aviso tipo="alerta" className="mt-3">
              El nivel no alcanza el exigido (HU-20). Actualiza la capacidad financiera o registra la derivación en{' '}
              <Link href={`/leads/${lead.id}?tab=perfil`} className="font-medium underline">
                Perfil y capacidad
              </Link>
              .
            </Aviso>
          )}
          {enCartera.length === 0 && (
            <Vacio>No hay inmuebles en cartera para iniciar una compraventa.</Vacio>
          )}
          <p className="mt-3 text-xs text-muted-foreground">{NO_SEPARACION}</p>
        </Tarjeta>
      )}

      {!enCurso && !puedeIniciar && lead.estado !== 'cliente' && (
        <Aviso tipo="info">
          {lead.estado === 'baja'
            ? 'El lead está en Baja: no se puede iniciar una compraventa.'
            : 'Este registro ya no está vigente: la compraventa se inicia desde el ciclo actual del lead.'}
        </Aviso>
      )}

      {lead.estado === 'cliente' && <Postventa lead={lead} resenaUrl={resenaUrl} />}

      {anteriores.length > 0 && (
        <Tarjeta titulo="Compraventas anteriores">
          <ul className="space-y-2">
            {anteriores.map((c) => (
              <FilaCompraventa key={c.id} cv={c} />
            ))}
          </ul>
        </Tarjeta>
      )}
    </div>
  )
}

function CompraventaEnCurso({
  cv,
  leadId,
  comprador,
  testimonioDias,
}: {
  cv: Compraventa
  leadId: string
  comprador: string
  testimonioDias: number
}) {
  const i = cv.inmueble
  const hoy = hoyLima()
  return (
    <Tarjeta titulo="Compraventa en curso" acciones={<Badge variant="azul">En curso</Badge>} className="border-sky-300">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Dato etiqueta="Inmueble">
          {i ? (
            <Link href={`/inmuebles/${i.id}`} className="text-primary hover:underline">
              {describir(i)}
            </Link>
          ) : (
            '—'
          )}
        </Dato>
        <Dato etiqueta="Precio del inmueble">{soles(i?.precio)}</Dato>
        <Dato etiqueta="Iniciada">
          {fechaHora(cv.iniciada_at)}
          {cv.iniciador && <span className="block text-xs text-muted-foreground">por {cv.iniciador.nombre}</span>}
        </Dato>
        <Dato etiqueta="Notas">{cv.notas ?? '—'}</Dato>
      </dl>
      {i && i.estado !== 'en_cartera' && (
        <Aviso tipo="alerta" className="mt-3">
          El inmueble está {ESTADOS_INMUEBLE[i.estado].toLowerCase()}.
        </Aviso>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        Sin separación: cuando se firme la compraventa con el acompañamiento del asesor, registra el cierre.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Dialogo titulo="Registrar cierre" boton="Registrar cierre" variante="exito">
          <Formulario accion={registrarCierre}>
            <input type="hidden" name="compraventa_id" value={cv.id} />
            <input type="hidden" name="lead_id" value={leadId} />
            <input type="hidden" name="inmueble_id" value={cv.inmueble_id} />
            <dl className="grid grid-cols-2 gap-3 rounded-lg bg-accent p-3">
              <Dato etiqueta="Comprador">{comprador}</Dato>
              <Dato etiqueta="Inmueble">{i ? describir(i) : '—'}</Dato>
            </dl>
            <Campo etiqueta="Fecha de cierre">
              <Input type="date" name="fecha_cierre" defaultValue={hoy} max={hoy} required />
            </Campo>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo etiqueta="Precio de venta (S/)" ayuda="Vacío: se usa el precio del inmueble.">
                <Input type="number" name="precio_venta" min="0" step="0.01" inputMode="decimal" defaultValue={i?.precio ?? ''} />
              </Campo>
              <Campo etiqueta="Comisión pagada (S/)">
                <Input type="number" name="comision_pagada" min="0" step="0.01" inputMode="decimal" required />
              </Campo>
            </div>
            <Campo etiqueta="Notas">
              <Textarea name="notas" rows={2} />
            </Campo>
            <Aviso>
              Al registrar el cierre, el inmueble pasa a Vendido y sale de la base, el comprador pasa a Cliente y otras
              compraventas en curso del mismo inmueble se caen. En {testimonioDias} días toca pedir testimonio y reseña.
            </Aviso>
            <BotonEnviar>Registrar cierre</BotonEnviar>
          </Formulario>
        </Dialogo>
        <Dialogo titulo="La compraventa se cayó" boton="Se cayó" variante="peligro">
          <Formulario accion={marcarCompraventaCaida}>
            <input type="hidden" name="compraventa_id" value={cv.id} />
            <input type="hidden" name="lead_id" value={leadId} />
            <input type="hidden" name="inmueble_id" value={cv.inmueble_id} />
            <Campo etiqueta="Motivo" ayuda="El interesado vuelve a Visita realizada.">
              <Textarea name="motivo" rows={3} required placeholder="No le aprobaron el crédito, desistió…" />
            </Campo>
            <BotonEnviar variante="peligro">Marcar como caída</BotonEnviar>
          </Formulario>
        </Dialogo>
      </div>
    </Tarjeta>
  )
}

function FilaCompraventa({ cv }: { cv: Compraventa }) {
  const i = cv.inmueble
  return (
    <li className="rounded-lg border border-border px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {i ? (
          <Link href={`/inmuebles/${i.id}`} className="text-sm font-medium text-primary hover:underline">
            {describir(i)}
          </Link>
        ) : (
          <span className="text-sm text-muted-foreground">Inmueble no disponible</span>
        )}
        <Badge variant={cv.estado === 'cerrada' ? 'verde' : 'gris'}>{cv.estado === 'cerrada' ? 'Cerrada' : 'Caída'}</Badge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {cv.estado === 'cerrada'
          ? `Cerrada el ${fecha(cv.fecha_cierre)} · Precio ${soles(cv.precio_venta)} · Comisión ${soles(cv.comision_pagada)}${
              cv.cerrador ? ` · ${cv.cerrador.nombre}` : ''
            }`
          : `Se cayó (${fecha(cv.updated_at)}): ${cv.motivo_caida ?? 'sin motivo'}`}
      </p>
      <p className="text-xs text-muted-foreground">Iniciada el {fecha(cv.iniciada_at)}</p>
      {cv.notas && <p className="mt-1 text-xs whitespace-pre-wrap text-muted-foreground">{cv.notas}</p>}
    </li>
  )
}

// Inmuebles del propietario y su venta, si la hubo
async function InmueblesPropietario({ leadId }: { leadId: string }) {
  const supabase = await crearClienteServidor()
  const { data } = await supabase
    .from('inmuebles')
    .select('id, codigo, tipo, distrito, precio, estado, vendido_at')
    .eq('propietario_lead_id', leadId)
    .order('numero')
  const inmuebles = (data ?? []) as Inmueble[]
  const { data: ventas } = inmuebles.length
    ? await supabase
        .from('compraventas')
        .select('inmueble_id, fecha_cierre, precio_venta, comision_pagada')
        .in(
          'inmueble_id',
          inmuebles.map((i) => i.id),
        )
        .eq('estado', 'cerrada')
    : { data: null }

  return (
    <Tarjeta titulo="Sus inmuebles">
      {inmuebles.length === 0 ? (
        <Vacio>Sin inmuebles registrados.</Vacio>
      ) : (
        <ul className="space-y-2">
          {inmuebles.map((i) => {
            const venta = ventas?.find((v) => v.inmueble_id === i.id)
            return (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                <div>
                  <Link href={`/inmuebles/${i.id}`} className="text-sm font-medium text-primary hover:underline">
                    {describir(i)}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {i.estado === 'vendido'
                      ? `Vendido el ${fecha(venta?.fecha_cierre ?? i.vendido_at)}${venta ? ` por ${soles(venta.precio_venta)}` : ''}`
                      : `Precio ${soles(i.precio)}`}
                  </p>
                </div>
                <Badge variant={colorEstadoInmueble(i.estado)}>{ESTADOS_INMUEBLE[i.estado]}</Badge>
              </li>
            )
          })}
        </ul>
      )}
    </Tarjeta>
  )
}
