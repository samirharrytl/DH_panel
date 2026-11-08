-- Tareas programadas (recordatorios automáticos desde un cron externo): el servidor usa la clave secreta
-- (rol service_role), que ya salta la RLS. Las funciones que validan acceso con es_admin() lo aceptan
-- también, para que el servidor pueda registrar mensajes y avisos con las mismas reglas que el panel.
-- current_setting('role') sigue siendo el rol de la petición dentro de funciones security definer.
create or replace function public.es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select current_setting('role', true) = 'service_role' or exists (
    select 1 from public.perfiles where id = auth.uid() and activo and rol = 'administrador'
  );
$$;
