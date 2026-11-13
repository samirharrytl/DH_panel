'use client'

import { useSyncExternalStore } from 'react'
import { GUIAS, type ClaveGuia } from './guias'

// Guía en curso. Vive en el navegador (localStorage) para que siga al cambiar de página o recargar.
export type EstadoGuia = { guia: ClaveGuia; paso: number; min: boolean }

const CLAVE = 'dh_guia'
let actual: EstadoGuia | null = null
let cargado = false
const oyentes = new Set<() => void>()

function leer(): EstadoGuia | null {
  try {
    const v = JSON.parse(window.localStorage.getItem(CLAVE) ?? 'null') as Partial<EstadoGuia> | null
    if (!v || typeof v.guia !== 'string' || !(v.guia in GUIAS)) return null
    const total = GUIAS[v.guia].pasos.length
    const paso = Number.isInteger(v.paso) ? Math.min(Math.max(v.paso as number, 0), total - 1) : 0
    return { guia: v.guia, paso, min: v.min === true }
  } catch {
    return null
  }
}

function instantanea() {
  if (!cargado) {
    actual = leer()
    cargado = true
  }
  return actual
}

function fijar(estado: EstadoGuia | null) {
  actual = estado
  cargado = true
  try {
    if (estado) window.localStorage.setItem(CLAVE, JSON.stringify(estado))
    else window.localStorage.removeItem(CLAVE)
  } catch {
    // Sin almacenamiento (modo privado): la guía sigue mientras no se recargue la página
  }
  oyentes.forEach((f) => f())
}

function suscribir(f: () => void) {
  oyentes.add(f)
  const otraPestana = (e: StorageEvent) => {
    if (e.key !== CLAVE) return
    actual = leer()
    f()
  }
  window.addEventListener('storage', otraPestana)
  return () => {
    oyentes.delete(f)
    window.removeEventListener('storage', otraPestana)
  }
}

export function useGuia() {
  return useSyncExternalStore(suscribir, instantanea, () => null)
}

export const iniciarGuia = (guia: ClaveGuia, paso = 0) => fijar({ guia, paso, min: false })
export const cerrarGuia = () => fijar(null)
export function irAlPaso(paso: number) {
  const e = instantanea()
  if (e && paso >= 0 && paso < GUIAS[e.guia].pasos.length) fijar({ ...e, paso })
}
export function minimizarGuia(min: boolean) {
  const e = instantanea()
  if (e) fijar({ ...e, min })
}
