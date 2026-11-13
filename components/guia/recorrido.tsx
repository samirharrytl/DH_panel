'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { BookOpen, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, X } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { cerrarGuia, irAlPaso, minimizarGuia, useGuia, type EstadoGuia } from './estado'
import { GUIAS, LISTA_DE, MENU_DE, NOMBRE_RUTA, NOMBRE_TAB, coincideRuta, type Paso } from './guias'

// Recorrido interactivo: un panel con el paso en curso y un marco que señala en la página el elemento
// donde se hace. Sigue al usuario entre páginas y avanza solo cuando llega a la pantalla del paso
// siguiente.
//
// En el celular el panel va en el flujo de la página, pegado bajo el encabezado: así nunca tapa el
// contenido ni sus botones, y se pliega a una barra de un renglón (sola, mientras se escribe). Desde
// `sm` es una tarjeta flotante abajo a la derecha.

type Ubicacion =
  | { tipo: 'aqui' }
  // En la ficha correcta, pero en otra pestaña
  | { tipo: 'pestana'; href: string; nombre: string }
  // El paso es sobre una ficha y aún no se abrió ninguna
  | { tipo: 'ficha'; enLista: boolean; lista: string }
  | { tipo: 'lejos'; href: string; nombre: string }

function ubicar(paso: Paso, pathname: string, tab: string): Ubicacion {
  const { ruta, tab: pestana } = paso.donde
  if (coincideRuta(ruta, pathname)) {
    if (!pestana || pestana === tab) return { tipo: 'aqui' }
    return { tipo: 'pestana', href: `${pathname}?tab=${pestana}`, nombre: NOMBRE_TAB[pestana] ?? pestana }
  }
  const lista = LISTA_DE[ruta]
  if (lista) return { tipo: 'ficha', enLista: pathname === lista.ruta, lista: lista.ruta }
  return { tipo: 'lejos', href: ruta, nombre: NOMBRE_RUTA[ruta] ?? ruta }
}

// Elemento que se señala según dónde esté el usuario: el del paso, la pestaña, la lista o el menú
function objetivoDe(paso: Paso, u: Ubicacion) {
  if (u.tipo === 'aqui') return paso.objetivo ?? null
  if (u.tipo === 'pestana') return `tab-${paso.donde.tab}`
  if (u.tipo === 'ficha' && u.enLista) return LISTA_DE[paso.donde.ruta].objetivo
  const menu = MENU_DE[paso.donde.ruta]
  return menu ? `nav-${menu}` : null
}

// `grande`: ocupa buena parte de la pantalla (un formulario); se marca solo con el borde, sin teñirlo
type Marco = { top: number; left: number; width: number; height: number; grande: boolean }
type Vista = { clave: string; marco: Marco | null; dialogo: boolean }

const PANEL = '[data-guia-panel]'
const visible = (e: Element) => e.getClientRects().length > 0

// Franja de la pantalla donde el elemento señalado queda a la vista: debajo de lo que va pegado arriba
// (el encabezado y, en el celular, el panel de la guía) y encima de la tarjeta flotante si lo taparía.
function franja(r: DOMRect) {
  let arriba = 0
  let abajo = window.innerHeight
  for (const fijo of document.querySelectorAll(`header, ${PANEL}`)) {
    const f = fijo.getBoundingClientRect()
    if (!f.height) continue
    const posicion = getComputedStyle(fijo).position
    if (posicion === 'sticky' && f.top < window.innerHeight / 2) arriba = Math.max(arriba, f.bottom)
    else if (posicion === 'fixed' && f.top > window.innerHeight / 2 && f.left < r.right && f.right > r.left)
      abajo = Math.min(abajo, f.top)
  }
  // Si la tarjeta deja muy poco sitio, se ignora: mejor verlo a medias que no moverse
  if (abajo - arriba < 200) abajo = window.innerHeight
  return { arriba: arriba + 12, abajo: abajo - 12 }
}

// Trae el elemento a la franja visible. A lo ancho mueve solo su tira deslizable (las pestañas).
function acercar(el: Element) {
  const r = el.getBoundingClientRect()
  if (r.left < 8 || r.right > window.innerWidth - 8) {
    for (let p = el.parentElement; p; p = p.parentElement) {
      if (p.scrollWidth > p.clientWidth + 1 && /(auto|scroll)/.test(getComputedStyle(p).overflowX)) {
        const tira = p.getBoundingClientRect()
        p.scrollBy({ left: (r.left + r.right) / 2 - (tira.left + tira.right) / 2, behavior: 'smooth' })
        break
      }
    }
  }
  const { arriba, abajo } = franja(r)
  if (r.top >= arriba && r.bottom <= abajo) return
  // Si cabe, centrado; si no, con su inicio arriba
  const delta = r.height <= abajo - arriba ? (r.top + r.bottom) / 2 - (arriba + abajo) / 2 : r.top - arriba
  window.scrollBy({ top: delta, behavior: 'smooth' })
}

