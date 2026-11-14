-- Notificaciones push en el celular y la computadora: cada aviso de public.notificaciones se envía como
-- push a los dispositivos del usuario. La base llama con pg_net a POST /api/push, que lo envía con web-push.
-- Requiere dos secretos en Vault (ver README, "Notificaciones push"): panel_url y panel_cron_secret.

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
  end if;
end $$;

-- Un registro por navegador o app instalada. El endpoint lo da el navegador y es único por dispositivo
create table public.suscripciones_push (
  endpoint text primary key,
  usuario_id uuid not null references public.perfiles (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index suscripciones_push_usuario_idx on public.suscripciones_push (usuario_id);

alter table public.suscripciones_push enable row level security;
create policy suscripciones_push_leer on public.suscripciones_push for select to authenticated
  using (usuario_id = auth.uid());
create policy suscripciones_push_borrar on public.suscripciones_push for delete to authenticated
  using (usuario_id = auth.uid());
revoke all on public.suscripciones_push from anon;

-- Guarda el dispositivo del usuario actual. Si ese navegador ya estaba activado por otro usuario
-- (computadora compartida), pasa a ser del que lo activa ahora.
create or replace function public.guardar_suscripcion_push(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.es_usuario_activo() then
    raise exception 'Usuario no autorizado' using errcode = '42501';
  end if;
  insert into public.suscripciones_push (endpoint, usuario_id, p256dh, auth)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update
    set usuario_id = excluded.usuario_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
end $$;

revoke all on function public.guardar_suscripcion_push(text, text, text) from public, anon;
grant execute on function public.guardar_suscripcion_push(text, text, text) to authenticated, service_role;

-- Cada aviso nuevo pide a /api/push que lo envíe. pg_net encola la llamada y la hace al confirmar la
-- transacción, así que no frena a quien creó el aviso. Sin pg_net o sin los secretos (local) no hace nada.
create or replace function public.notificaciones_enviar_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_url text;
  v_secreto text;
begin
  if to_regnamespace('net') is null or to_regclass('vault.decrypted_secrets') is null then
    return new;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'panel_url';
  select decrypted_secret into v_secreto from vault.decrypted_secrets where name = 'panel_cron_secret';
  if v_url is null or v_secreto is null then
    return new;
  end if;
  perform net.http_post(
    url := rtrim(v_url, '/') || '/api/push',
    body := jsonb_build_object('id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secreto)
  );
  return new;
end $$;

revoke all on function public.notificaciones_enviar_push() from public, anon, authenticated;

create trigger notificaciones_push after insert on public.notificaciones
  for each row execute function public.notificaciones_enviar_push();
