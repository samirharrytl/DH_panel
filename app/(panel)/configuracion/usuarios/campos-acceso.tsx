'use client'

import { useState } from 'react'
import { Campo } from '@/components/campos'
import { Input } from '@/components/ui/input'

export function CamposAcceso() {
  const [modo, setModo] = useState<'contrasena' | 'invitacion'>('contrasena')
  return (
    <fieldset className="space-y-3">
      <legend className="mb-1 text-sm font-medium text-foreground">Acceso</legend>
      <label className="flex items-center gap-2 text-sm">
        <input type="radio" name="modo" value="contrasena" checked={modo === 'contrasena'} onChange={() => setModo('contrasena')} />
        Definir una contraseña temporal
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="radio" name="modo" value="invitacion" checked={modo === 'invitacion'} onChange={() => setModo('invitacion')} />
        Enviar invitación por correo (la persona crea su contraseña)
      </label>
      {modo === 'contrasena' && (
        <Campo etiqueta="Contraseña temporal" ayuda="Al menos 8 caracteres. Compártela por un medio seguro.">
          <Input type="password" name="password" minLength={8} autoComplete="new-password" required />
        </Campo>
      )}
    </fieldset>
  )
}
