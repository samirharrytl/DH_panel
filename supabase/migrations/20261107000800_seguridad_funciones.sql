-- Permisos de ejecución de funciones. Postgres concede EXECUTE a PUBLIC y Supabase también a anon y
-- authenticated. Nadie sin sesión ejecuta nada; los usuarios con sesión ejecutan las funciones del
-- panel (cada una valida acceso), y las internas solo las llaman otras funciones o el servidor.
do $$
declare
  f record;
  internas text[] := array[
    'registrar_evento', 'notificar', 'notificar_admins', 'fijar_estado', 'avanzar_estado',
    'marcar_respuesta_lead', 'registrar_lead_interno', 'notificar_cita', 'revisar_calificacion',
    'atribuir_mensaje_entrante', 'registrar_entrante_whatsapp', 'actualizar_estado_whatsapp'
  ];
begin
  for f in
    select p.oid::regprocedure as firma, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
  loop
    execute format('revoke all on function %s from public, anon', f.firma);
    if f.proname = any (internas) then
      execute format('revoke all on function %s from authenticated', f.firma);
    else
      execute format('grant execute on function %s to authenticated', f.firma);
    end if;
    execute format('grant execute on function %s to service_role', f.firma);
  end loop;
end $$;

-- Lo mismo para las funciones que se creen después en el esquema
alter default privileges in schema public revoke execute on functions from public, anon;
