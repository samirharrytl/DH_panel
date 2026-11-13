import type { Metadata } from 'next'
import { exigirAdmin } from '@/lib/auth'
import { crearClienteServidor } from '@/lib/supabase/server'
import { fecha } from '@/lib/formato'
import { Aviso, Campo, Seleccion, Tabla } from '@/components/campos'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { BotonAccion, BotonEnviar, Dialogo, Formulario } from '@/components/formulario'
import { cambiarActivo, crearUsuario, editarUsuario } from './acciones'
import { CamposAcceso } from './campos-acceso'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export const metadata: Metadata = { title: 'Usuarios' }

export default async function PaginaUsuarios() {
  const yo = await exigirAdmin()
  const supabase = await crearClienteServidor()
  const [{ data: usuarios }, { data: leads }] = await Promise.all([
    supabase.from('perfiles').select('*').order('activo', { ascending: false }).order('nombre'),
    supabase.from('leads').select('asesor_id').eq('vigente', true),
  ])
  const porAsesor = new Map<string, number>()
  leads?.forEach((l) => l.asesor_id && porAsesor.set(l.asesor_id, (porAsesor.get(l.asesor_id) ?? 0) + 1))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Cada persona tiene su propio acceso. El asesor ve solo los leads que se le asignan; el administrador ve todo.
        </p>
        <Dialogo titulo="Nuevo usuario" boton="+ Nuevo usuario" variante="default" tamano="default">
          <Formulario accion={crearUsuario}>
            <Campo etiqueta="Nombre">
              <Input name="nombre" required />
            </Campo>
            <Campo etiqueta="Correo">
              <Input type="email" name="email" required />
            </Campo>
            <Campo etiqueta="Rol">
              <Seleccion name="rol" defaultValue="asesor">
                <option value="asesor">Asesor</option>
                <option value="administrador">Administrador (también trabaja como asesor)</option>
              </Seleccion>
            </Campo>
            <CamposAcceso />
            <BotonEnviar>Crear usuario</BotonEnviar>
          </Formulario>
        </Dialogo>
      </div>

      <Tabla>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead className="max-sm:hidden">Rol</TableHead>
            <TableHead className="max-sm:hidden">Leads vigentes</TableHead>
            <TableHead className="max-sm:hidden">Estado</TableHead>
            <TableHead className="max-sm:hidden">Desde</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {usuarios?.map((u) => (
            <TableRow key={u.id} className={u.activo ? '' : 'text-muted-foreground'}>
              <TableCell className="max-sm:whitespace-normal">
                <p className="font-medium text-foreground">{u.nombre}</p>
                <p className="text-xs break-all text-muted-foreground">{u.email}</p>
                {/* En el celular las demás columnas se resumen aquí */}
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground sm:hidden">
                  {u.rol === 'administrador' ? 'Administrador' : 'Asesor'}
                  <Badge variant={u.activo ? 'verde' : 'gris'}>{u.activo ? 'Activo' : 'Desactivado'}</Badge>
                  <span>
                    {porAsesor.get(u.id) ?? 0} {(porAsesor.get(u.id) ?? 0) === 1 ? 'lead' : 'leads'}
                  </span>
                </p>
              </TableCell>
              <TableCell className="max-sm:hidden">{u.rol === 'administrador' ? 'Administrador' : 'Asesor'}</TableCell>
              <TableCell className="max-sm:hidden">{porAsesor.get(u.id) ?? 0}</TableCell>
              <TableCell className="max-sm:hidden">
                <Badge variant={u.activo ? 'verde' : 'gris'}>{u.activo ? 'Activo' : 'Desactivado'}</Badge>
              </TableCell>
              <TableCell className="max-sm:hidden">{fecha(u.created_at)}</TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2 max-sm:flex-col max-sm:items-end">
                  <Dialogo titulo={`Editar a ${u.nombre}`} boton="Editar">
                    <Formulario accion={editarUsuario}>
                      <input type="hidden" name="id" value={u.id} />
                      <Campo etiqueta="Nombre">
                        <Input name="nombre" defaultValue={u.nombre} required />
                      </Campo>
                      <Campo etiqueta="Teléfono">
                        <Input name="telefono" defaultValue={u.telefono ?? ''} />
                      </Campo>
                      <Campo etiqueta="Rol">
                        <Seleccion name="rol" defaultValue={u.rol}>
                          <option value="asesor">Asesor</option>
                          <option value="administrador">Administrador</option>
                        </Seleccion>
                      </Campo>
                      <BotonEnviar>Guardar</BotonEnviar>
                    </Formulario>
                  </Dialogo>
                  {u.id !== yo.id && (
                    <BotonAccion
                      accion={cambiarActivo.bind(null, u.id, !u.activo)}
                      variante={u.activo ? 'peligro' : 'outline'}
                      confirmar={
                        u.activo
                          ? `¿Desactivar a ${u.nombre}? No podrá entrar, pero su historial se conserva.`
                          : undefined
                      }
                    >
                      {u.activo ? 'Desactivar' : 'Activar'}
                    </BotonAccion>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Tabla>
      <Aviso>
        Los leads de un asesor desactivado siguen a su nombre: reasígnalos desde la bandeja de leads filtrando por ese
        asesor.
      </Aviso>
    </div>
  )
}
