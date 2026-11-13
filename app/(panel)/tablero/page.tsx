import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { exigirAdmin } from '@/lib/auth'
import { crearClienteServidor } from '@/lib/supabase/server'
import { EMBUDO, ESTADOS_LEAD, SALIDAS, type EstadoLead, type TipoLead } from '@/lib/catalogos'
import { dolares, fecha, hoyLima, num, soles } from '@/lib/formato'
import { Aviso, EncabezadoPagina, Tarjeta } from '@/components/campos'
import { Input } from '@/components/ui/input'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'Tablero' }

type Tablero = {
  leads_por_etapa: { tipo: TipoLead; estado: EstadoLead; total: number }[]
  sin_respuesta: { esperando_respuesta: number; refuerzos_vencidos: number; sin_bienvenida: number; no_responde: number }
  conversiones: { tipo: TipoLead; estado: EstadoLead; orden: number; alcanzaron: number; total: number }[]
  piloto_match: {
    envios: number
    opciones: number
    respondidas: number
    me_interesa: number
    pct_me_interesa: number | null
    visitas_de_match: number
    visitas_por_envio: number | null
    cierres: number
  }
  negocio: {
    leads_nuevos: number
    contratos_firmados: number
    inmuebles_en_cartera: number
    compraventas_cerradas: number
    comisiones: number
    visitas_realizadas: number
  }
}

type Costos = {
  tarifas: Record<CategoriaCosto, number>
  gratis_mes: number
  categorias: { categoria: CategoriaCosto; enviados: number; cobrables: number; costo: number }[]
  meses: { mes: string; enviados: number; cobrables: number; costo: number }[]
  estimados: number
  desde_celular: number
  entrantes: number
  chat_mes_actual: number
}
type CategoriaCosto = 'marketing' | 'utility' | 'servicio'
const CATEGORIAS_COSTO: Record<CategoriaCosto, { titulo: string; detalle: string }> = {
  marketing: { titulo: 'Plantillas de marketing', detalle: 'Bienvenida, refuerzos, novedades, matches y testimonio fuera de las 24 h' },
  utility: { titulo: 'Plantillas utility', detalle: 'Confirmaciones, recordatorios, opinión e insights' },
  servicio: { titulo: 'Chat dentro de las 24 h', detalle: 'Gratis hasta el cupo del mes' },
}
const nombreMes = (mes: string) => fecha(`${mes}-01`).slice(3)

const PERIODOS = { '30': 'Últimos 30 días', '90': 'Últimos 90 días', anio: 'Este año' } as const
const TITULO_TIPO: Record<TipoLead, string> = { propietario: 'Propietarios', interesado: 'Interesados' }
const TIPOS: TipoLead[] = ['propietario', 'interesado']

const esFecha = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)
const valor = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '')
const porcentaje = (a: number, b: number) => (b > 0 ? Math.round((1000 * a) / b) / 10 : null)

function Cifra({ etiqueta, valor, detalle, href }: { etiqueta: string; valor: ReactNode; detalle?: ReactNode; href?: string }) {
  const contenido = (
    <>
      <p className="text-xs text-muted-foreground">{etiqueta}</p>
      <p className="mt-1 font-titulo text-3xl font-semibold text-primary tabular-nums">{valor}</p>
      {detalle && <p className="mt-0.5 text-xs text-muted-foreground">{detalle}</p>}
    </>
  )
  const clase = 'block rounded-2xl border border-border bg-card p-4'
  return href ? (
    <Link href={href} className={cn(clase, 'hover:border-primary')}>
      {contenido}
    </Link>
  ) : (
    <div className={clase}>{contenido}</div>
  )
}

function Barra({ pct, clase = 'bg-primary' }: { pct: number; clase?: string }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-secondary">
      <div className={cn('h-full rounded-full', clase)} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  )
}

