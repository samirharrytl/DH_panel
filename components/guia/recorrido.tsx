'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { BookOpen, ChevronLeft, ChevronRight, Minus, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cerrarGuia, irAlPaso, minimizarGuia, useGuia, type EstadoGuia } from './estado'
import { GUIAS, LISTA_DE, MENU_DE, NOMBRE_RUTA, NOMBRE_TAB, coincideRuta, type Paso } from './guias'

// Recorrido interactivo: un panel flotante con el paso en curso y un marco que señala en la página el
// elemento donde se hace. Sigue al usuario entre páginas y avanza solo cuando llega a la pantalla del
// paso siguiente.

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

type Marco = { top: number; left: number; width: number; height: number }
type Vista = { clave: string; marco: Marco | null; dialogo: boolean }

const visible = (e: Element) => e.getClientRects().length > 0

// Sigue la posición del elemento señalado (la página cambia de tamaño, se desplaza y se vuelve a
// pintar tras cada acción) y avisa si hay un diálogo abierto.
function useVista(objetivo: string | null, clave: string) {
  const [vista, setVista] = useState<Vista>({ clave: '', marco: null, dialogo: false })
  const desplazado = useRef('')

  useEffect(() => {
    const medir = () => {
      const dialogo = document.querySelector('[role="dialog"]') !== null
      const el = objetivo ? [...document.querySelectorAll(`[data-guia="${objetivo}"]`)].find(visible) : undefined
      let marco: Marco | null = null
      if (el) {
        if (desplazado.current !== clave && !dialogo) {
          desplazado.current = clave
          const r = el.getBoundingClientRect()
          const fuera = r.top < 72 || r.bottom > window.innerHeight - 24
          if (fuera)
            el.scrollIntoView({ block: r.height > window.innerHeight * 0.6 ? 'start' : 'center', behavior: 'smooth' })
        }
        const r = el.getBoundingClientRect()
        marco = {
          top: Math.round(r.top),
          left: Math.round(r.left),
          width: Math.round(r.width),
          height: Math.round(r.height),
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

export function Recorrido() {
  const estado = useGuia()
  return estado ? <Activo estado={estado} /> : null
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
  const { marco, buscado, dialogo } = useVista(
    estado.min ? null : objetivo,
    `${estado.guia}:${estado.paso}:${pathname}:${tab}`,
  )

  // Al cambiar de pantalla: si el usuario ya llegó a donde se hace el paso siguiente, avanza solo
  const lugar = `${pathname}?${tab}`
  const lugarPrevio = useRef(lugar)
  useEffect(() => {
    if (lugarPrevio.current === lugar) return
    lugarPrevio.current = lugar
    if (u.tipo !== 'aqui' && siguiente && ubicar(siguiente, pathname, tab).tipo === 'aqui') irAlPaso(estado.paso + 1)
  })

  // Un diálogo abierto tapa el panel y no deja tocarlo: la indicación se muestra dentro del diálogo
  if (dialogo) return null

  if (estado.min) {
    return (
      <button
        type="button"
        onClick={() => minimizarGuia(false)}
        className="fixed right-3 bottom-3 z-40 inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground shadow-lg sm:right-4 sm:bottom-4"
      >
        <BookOpen aria-hidden className="size-4" />
        Guía · paso {estado.paso + 1} de {total}
      </button>
    )
  }

  const ultimo = estado.paso === total - 1
  const sinPestana = u.tipo === 'pestana' && buscado && !marco
  // En la pantalla del paso, pero sin la sección que señala (por ejemplo, postventa en un lead que no es Cliente)
  const sinSeccion = u.tipo === 'aqui' && !!paso.objetivo && !!paso.abre && buscado && !marco

  return (
    <>
      {marco && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-40 rounded-2xl ring-[3px] ring-exito-vivo ring-offset-2 ring-offset-transparent transition-[top,left,width,height] duration-150"
          style={{ top: marco.top - 4, left: marco.left - 4, width: marco.width + 8, height: marco.height + 8 }}
        >
          <span className="absolute inset-0 animate-pulse rounded-2xl bg-exito-vivo/10" />
        </div>
      )}

      <section
        aria-label={`Guía: ${guia.titulo}`}
        className="fixed inset-x-2 bottom-2 z-40 rounded-2xl border border-border bg-card shadow-xl sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-[23rem]"
      >
        <div className="flex items-center gap-2 border-b border-border py-1.5 pr-1.5 pl-4">
          <BookOpen aria-hidden className="size-4 shrink-0 text-exito-vivo" />
          <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            <span className="font-medium text-primary">{guia.titulo}</span> · paso {estado.paso + 1} de {total}
          </p>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Minimizar la guía"
            title="Minimizar"
            onClick={() => minimizarGuia(true)}
          >
            <Minus aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
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

        <div className="px-4 pt-3 pb-4" aria-live="polite">
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{paso.capitulo}</p>
          <h2 className="mt-0.5 font-titulo text-base leading-snug font-semibold text-primary">{paso.titulo}</h2>

          {u.tipo !== 'aqui' && (
            <div className="mt-2 rounded-lg bg-secondary/60 px-3 py-2.5 text-sm text-primary">
              {u.tipo === 'lejos' && (
                <>
                  <p>
                    Este paso se hace en <strong className="font-semibold">{u.nombre}</strong>.
                  </p>
                  <Button asChild size="sm" className="mt-2">
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
                    <Button asChild size="sm" className="mt-2">
                      <Link href={u.lista}>Llévame a {NOMBRE_RUTA[u.lista]}</Link>
                    </Button>
                  )}
                </>
              )}
              {u.tipo === 'pestana' &&
                (sinPestana ? (
                  <>
                    <p>
                      Esta ficha no tiene la pestaña <strong className="font-semibold">{u.nombre}</strong>. {paso.abre}
                    </p>
                    <Button asChild size="sm" className="mt-2">
                      <Link href={LISTA_DE[paso.donde.ruta].ruta}>Elegir otra ficha</Link>
                    </Button>
                  </>
                ) : (
                  <>
                    <p>
                      Este paso está en la pestaña <strong className="font-semibold">{u.nombre}</strong>.
                    </p>
                    <Button asChild size="sm" className="mt-2">
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

          <p className={u.tipo === 'aqui' ? 'mt-1.5 text-sm text-foreground' : 'mt-2 text-xs text-muted-foreground'}>
            {paso.texto}
          </p>

          <div className="mt-3 flex items-center justify-between gap-2">
            <Button variant="ghost" size="sm" disabled={estado.paso === 0} onClick={() => irAlPaso(estado.paso - 1)}>
              <ChevronLeft aria-hidden />
              Atrás
            </Button>
            {ultimo ? (
              <Button
                variant="exito"
                size="sm"
                onClick={() => {
                  cerrarGuia()
                  toast.success('Terminaste la guía. Puedes repetirla desde Guías.')
                }}
              >
                Terminar
              </Button>
            ) : (
              <Button size="sm" onClick={() => irAlPaso(estado.paso + 1)}>
                Siguiente
                <ChevronRight aria-hidden />
              </Button>
            )}
          </div>
        </div>
      </section>
    </>
  )
}