// Sigue la posición del elemento señalado (la página cambia de tamaño, se desplaza y se vuelve a
// pintar tras cada acción) y avisa si hay un diálogo abierto.
function useVista(objetivo: string | null, clave: string) {
  const [vista, setVista] = useState<Vista>({ clave: '', marco: null, dialogo: false })
  const acercado = useRef('')

  useEffect(() => {
    const medir = () => {
      const dialogo = document.querySelector('[role="dialog"]') !== null
      const el = objetivo ? [...document.querySelectorAll(`[data-guia="${objetivo}"]`)].find(visible) : undefined
      let marco: Marco | null = null
      if (el) {
        if (acercado.current !== clave && !dialogo) {
          acercado.current = clave
          acercar(el)
        }
        const r = el.getBoundingClientRect()
        marco = {
          top: Math.round(r.top),
          left: Math.round(r.left),
          width: Math.round(r.width),
          height: Math.round(r.height),
          grande: r.height > window.innerHeight * 0.45,
        }
      }
      setVista((v) => {
        const igual =
          v.clave === clave &&
          v.dialogo === dialogo &&
          v.marco?.top === marco?.top &&
          v.marco?.left === marco?.left &&
          v.marco?.width === marco?.width &&
          v.marco?.height === marco?.height
        return igual ? v : { clave, marco, dialogo }
      })
    }
    const id = window.setInterval(medir, 150)
    window.addEventListener('scroll', medir, { passive: true, capture: true })
    window.addEventListener('resize', medir)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('scroll', medir, { capture: true })
      window.removeEventListener('resize', medir)
    }
  }, [objetivo, clave])

  const alDia = vista.clave === clave
  return { marco: alDia ? vista.marco : null, buscado: alDia, dialogo: vista.dialogo }
}