// HU-34 y HU-35: estado del negocio para el administrador
export default async function PaginaTablero({ searchParams }: PageProps<'/tablero'>) {
  await exigirAdmin()
  const sp = await searchParams
  const hoy = hoyLima()
  let periodo = valor(sp.periodo)
  let desde = ''
  let hasta = hoy
  let aviso: string | null = null
  if (periodo === 'personalizado') {
    const d = valor(sp.desde)
    const h = valor(sp.hasta)
    if (esFecha(d) && esFecha(h) && d <= h) {
      desde = d
      hasta = h
    } else {
      aviso = 'Rango no válido: indica desde y hasta, con "desde" antes de "hasta". Se muestran los últimos 30 días.'
      periodo = '30'
    }
  }
  if (periodo === '90') desde = hoyLima(-89)
  else if (periodo === 'anio') desde = `${hoy.slice(0, 4)}-01-01`
  else if (periodo !== 'personalizado') {
    periodo = '30'
    desde = hoyLima(-29)
  }

  const supabase = await crearClienteServidor()
  const [{ data, error }, { data: costosData, error: errorCostos }, { count: propietarios }, { count: conCalificacion }, { count: firmas }] = await Promise.all([
    supabase.rpc('tablero', { p_desde: desde, p_hasta: hasta }),
    supabase.rpc('costos_whatsapp', { p_desde: desde, p_hasta: hasta }),
    supabase.from('v_dataset_propietarios').select('lead_id', { count: 'exact', head: true }),
    supabase
      .from('v_dataset_propietarios')
      .select('lead_id', { count: 'exact', head: true })
      .or('rol_contacto.not.is.null,precio_esperado.not.is.null,urgencia.not.is.null'),
    supabase.from('v_dataset_propietarios').select('lead_id', { count: 'exact', head: true }).eq('firmo', true),
  ])
  const t = data as Tablero | null
  const c = costosData as Costos | null
  const costoTotal = c?.categorias.reduce((s, x) => s + Number(x.costo), 0) ?? 0

  return (
    <>
      <EncabezadoPagina titulo="Tablero" descripcion="Estado del negocio y métricas del piloto de match." />

      <div className="mb-6 flex flex-wrap items-end gap-2 rounded-2xl border border-border bg-card p-3">
        {(Object.entries(PERIODOS) as [keyof typeof PERIODOS, string][]).map(([k, v]) => (
          <Link key={k} href={`/tablero?periodo=${k}`} className={buttonVariants({ variant: periodo === k ? 'default' : 'outline', size: 'sm' })}>
            {v}
          </Link>
        ))}
        <form className="flex flex-wrap items-end gap-2 max-sm:grid max-sm:w-full max-sm:grid-cols-2" action="/tablero">
          <input type="hidden" name="periodo" value="personalizado" />
          <label className="text-xs text-muted-foreground max-sm:flex max-sm:flex-col max-sm:gap-1">
            Desde
            <Input type="date" name="desde" defaultValue={desde} max={hoy} className="h-8 w-40 max-sm:h-10 max-sm:w-full" required />
          </label>
          <label className="text-xs text-muted-foreground max-sm:flex max-sm:flex-col max-sm:gap-1">
            Hasta
            <Input type="date" name="hasta" defaultValue={hasta} className="h-8 w-40 max-sm:h-10 max-sm:w-full" required />
          </label>
          <button
            type="submit"
            className={cn(buttonVariants({ variant: periodo === 'personalizado' ? 'default' : 'outline', size: 'sm' }), 'max-sm:col-span-2')}
          >
            Aplicar
          </button>
        </form>
        <p className="w-full text-xs text-muted-foreground">
          Periodo: del {fecha(desde)} al {fecha(hasta)}. Los leads por etapa y sin respuesta muestran la situación de hoy.
        </p>
      </div>

      {aviso && (
        <Aviso tipo="alerta" className="mb-4">
          {aviso}
        </Aviso>
      )}
      {error && <Aviso tipo="error">No se pudo cargar el tablero: {error.message}</Aviso>}

      {t && (
        <div className="space-y-6">
          <section>
            <h2 className="mb-2 text-base font-semibold text-foreground">Negocio en el periodo</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              <Cifra etiqueta="Leads nuevos" valor={num(t.negocio.leads_nuevos)} />
              <Cifra etiqueta="Contratos firmados" valor={num(t.negocio.contratos_firmados)} detalle="Sin contar renovaciones" />
              <Cifra etiqueta="Compraventas cerradas" valor={num(t.negocio.compraventas_cerradas)} />
              <Cifra etiqueta="Comisiones cobradas" valor={soles(t.negocio.comisiones)} />
              <Cifra etiqueta="Visitas realizadas" valor={num(t.negocio.visitas_realizadas)} />
              <Cifra etiqueta="Inmuebles en cartera" valor={num(t.negocio.inmuebles_en_cartera)} detalle="Hoy" href="/inmuebles" />
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-foreground">Leads sin respuesta</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Cifra etiqueta="Sin bienvenida" valor={num(t.sin_respuesta.sin_bienvenida)} href="/leads?estado=nuevo" />
              <Cifra
                etiqueta="Esperando respuesta"
                valor={num(t.sin_respuesta.esperando_respuesta)}
                detalle="Contactados, en cadencia"
                href="/leads?estado=contactado"
              />
              <Cifra etiqueta="Refuerzos vencidos" valor={num(t.sin_respuesta.refuerzos_vencidos)} detalle="De días anteriores" href="/" />
              <Cifra etiqueta="No responde" valor={num(t.sin_respuesta.no_responde)} href="/leads?estado=no_responde" />
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            {TIPOS.map((tipo) => {
              const filas = t.leads_por_etapa.filter((x) => x.tipo === tipo)
              const estados = [...EMBUDO[tipo], ...SALIDAS]
              const total = filas.reduce((s, x) => s + Number(x.total), 0)
              const maximo = Math.max(1, ...filas.map((x) => Number(x.total)))
              return (
                <Tarjeta key={tipo} titulo={`Leads por etapa (${TITULO_TIPO[tipo].toLowerCase()})`} acciones={<span className="text-sm text-muted-foreground">{num(total)} vigentes</span>}>
                  <ul className="space-y-2">
                    {estados.map((estado) => {
                      const n = Number(filas.find((x) => x.estado === estado)?.total ?? 0)
                      return (
                        <li key={estado}>
                          <Link href={`/leads?estado=${estado}&tipo=${tipo}`} className="-my-1 block rounded py-1 hover:bg-accent">
                            <div className="flex items-center justify-between text-sm">
                              <span className={cn(SALIDAS.includes(estado) ? 'text-muted-foreground' : 'text-foreground')}>{ESTADOS_LEAD[estado]}</span>
                              <span className="font-medium text-foreground tabular-nums">{num(n)}</span>
                            </div>
                            <Barra pct={(100 * n) / maximo} clase={SALIDAS.includes(estado) ? 'bg-gray-400' : 'bg-primary'} />
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                </Tarjeta>
              )
            })}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {TIPOS.map((tipo) => {
              const etapas = t.conversiones.filter((x) => x.tipo === tipo).sort((a, b) => a.orden - b.orden)
              const total = Number(etapas[0]?.total ?? 0)
              return (
                <Tarjeta
                  key={tipo}
                  titulo={`Conversiones (${TITULO_TIPO[tipo].toLowerCase()})`}
                  acciones={<span className="text-sm text-muted-foreground">{num(total)} registrados en el periodo</span>}
                >
                  {total === 0 ? (
                    <p className="text-sm text-muted-foreground">No hay leads registrados en el periodo.</p>
                  ) : (
                    <ul className="space-y-3">
                      {etapas.map((e, i) => {
                        const alcanzaron = Number(e.alcanzaron)
                        const delTotal = porcentaje(alcanzaron, total) ?? 0
                        const anterior = i > 0 ? porcentaje(alcanzaron, Number(etapas[i - 1].alcanzaron)) : null
                        return (
                          <li key={e.estado}>
                            <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
                              <span className="text-foreground">{ESTADOS_LEAD[e.estado]}</span>
                              <span className="text-right text-xs text-muted-foreground tabular-nums">
                                <span className="text-sm font-medium text-foreground">{num(alcanzaron)}</span>, {num(delTotal)} % del total
                                {i > 0 && <span className="block">{anterior === null ? '—' : `${num(anterior)} %`} de la anterior</span>}
                              </span>
                            </div>
                            <Barra pct={delTotal} clase={e.estado === 'cliente' ? 'bg-exito-vivo' : 'bg-primary'} />
                          </li>
                        )
                      })}
                    </ul>
                  )}
                  <p className="mt-3 text-xs text-muted-foreground">Cada etapa cuenta a quienes la alcanzaron alguna vez, aunque luego salieran.</p>
                </Tarjeta>
              )
            })}
          </div>

          <section>
            <h2 className="mb-2 text-base font-semibold text-foreground">Piloto de match</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              <Cifra etiqueta="Envíos" valor={num(t.piloto_match.envios)} detalle="Matches y novedades" />
              <Cifra
                etiqueta="Opciones enviadas"
                valor={num(t.piloto_match.opciones)}
                detalle={`${num(t.piloto_match.respondidas)} con respuesta`}
              />
              <Cifra
                etiqueta="“Me interesa” por envío"
                valor={t.piloto_match.pct_me_interesa === null ? '—' : `${num(t.piloto_match.pct_me_interesa)} %`}
                detalle={`${num(t.piloto_match.me_interesa)} de ${num(t.piloto_match.opciones)} opciones`}
              />
              <Cifra
                etiqueta="Visitas por envío"
                valor={t.piloto_match.visitas_por_envio === null ? '—' : num(t.piloto_match.visitas_por_envio)}
                detalle={`${num(t.piloto_match.visitas_de_match)} visitas de opciones enviadas`}
              />
              <Cifra etiqueta="Cierres" valor={num(t.piloto_match.cierres)} detalle="De inmuebles enviados como match" />
              <Cifra etiqueta="Acierto de la predicción" valor="—" detalle="Pendiente hasta tener el modelo" />
            </div>
          </section>
        </div>
      )}

      <section className="mt-6">
        <h2 className="mb-2 text-base font-semibold text-foreground">Costos de WhatsApp</h2>
        {errorCostos && <Aviso tipo="error">No se pudieron cargar los costos: {errorCostos.message}</Aviso>}
        {c && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Cifra etiqueta="Costo en el periodo" valor={dolares(costoTotal)} detalle="Enviados desde el panel" />
              <Cifra
                etiqueta="Chat gratis este mes"
                valor={`${num(Math.min(c.chat_mes_actual, c.gratis_mes))} / ${num(c.gratis_mes)}`}
                detalle={c.chat_mes_actual > c.gratis_mes ? `${num(c.chat_mes_actual - c.gratis_mes)} sobre el cupo` : 'Mensajes usados del cupo'}
              />
              <Cifra etiqueta="Enviados desde el celular" valor={num(c.desde_celular)} detalle="Gratis" />
              <Cifra etiqueta="Mensajes de clientes" valor={num(c.entrantes)} detalle="Gratis" />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Tarjeta titulo="Por tipo de mensaje">
                <ul className="divide-y divide-border">
                  {(Object.keys(CATEGORIAS_COSTO) as CategoriaCosto[]).map((k) => {
                    const fila = c.categorias.find((x) => x.categoria === k)
                    return (
                      <li key={k} className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0 text-sm">
                        <div>
                          <p className="text-foreground">{CATEGORIAS_COSTO[k].titulo}</p>
                          <p className="text-xs text-muted-foreground">
                            {CATEGORIAS_COSTO[k].detalle}
                            <span className="block">{dolares(c.tarifas[k])} por mensaje</span>
                          </p>
                        </div>
                        <div className="text-right tabular-nums">
                          <p className="font-medium text-foreground">{dolares(fila?.costo ?? 0)}</p>
                          <p className="text-xs text-muted-foreground">
                            {num(fila?.cobrables ?? 0)} cobrados de {num(fila?.enviados ?? 0)}
                          </p>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </Tarjeta>
              <Tarjeta titulo="Por mes">
                {c.meses.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No se enviaron mensajes desde el panel en el periodo.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {c.meses.map((m) => (
                      <li key={m.mes} className="flex justify-between py-2 first:pt-0 last:pb-0 text-sm tabular-nums">
                        <span className="text-foreground">{nombreMes(m.mes)}</span>
                        <span className="text-muted-foreground">
                          {num(m.cobrables)} cobrados de {num(m.enviados)}
                          <span className="ml-3 font-medium text-foreground">{dolares(m.costo)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Tarjeta>
            </div>
            <p className="text-xs text-muted-foreground">
              Solo cuesta lo que sale del panel por la API de WhatsApp: lo enviado desde la app del celular y lo que escriben
              los clientes es gratis. Cuando Meta informa el cobro de un mensaje se usa ese dato
              {c.estimados > 0 && <> ({num(c.estimados)} mensajes aún son estimados)</>}. Las tarifas se cambian en{' '}
              <Link href="/configuracion/parametros" className="underline">
                Configuración → Parámetros
              </Link>
              .
            </p>
          </div>
        )}
      </section>

      <Tarjeta titulo="Probabilidad de firma" className="mt-6">
        <p className="text-sm text-foreground">
          El modelo que estima qué propietarios tienen más probabilidad de firmar se activa cuando haya historial suficiente;
          su cálculo queda fuera de la fase 1. Mientras tanto, el panel guarda los datos que necesitará: calificación, precio
          frente a la zona, respuesta a los mensajes, citas y firmas.
        </p>
        <dl className="mt-3 grid grid-cols-3 gap-3">
          <Cifra etiqueta="Propietarios con datos" valor={num(propietarios ?? 0)} />
          <Cifra etiqueta="Con calificación" valor={num(conCalificacion ?? 0)} />
          <Cifra etiqueta="Firmas" valor={num(firmas ?? 0)} />
        </dl>
        <a href="/api/export/dataset" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'mt-3')}>
          Descargar dataset (CSV)
        </a>
      </Tarjeta>
    </>
  )
}