const SIN_TECLADO = ['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'range', 'color', 'image', 'hidden']
const esCampo = (e: EventTarget | Element | null) =>
  e instanceof HTMLElement &&
  (e.isContentEditable ||
    e instanceof HTMLTextAreaElement ||
    (e instanceof HTMLInputElement && !SIN_TECLADO.includes(e.type)))

// Hay un campo de texto con el foco: en el celular el teclado ocupa media pantalla
function useEscribiendo() {
  const [escribiendo, setEscribiendo] = useState(false)
  useEffect(() => {
    let espera = 0
    const entra = (e: FocusEvent) => {
      if (!esCampo(e.target)) return
      window.clearTimeout(espera)
      setEscribiendo(true)
    }
    // Con espera: al pasar de un campo a otro el foco sale y entra enseguida
    const sale = () => {
      window.clearTimeout(espera)
      espera = window.setTimeout(() => setEscribiendo(esCampo(document.activeElement)), 150)
    }
    document.addEventListener('focusin', entra)
    document.addEventListener('focusout', sale)
    return () => {
      window.clearTimeout(espera)
      document.removeEventListener('focusin', entra)
      document.removeEventListener('focusout', sale)
    }
  }, [])
  return escribiendo
}

export function Recorrido() {
  const estado = useGuia()
  return estado ? <Activo estado={estado} /> : null
}

// Con la tarjeta flotante (desde sm), deja sitio al final de la página para que lo último se pueda
// desplazar por encima de ella. En el celular no hace falta: el panel va en el flujo.
export function ReservaGuia() {
  const estado = useGuia()
  return estado && !estado.min ? <div aria-hidden className="hidden h-80 sm:block" /> : null
}

function Activo({ estado }: { estado: EstadoGuia }) {
  const pathname = usePathname()
  const tab = useSearchParams().get('tab') ?? 'resumen'
  const guia = GUIAS[estado.guia]
  const total = guia.pasos.length
  const paso = guia.pasos[estado.paso]
  const siguiente = guia.pasos[estado.paso + 1] as Paso | undefined
  const u = ubicar(paso, pathname, tab)
  const objetivo = objetivoDe(paso, u)
  const { marco, buscado, dialogo } = useVista(objetivo, `${estado.guia}:${estado.paso}:${pathname}:${tab}`)
  const escribiendo = useEscribiendo()
  // En el celular: plegado por el usuario o, mientras escribe, para dejarle la pantalla al formulario.
  // Dentro de un diálogo no: el panel ya está oculto y plegarlo movería la página que queda detrás
  const plegado = estado.min || (escribiendo && !dialogo)

  // Al cambiar de pantalla: si el usuario ya llegó a donde se hace el paso siguiente, avanza solo
  const lugar = `${pathname}?${tab}`
  const lugarPrevio = useRef(lugar)
  useEffect(() => {
    if (lugarPrevio.current === lugar) return
    lugarPrevio.current = lugar
    if (u.tipo !== 'aqui' && siguiente && ubicar(siguiente, pathname, tab).tipo === 'aqui') irAlPaso(estado.paso + 1)
  })

  // Con el panel pegado arriba (celular), el navegador deja ese sitio libre al llevar un campo o un
  // ancla a la vista
  const panel = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = panel.current
    if (!el) return
    const raiz = document.documentElement
    const ajustar = () => {
      const pegado = getComputedStyle(el).position === 'sticky'
      raiz.style.scrollPaddingTop = pegado ? `${Math.round(el.getBoundingClientRect().height) + 64}px` : ''
    }
    const observador = new ResizeObserver(ajustar)
    observador.observe(el)
    window.addEventListener('resize', ajustar)
    ajustar()
    return () => {
      observador.disconnect()
      window.removeEventListener('resize', ajustar)
      raiz.style.scrollPaddingTop = ''
    }
  }, [])

  const ultimo = estado.paso === total - 1
  const sinPestana = u.tipo === 'pestana' && buscado && !marco
  // En la pantalla del paso, pero sin la sección que señala (por ejemplo, postventa en un lead que no es Cliente)
  const sinSeccion = u.tipo === 'aqui' && !!paso.objetivo && !!paso.abre && buscado && !marco
  const avanzar = () => {
    if (!ultimo) return irAlPaso(estado.paso + 1)
    cerrarGuia()
    toast.success('Terminaste la guía. Puedes repetirla desde Guías.')
  }

  return (
    <>
      {marco && !dialogo && (
        // Por debajo del encabezado y del panel (z-30): al desplazar, el marco pasa por detrás
        <div
          aria-hidden
          className={cn(
            'pointer-events-none fixed z-20 rounded-2xl ring-[3px] ring-exito-vivo transition-[top,left,width,height] duration-150',
            estado.min && 'sm:hidden',
          )}
          style={{ top: marco.top - 4, left: marco.left - 4, width: marco.width + 8, height: marco.height + 8 }}
        >
          {!marco.grande && <span className="absolute inset-0 animate-pulse rounded-2xl bg-exito-vivo/10" />}
        </div>
      )}

      <section
        ref={panel}
        data-guia-panel
        aria-label={`Guía: ${guia.titulo}`}
        className={cn(
          'sticky top-14 z-30 border-b border-border bg-card shadow-sm',
          'sm:fixed sm:top-auto sm:right-4 sm:bottom-4 sm:z-40 sm:w-[23rem] sm:rounded-2xl sm:border sm:shadow-xl',
          estado.min && 'sm:hidden',
          // Un diálogo abierto lo tapa y no deja tocarlo: la indicación va dentro del diálogo. Se oculta
          // sin quitarlo del flujo para que la página no salte
          dialogo && 'invisible',
        )}
      >
        {/* Celular, plegado: un renglón con el paso y el botón para seguir */}
        <div className={cn('flex items-stretch sm:hidden', !plegado && 'hidden')}>
          <button
            type="button"
            aria-expanded={false}
            aria-label={`Guía, paso ${estado.paso + 1} de ${total}: ${paso.titulo}. Mostrar el paso`}
            onClick={() => minimizarGuia(false)}
            className="flex min-h-12 min-w-0 flex-1 items-center gap-2 pr-2 pl-4 text-left"
          >
            <BookOpen aria-hidden className="size-4 shrink-0 text-exito-vivo" />
            <span className="min-w-0 flex-1 truncate text-sm text-foreground">
              <span className="font-medium text-primary">
                {estado.paso + 1}/{total}
              </span>{' '}
              · {paso.titulo}
            </span>
            <ChevronDown aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          </button>
          {u.tipo === 'aqui' && (
            <button
              type="button"
              onClick={avanzar}
              className="flex min-h-12 shrink-0 items-center gap-1 border-l border-border px-4 text-sm font-medium text-primary"
            >
              {ultimo ? 'Terminar' : 'Siguiente'}
              {!ultimo && <ChevronRight aria-hidden className="size-4" />}
            </button>
          )}
        </div>

        <div className={cn(plegado && 'max-sm:hidden')}>
          <div className="flex items-center gap-1 border-b border-border py-1 pr-1.5 pl-4 sm:py-1.5">
            <BookOpen aria-hidden className="size-4 shrink-0 text-exito-vivo" />
            <p className="ml-1 min-w-0 flex-1 truncate text-xs text-muted-foreground">
              <span className="font-medium text-primary">{guia.titulo}</span> · paso {estado.paso + 1} de {total}
            </p>
            <Button
              variant="ghost"
              size="icon-sm"
              className="max-sm:size-10"
              aria-label="Minimizar la guía"
              title="Minimizar"
              onClick={() => minimizarGuia(true)}
            >
              <ChevronUp aria-hidden className="sm:hidden" />
              <ChevronDown aria-hidden className="max-sm:hidden" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="max-sm:size-10"
              aria-label="Salir de la guía"
              title="Salir de la guía"
              onClick={cerrarGuia}
            >
              <X aria-hidden />
            </Button>
          </div>
          <div className="h-1 bg-muted" aria-hidden>
            <div
              className="h-full bg-exito-vivo transition-[width]"
              style={{ width: `${((estado.paso + 1) / total) * 100}%` }}
            />
          </div>

          <div className="px-4 pt-3 pb-3 max-sm:max-h-[60dvh] max-sm:overflow-y-auto sm:pb-4" aria-live="polite">
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase max-sm:hidden">
              {paso.capitulo}
            </p>
            <h2 className="font-titulo text-base leading-snug font-semibold text-primary sm:mt-0.5">{paso.titulo}</h2>

            {u.tipo !== 'aqui' && (
              <div className="mt-2 rounded-lg bg-secondary/60 px-3 py-2.5 text-sm text-primary">
                {u.tipo === 'lejos' && (
                  <>
                    <p>
                      Este paso se hace en <strong className="font-semibold">{u.nombre}</strong>.
                    </p>
                    <Button asChild size="sm" className="mt-2 max-sm:h-10">
                      <Link href={u.href}>Llévame a {u.nombre}</Link>
                    </Button>
                  </>
                )}
                {u.tipo === 'ficha' && (
                  <>
                    <p>{paso.abre ?? 'Abre una ficha para seguir.'}</p>
                    {u.enLista ? (
                      <p className="mt-1 text-xs">Elige uno de la lista: la guía sigue en su ficha.</p>
                    ) : (
                      <Button asChild size="sm" className="mt-2 max-sm:h-10">
                        <Link href={u.lista}>Llévame a {NOMBRE_RUTA[u.lista]}</Link>
                      </Button>
                    )}
                  </>
                )}
                {u.tipo === 'pestana' &&
                  (sinPestana ? (
                    <>
                      <p>
                        Esta ficha no tiene la pestaña <strong className="font-semibold">{u.nombre}</strong>.{' '}
                        {paso.abre}
                      </p>
                      <Button asChild size="sm" className="mt-2 max-sm:h-10">
                        <Link href={LISTA_DE[paso.donde.ruta].ruta}>Elegir otra ficha</Link>
                      </Button>
                    </>
                  ) : (
                    <>
                      <p>
                        Este paso está en la pestaña <strong className="font-semibold">{u.nombre}</strong>.
                      </p>
                      <Button asChild size="sm" className="mt-2 max-sm:h-10">
                        <Link href={u.href} scroll={false}>
                          Abrir {u.nombre}
                        </Link>
                      </Button>
                    </>
                  ))}
              </div>
            )}

            {sinSeccion && (
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Esta ficha no muestra esa sección. {paso.abre}
              </p>
            )}

            {/* Fuera de la pantalla del paso, en el celular basta con decir a dónde ir */}
            <p
              className={
                u.tipo === 'aqui'
                  ? 'mt-1.5 text-sm text-foreground'
                  : 'mt-2 text-xs text-muted-foreground max-sm:hidden'
              }
            >
              {paso.texto}
            </p>

            <div className="mt-3 flex items-center justify-between gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="max-sm:h-10"
                disabled={estado.paso === 0}
                onClick={() => irAlPaso(estado.paso - 1)}
              >
                <ChevronLeft aria-hidden />
                Atrás
              </Button>
              <Button
                variant={ultimo ? 'exito' : 'default'}
                size="sm"
                className="max-sm:h-10 max-sm:px-4"
                onClick={avanzar}
              >
                {ultimo ? 'Terminar' : 'Siguiente'}
                {!ultimo && <ChevronRight aria-hidden />}
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Desde sm, minimizada: una píldora abajo a la derecha */}
      {estado.min && (
        <button
          type="button"
          onClick={() => minimizarGuia(false)}
          className={cn(
            'fixed right-4 bottom-4 z-40 hidden min-h-11 items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground shadow-lg sm:inline-flex',
            dialogo && 'invisible',
          )}
        >
          <BookOpen aria-hidden className="size-4" />
          Guía · paso {estado.paso + 1} de {total}
        </button>
      )}
    </>
  )
}
