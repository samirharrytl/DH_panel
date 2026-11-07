-- Fase 2: leads y seguimiento (HU-05 a HU-11, y registro manual de mensajes de HU-12)

create type public.tipo_lead as enum ('propietario', 'interesado');
create type public.estado_lead as enum (
  'nuevo', 'contactado', 'en_conversacion',
  'cita_agendada', 'cita_realizada',
  'calificado', 'match_enviado', 'visita_agendada', 'visita_realizada', 'compraventa',
  'cliente',
  'no_responde', 'descartado', 'baja'
);
create type public.canal_origen as enum (
  'whatsapp', 'canal_whatsapp', 'facebook', 'instagram', 'tiktok', 'web', 'portal', 'referido',
  'llamada', 'otro'
);

-- Una persona por número de teléfono: puede ser propietario e interesado a la vez.
create table public.personas (
  id uuid primary key default gen_random_uuid(),
  telefono text not null unique check (telefono ~ '^[0-9]{8,15}$'),
  nombre text not null,
  email text,
  genero text check (genero in ('femenino', 'masculino')),
  horario_preferido text,
  medio_contacto text check (medio_contacto in ('chat_whatsapp', 'llamada_whatsapp', 'celular')),
  no_contactar boolean not null default false,
  no_contactar_at timestamptz,
  intencion text check (intencion in ('invertir', 'comprar_otro', 'vender')),
  ultimo_entrante_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references public.perfiles (id) default auth.uid(),
  updated_at timestamptz not null default now()
);

create trigger personas_updated_at before update on public.personas
  for each row execute function public.tocar_updated_at();

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  persona_id uuid not null references public.personas (id),
  tipo public.tipo_lead not null,
  estado public.estado_lead not null default 'nuevo',
  canal public.canal_origen not null,
  canal_detalle text,
  asesor_id uuid references public.perfiles (id),
  vigente boolean not null default true,
  ciclo int not null default 1,
  lead_anterior_id uuid references public.leads (id),
  consentimiento_datos boolean not null default false,
  consentimiento_marketing boolean not null default false,
  consentimiento_at timestamptz,
  recibe_novedades boolean not null default true,
  bienvenida_at timestamptz,
  respondio_at timestamptz,
  ultima_interaccion_at timestamptz not null default now(),
  estado_antes_salida public.estado_lead,
  salida_at timestamptz,
  motivo_salida text,
  ultimas_novedades_at timestamptz,
  proxima_accion text,
  proxima_accion_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references public.perfiles (id) default auth.uid(),
  updated_at timestamptz not null default now(),
  constraint leads_estado_por_tipo check (
    (tipo = 'propietario' and estado not in ('calificado', 'match_enviado', 'visita_agendada', 'visita_realizada', 'compraventa'))
    or (tipo = 'interesado' and estado not in ('cita_agendada', 'cita_realizada'))
  )
);

create unique index leads_un_vigente_por_tipo on public.leads (persona_id, tipo) where vigente;
create index leads_asesor_idx on public.leads (asesor_id);
create index leads_estado_idx on public.leads (estado);

-- Orden dentro del embudo; las salidas no tienen orden
create or replace function public.orden_estado(p_estado public.estado_lead) returns int
language sql immutable as $$
  select case p_estado
    when 'nuevo' then 1
    when 'contactado' then 2
    when 'en_conversacion' then 3
    when 'cita_agendada' then 4
    when 'calificado' then 4
    when 'cita_realizada' then 5
    when 'match_enviado' then 5
    when 'visita_agendada' then 6
    when 'visita_realizada' then 7
    when 'compraventa' then 8
    when 'cliente' then 9
  end;
$$;

create or replace function public.es_salida(p_estado public.estado_lead) returns boolean
language sql immutable as $$
  select p_estado in ('no_responde', 'descartado', 'baja');
$$;

create or replace function public.puede_ver_lead(p_lead_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.leads l
    where l.id = p_lead_id
      and (public.es_admin() or (l.asesor_id = auth.uid() and public.es_usuario_activo()))
  );
$$;

create or replace function public.puede_ver_persona(p_persona_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.es_admin() or (
    public.es_usuario_activo()
    and exists (select 1 from public.leads l where l.persona_id = p_persona_id and l.asesor_id = auth.uid())
  );
$$;

-- Historial de estados (HU-09): lo escribe un trigger, así ningún cambio se salta el registro.
create table public.lead_historial (
  id bigint generated always as identity primary key,
  lead_id uuid not null references public.leads (id) on delete cascade,
  estado_anterior public.estado_lead,
  estado_nuevo public.estado_lead not null,
  nota text,
  autor_id uuid references public.perfiles (id),
  created_at timestamptz not null default now()
);

create index lead_historial_lead_idx on public.lead_historial (lead_id, created_at);

create table public.notas (
  id bigint generated always as identity primary key,
  lead_id uuid not null references public.leads (id) on delete cascade,
  texto text not null check (length(trim(texto)) > 0),
  autor_id uuid references public.perfiles (id) default auth.uid(),
  created_at timestamptz not null default now()
);

create index notas_lead_idx on public.notas (lead_id, created_at);

-- Bitácora de todo lo que pasa con leads, personas e inmuebles. Alimenta la ficha y el modelo predictivo.
create table public.eventos (
  id bigint generated always as identity primary key,
  tipo text not null,
  lead_id uuid references public.leads (id) on delete cascade,
  persona_id uuid references public.personas (id),
  inmueble_id uuid,
  datos jsonb not null default '{}',
  autor_id uuid references public.perfiles (id),
  created_at timestamptz not null default now()
);

create index eventos_lead_idx on public.eventos (lead_id, created_at);
create index eventos_persona_idx on public.eventos (persona_id, created_at);
create index eventos_tipo_idx on public.eventos (tipo, created_at);

create or replace function public.registrar_evento(
  p_tipo text,
  p_lead_id uuid default null,
  p_datos jsonb default '{}',
  p_inmueble_id uuid default null,
  p_persona_id uuid default null
) returns void
language sql security definer set search_path = public as $$
  insert into public.eventos (tipo, lead_id, persona_id, inmueble_id, datos, autor_id)
  values (
    p_tipo, p_lead_id,
    coalesce(p_persona_id, (select persona_id from public.leads where id = p_lead_id)),
    p_inmueble_id, coalesce(p_datos, '{}'), auth.uid()
  );
$$;

-- Alertas para cada usuario
create table public.notificaciones (
  id bigint generated always as identity primary key,
  usuario_id uuid not null references public.perfiles (id),
  tipo text not null,
  titulo text not null,
  cuerpo text,
  enlace text,
  leida_at timestamptz,
  created_at timestamptz not null default now()
);

create index notificaciones_usuario_idx on public.notificaciones (usuario_id, leida_at, created_at desc);

create or replace function public.notificar(
  p_usuario_id uuid, p_tipo text, p_titulo text, p_cuerpo text default null, p_enlace text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_usuario_id is null or p_usuario_id = auth.uid() then
    return;
  end if;
  insert into public.notificaciones (usuario_id, tipo, titulo, cuerpo, enlace)
  values (p_usuario_id, p_tipo, p_titulo, p_cuerpo, p_enlace);
end $$;

create or replace function public.notificar_admins(
  p_tipo text, p_titulo text, p_cuerpo text default null, p_enlace text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid;
begin
  for v_admin in select id from public.perfiles where rol = 'administrador' and activo loop
    perform public.notificar(v_admin, p_tipo, p_titulo, p_cuerpo, p_enlace);
  end loop;
end $$;

-- Cadencia de refuerzos de cada lead (HU-08)
create table public.refuerzos (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  numero int not null,
  dia int not null,
  fecha date not null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'enviado', 'cancelado')),
  enviado_at timestamptz,
  enviado_por uuid references public.perfiles (id),
  mensaje_id uuid,
  unique (lead_id, numero)
);

-- Historial de WhatsApp de la persona: un número, un chat.
create table public.mensajes (
  id uuid primary key default gen_random_uuid(),
  persona_id uuid not null references public.personas (id),
  lead_id uuid references public.leads (id),
  direccion text not null check (direccion in ('entrante', 'saliente')),
  tipo text not null default 'texto' check (tipo in ('texto', 'plantilla', 'imagen', 'documento', 'audio', 'interactivo', 'otro')),
  cuerpo text,
  plantilla_clave text,
  origen text not null check (origen in ('whatsapp', 'panel', 'manual', 'simulado')),
  estado text not null default 'registrado' check (estado in ('registrado', 'enviado', 'entregado', 'leido', 'fallido', 'recibido')),
  wa_id text unique,
  error text,
  metadata jsonb not null default '{}',
  autor_id uuid references public.perfiles (id) default auth.uid(),
  leido_at timestamptz,
  created_at timestamptz not null default now()
);

create index mensajes_persona_idx on public.mensajes (persona_id, created_at);
create index mensajes_sin_leer_idx on public.mensajes (persona_id) where direccion = 'entrante' and leido_at is null;

alter table public.refuerzos
  add constraint refuerzos_mensaje_fk foreign key (mensaje_id) references public.mensajes (id);

-- Normaliza a dígitos con código de país (51 para Perú)
create or replace function public.normalizar_telefono(p text) returns text
language plpgsql immutable as $$
declare
  d text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
begin
  if d like '00%' then
    d := substr(d, 3);
  end if;
  if length(d) = 9 and d like '9%' then
    d := '51' || d;
  elsif d like '0%' and length(d) between 8 and 9 then
    d := '51' || substr(d, 2);
  end if;
  if length(d) < 8 or length(d) > 15 then
    return null;
  end if;
  return d;
end $$;

-- Triggers de leads
create or replace function public.leads_antes_de_guardar() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if public.es_salida(new.estado) and not public.es_salida(old.estado) then
      new.estado_antes_salida := old.estado;
      new.salida_at := now();
    elsif not public.es_salida(new.estado) and public.es_salida(old.estado) then
      new.salida_at := null;
    end if;
    new.updated_at := now();
  end if;
  return new;
end $$;

create trigger leads_antes before insert or update on public.leads
  for each row execute function public.leads_antes_de_guardar();

create or replace function public.leads_despues_de_guardar() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_nombre text;
begin
  if tg_op = 'INSERT' or new.estado is distinct from old.estado then
    insert into public.lead_historial (lead_id, estado_anterior, estado_nuevo, nota, autor_id)
    values (
      new.id,
      case when tg_op = 'UPDATE' then old.estado end,
      new.estado,
      nullif(current_setting('app.nota_estado', true), ''),
      auth.uid()
    );
  end if;

  if tg_op = 'INSERT' or new.asesor_id is distinct from old.asesor_id then
    select nombre into v_nombre from public.personas where id = new.persona_id;
    if new.asesor_id is not null then
      perform public.notificar(new.asesor_id, 'lead_asignado', 'Nuevo lead asignado',
        v_nombre || ' (' || new.tipo || ')', '/leads/' || new.id);
    elsif tg_op = 'INSERT' then
      perform public.notificar_admins('lead_sin_asignar', 'Lead nuevo sin asignar',
        v_nombre || ' (' || new.tipo || ')', '/leads/' || new.id);
    end if;
  end if;
  return null;
end $$;

create trigger leads_despues after insert or update on public.leads
  for each row execute function public.leads_despues_de_guardar();

-- Cambia el estado guardando la nota en el historial (uso interno)
create or replace function public.fijar_estado(
  p_lead_id uuid, p_estado public.estado_lead, p_nota text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('app.nota_estado', coalesce(p_nota, ''), true);
  update public.leads set estado = p_estado where id = p_lead_id and estado is distinct from p_estado;
  perform set_config('app.nota_estado', '', true);
end $$;

-- Avanza el estado por una acción, nunca lo retrocede (uso interno)
create or replace function public.avanzar_estado(
  p_lead_id uuid, p_estado public.estado_lead, p_nota text default null
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_actual public.estado_lead;
begin
  select estado into v_actual from public.leads where id = p_lead_id for update;
  if v_actual in ('baja', 'cliente') then
    return false;
  end if;
  if v_actual in ('no_responde', 'descartado') or public.orden_estado(v_actual) < public.orden_estado(p_estado) then
    perform public.fijar_estado(p_lead_id, p_estado, p_nota);
    update public.leads set ultima_interaccion_at = now() where id = p_lead_id;
    return true;
  end if;
  return false;
end $$;

-- El lead respondió: sale de la cadencia y vuelve a la conversación (uso interno)
create or replace function public.marcar_respuesta_lead(p_lead_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_estado public.estado_lead;
begin
  select estado into v_estado from public.leads where id = p_lead_id;
  if v_estado is null or v_estado in ('baja', 'cliente') then
    return;
  end if;
  update public.leads set respondio_at = now(), ultima_interaccion_at = now() where id = p_lead_id;
  update public.refuerzos set estado = 'cancelado' where lead_id = p_lead_id and estado = 'pendiente';
  if v_estado in ('nuevo', 'contactado', 'no_responde') then
    perform public.fijar_estado(p_lead_id, 'en_conversacion', 'Respondió');
  end if;
end $$;

-- Lógica de registro de leads, compartida por el panel y por WhatsApp (uso interno)
create or replace function public.registrar_lead_interno(
  p_telefono text,
  p_nombre text,
  p_tipo public.tipo_lead,
  p_canal public.canal_origen,
  p_canal_detalle text,
  p_email text,
  p_consentimiento_datos boolean,
  p_consentimiento_marketing boolean,
  p_asesor_id uuid,
  p_nota text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tel text := public.normalizar_telefono(p_telefono);
  v_persona public.personas%rowtype;
  v_persona_nueva boolean := false;
  v_lead public.leads%rowtype;
  v_anterior public.leads%rowtype;
  v_lead_id uuid;
  v_asesor uuid;
  v_resultado text;
  v_plazo int := coalesce(public.param_int('retorno_plazo_meses'), 6);
  v_retomado public.estado_lead;
begin
  if v_tel is null then
    raise exception 'El teléfono no es válido';
  end if;
  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'El nombre es obligatorio';
  end if;

  select * into v_persona from public.personas where telefono = v_tel for update;
  if not found then
    insert into public.personas (telefono, nombre, email)
    values (v_tel, trim(p_nombre), nullif(trim(p_email), ''))
    returning * into v_persona;
    v_persona_nueva := true;
  elsif v_persona.email is null and nullif(trim(p_email), '') is not null then
    update public.personas set email = trim(p_email) where id = v_persona.id;
  end if;

  select * into v_lead from public.leads
  where persona_id = v_persona.id and tipo = p_tipo and vigente
  for update;

  if not found then
    select * into v_anterior from public.leads
    where persona_id = v_persona.id and tipo = p_tipo
    order by ciclo desc limit 1;
    insert into public.leads (
      persona_id, tipo, canal, canal_detalle, asesor_id, ciclo, lead_anterior_id,
      consentimiento_datos, consentimiento_marketing, consentimiento_at
    ) values (
      v_persona.id, p_tipo, p_canal, p_canal_detalle, coalesce(v_anterior.asesor_id, p_asesor_id),
      coalesce(v_anterior.ciclo + 1, 1), v_anterior.id,
      coalesce(p_consentimiento_datos, false), coalesce(p_consentimiento_marketing, false),
      case when p_consentimiento_datos or p_consentimiento_marketing then now() end
    ) returning id into v_lead_id;
    v_resultado := case when v_persona_nueva then 'nuevo' else 'persona_existente' end;

  elsif v_lead.estado = 'baja' or v_persona.no_contactar then
    v_lead_id := v_lead.id;
    v_resultado := 'baja';

  elsif v_lead.estado = 'cliente' or v_lead.ultima_interaccion_at < now() - make_interval(months => v_plazo) then
    -- Pasado el plazo (o ya es cliente): ciclo nuevo, mismo asesor, historial visible
    update public.leads set vigente = false where id = v_lead.id;
    insert into public.leads (
      persona_id, tipo, canal, canal_detalle, asesor_id, ciclo, lead_anterior_id,
      consentimiento_datos, consentimiento_marketing, consentimiento_at
    ) values (
      v_persona.id, p_tipo, p_canal, p_canal_detalle, coalesce(v_lead.asesor_id, p_asesor_id),
      v_lead.ciclo + 1, v_lead.id,
      coalesce(p_consentimiento_datos, false), coalesce(p_consentimiento_marketing, false),
      case when p_consentimiento_datos or p_consentimiento_marketing then now() end
    ) returning id into v_lead_id;
    v_resultado := 'nuevo_ciclo';

  else
    -- Dentro del plazo: se retoma donde quedó
    v_lead_id := v_lead.id;
    if v_lead.estado in ('no_responde', 'descartado') then
      v_retomado := case
        when v_lead.estado_antes_salida in ('en_conversacion', 'cita_realizada', 'calificado', 'match_enviado', 'visita_realizada')
          then v_lead.estado_antes_salida
        else 'en_conversacion'
      end;
      perform public.fijar_estado(v_lead.id, v_retomado, 'Volvió a dejar sus datos (' || p_canal || ')');
      v_resultado := 'retomado';
    else
      v_resultado := 'ya_activo';
    end if;
    update public.leads
    set ultima_interaccion_at = now(),
        asesor_id = coalesce(asesor_id, p_asesor_id),
        consentimiento_datos = consentimiento_datos or coalesce(p_consentimiento_datos, false),
        consentimiento_marketing = consentimiento_marketing or coalesce(p_consentimiento_marketing, false),
        consentimiento_at = case
          when (p_consentimiento_datos and not consentimiento_datos)
            or (p_consentimiento_marketing and not consentimiento_marketing) then now()
          else consentimiento_at
        end
    where id = v_lead.id;
  end if;

  select * into v_lead from public.leads where id = v_lead_id;

  if nullif(trim(p_nota), '') is not null then
    insert into public.notas (lead_id, texto) values (v_lead_id, trim(p_nota));
  end if;

  perform public.registrar_evento(
    case when v_resultado in ('nuevo', 'persona_existente') then 'lead_registrado' else 'lead_regreso' end,
    v_lead_id,
    jsonb_build_object('resultado', v_resultado, 'canal', p_canal, 'canal_detalle', p_canal_detalle)
  );

  if v_resultado in ('retomado', 'ya_activo', 'baja') then
    perform public.notificar(v_lead.asesor_id, 'lead_regreso', 'Un lead volvió a escribir',
      v_persona.nombre || ' (' || p_tipo || ')', '/leads/' || v_lead_id);
  end if;

  return jsonb_build_object(
    'lead_id', v_lead_id,
    'persona_id', v_persona.id,
    'resultado', v_resultado,
    'asesor_id', v_lead.asesor_id,
    'asesor_nombre', (select nombre from public.perfiles where id = v_lead.asesor_id)
  );
end $$;

-- HU-05 y HU-06: registro de lead desde el panel
create or replace function public.registrar_lead(
  p_telefono text,
  p_nombre text,
  p_tipo public.tipo_lead,
  p_canal public.canal_origen,
  p_canal_detalle text default null,
  p_email text default null,
  p_consentimiento_datos boolean default false,
  p_consentimiento_marketing boolean default false,
  p_asesor_id uuid default null,
  p_nota text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_asesor uuid;
  v_resultado jsonb;
begin
  if not public.es_usuario_activo() then
    raise exception 'Usuario no autorizado' using errcode = '42501';
  end if;
  -- El asesor registra para sí mismo; el administrador elige (o deja sin asignar)
  if public.es_admin() then
    v_asesor := p_asesor_id;
  else
    v_asesor := auth.uid();
  end if;
  v_resultado := public.registrar_lead_interno(
    p_telefono, p_nombre, p_tipo, p_canal, p_canal_detalle, p_email,
    p_consentimiento_datos, p_consentimiento_marketing, v_asesor, p_nota
  );
  return v_resultado || jsonb_build_object(
    'visible', public.es_admin() or (v_resultado ->> 'asesor_id')::uuid = auth.uid()
  );
end $$;

-- HU-09: cambio manual de estado con nota
create or replace function public.cambiar_estado_lead(
  p_lead_id uuid, p_estado public.estado_lead, p_nota text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  l public.leads%rowtype;
begin
  if not public.puede_ver_lead(p_lead_id) then
    raise exception 'No tienes acceso a este lead' using errcode = '42501';
  end if;
  select * into l from public.leads where id = p_lead_id for update;
  if l.estado = p_estado then
    return;
  end if;
  if not l.vigente then
    raise exception 'Este lead es de un ciclo anterior y ya no cambia de estado';
  end if;
  if l.estado = 'cliente' then
    raise exception 'Un cliente no cambia de estado. Si vuelve, se abre un ciclo nuevo';
  end if;
  if l.estado = 'baja' then
    raise exception 'El lead está en Baja. Usa "Reactivar" solo si la persona pidió volver';
  end if;
  if p_estado in ('cita_agendada', 'visita_agendada', 'compraventa', 'cliente') then
    raise exception 'Ese estado se asigna con su acción: agendar, iniciar la compraventa, registrar el contrato o el cierre';
  end if;
  if l.tipo = 'propietario' and p_estado in ('calificado', 'match_enviado', 'visita_realizada') then
    raise exception 'Ese estado no aplica a propietarios';
  end if;
  if l.tipo = 'interesado' and p_estado = 'cita_realizada' then
    raise exception 'Ese estado no aplica a interesados';
  end if;
  if p_estado = 'baja' then
    perform public.dar_baja(p_lead_id, p_nota);
    return;
  end if;
  if p_estado = 'descartado' and coalesce(trim(p_nota), '') = '' then
    raise exception 'Indica el motivo del descarte';
  end if;

  perform public.fijar_estado(p_lead_id, p_estado, p_nota);
  update public.leads
  set ultima_interaccion_at = now(),
      motivo_salida = case when p_estado = 'descartado' then p_nota else motivo_salida end
  where id = p_lead_id;
  if p_estado in ('no_responde', 'descartado') then
    update public.refuerzos set estado = 'cancelado' where lead_id = p_lead_id and estado = 'pendiente';
  end if;
end $$;

-- HU-10: asignación manual
create or replace function public.asignar_lead(p_lead_id uuid, p_asesor_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.es_admin() then
    raise exception 'Solo el administrador asigna leads' using errcode = '42501';
  end if;
  if p_asesor_id is not null and not exists (select 1 from public.perfiles where id = p_asesor_id and activo) then
    raise exception 'El asesor no existe o está desactivado';
  end if;
  update public.leads set asesor_id = p_asesor_id where id = p_lead_id;
  perform public.registrar_evento('lead_asignado', p_lead_id, jsonb_build_object('asesor_id', p_asesor_id));
end $$;

-- HU-11: Baja. Aplica a la persona: se detienen todos los envíos.
create or replace function public.dar_baja(p_lead_id uuid, p_motivo text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_persona uuid;
  v_lead uuid;
begin
  if not public.puede_ver_lead(p_lead_id) then
    raise exception 'No tienes acceso a este lead' using errcode = '42501';
  end if;
  select persona_id into v_persona from public.leads where id = p_lead_id;
  update public.personas set no_contactar = true, no_contactar_at = now() where id = v_persona;
  for v_lead in
    select id from public.leads where persona_id = v_persona and vigente and estado not in ('baja', 'cliente')
  loop
    perform public.fijar_estado(v_lead, 'baja', coalesce(nullif(trim(p_motivo), ''), 'Pidió no ser contactado'));
    update public.leads set motivo_salida = p_motivo where id = v_lead;
    update public.refuerzos set estado = 'cancelado' where lead_id = v_lead and estado = 'pendiente';
  end loop;
  perform public.registrar_evento('baja', p_lead_id, jsonb_build_object('motivo', p_motivo));
end $$;

create or replace function public.reactivar_lead(p_lead_id uuid, p_nota text) returns void
language plpgsql security definer set search_path = public as $$
declare
  l public.leads%rowtype;
begin
  if not public.puede_ver_lead(p_lead_id) then
    raise exception 'No tienes acceso a este lead' using errcode = '42501';
  end if;
  if coalesce(trim(p_nota), '') = '' then
    raise exception 'Anota cómo pidió volver la persona';
  end if;
  select * into l from public.leads where id = p_lead_id for update;
  if l.estado <> 'baja' then
    raise exception 'El lead no está en Baja';
  end if;
  update public.personas set no_contactar = false, no_contactar_at = null where id = l.persona_id;
  perform public.fijar_estado(p_lead_id, 'en_conversacion', 'Reactivado: ' || p_nota);
  update public.leads set ultima_interaccion_at = now() where id = p_lead_id;
  perform public.registrar_evento('reactivado', p_lead_id, jsonb_build_object('nota', p_nota));
end $$;

create or replace function public.actualizar_consentimiento(
  p_lead_id uuid, p_datos boolean, p_marketing boolean
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.puede_ver_lead(p_lead_id) then
    raise exception 'No tienes acceso a este lead' using errcode = '42501';
  end if;
  update public.leads
  set consentimiento_datos = p_datos, consentimiento_marketing = p_marketing, consentimiento_at = now()
  where id = p_lead_id;
  perform public.registrar_evento('consentimiento', p_lead_id,
    jsonb_build_object('datos', p_datos, 'marketing', p_marketing, 'ley', '29733'));
end $$;

-- Bienvenida (Día 0): crea la cadencia de refuerzos según el parámetro
create or replace function public.registrar_bienvenida(p_lead_id uuid, p_mensaje_id uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  l public.leads%rowtype;
begin
  if not public.puede_ver_lead(p_lead_id) then
    raise exception 'No tienes acceso a este lead' using errcode = '42501';
  end if;
  select * into l from public.leads where id = p_lead_id for update;
  if l.estado = 'baja' then
    raise exception 'El lead está en Baja: no recibe mensajes';
  end if;
  if l.bienvenida_at is not null then
    raise exception 'La bienvenida ya se envió';
  end if;

  update public.leads set bienvenida_at = now() where id = p_lead_id;
  perform public.registrar_evento('bienvenida_enviada', p_lead_id, jsonb_build_object('mensaje_id', p_mensaje_id));

  if l.respondio_at is not null then
    -- Ya había escrito: no hay cadencia, se sigue la conversación
    perform public.avanzar_estado(p_lead_id, 'en_conversacion', 'Bienvenida enviada');
    return;
  end if;

  insert into public.refuerzos (lead_id, numero, dia, fecha)
  select p_lead_id, t.n, t.dia::int, public.hoy_lima() + t.dia::int
  from jsonb_array_elements_text(coalesce(public.param('refuerzos_dias'), '[]')) with ordinality as t(dia, n);

  perform public.avanzar_estado(p_lead_id, 'contactado', 'Bienvenida enviada');
end $$;

create or replace function public.registrar_refuerzo(p_refuerzo_id uuid, p_mensaje_id uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  r public.refuerzos%rowtype;
begin
  select * into r from public.refuerzos where id = p_refuerzo_id for update;
  if not found or not public.puede_ver_lead(r.lead_id) then
    raise exception 'No tienes acceso a este refuerzo' using errcode = '42501';
  end if;
  if r.estado <> 'pendiente' then
    raise exception 'Este refuerzo ya no está pendiente';
  end if;
  if exists (select 1 from public.leads where id = r.lead_id and estado = 'baja') then
    raise exception 'El lead está en Baja: no recibe mensajes';
  end if;
  update public.refuerzos
  set estado = 'enviado', enviado_at = now(), enviado_por = auth.uid(), mensaje_id = p_mensaje_id
  where id = p_refuerzo_id;
  perform public.registrar_evento('refuerzo_enviado', r.lead_id,
    jsonb_build_object('numero', r.numero, 'dia', r.dia, 'mensaje_id', p_mensaje_id));
end $$;

-- El asesor marca que el lead respondió (por ejemplo, por llamada)
create or replace function public.registrar_respuesta(p_lead_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.puede_ver_lead(p_lead_id) then
    raise exception 'No tienes acceso a este lead' using errcode = '42501';
  end if;
  perform public.marcar_respuesta_lead(p_lead_id);
  perform public.registrar_evento('respondio', p_lead_id, jsonb_build_object('origen', 'manual'));
end $$;

-- Tras el último refuerzo sin respuesta, el lead pasa a "No responde" al día siguiente (HU-08)
create or replace function public.procesar_cadencias() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_lead uuid;
  v_total int := 0;
  v_inicio_hoy timestamptz := public.hoy_lima()::timestamp at time zone 'America/Lima';
begin
  for v_lead in
    select l.id from public.leads l
    where l.estado = 'contactado'
      and l.vigente
      and l.bienvenida_at is not null
      and (l.respondio_at is null or l.respondio_at < l.bienvenida_at)
      and not exists (select 1 from public.refuerzos r where r.lead_id = l.id and r.estado = 'pendiente')
      and coalesce(
        (select max(r.enviado_at) from public.refuerzos r where r.lead_id = l.id and r.estado = 'enviado'),
        l.bienvenida_at
      ) < v_inicio_hoy
  loop
    perform public.fijar_estado(v_lead, 'no_responde', 'Sin respuesta tras el último refuerzo');
    perform public.registrar_evento('no_responde', v_lead);
    v_total := v_total + 1;
  end loop;
  return v_total;
end $$;

-- Mensajes: registro y efectos
create or replace function public.mensajes_antes_de_guardar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.direccion = 'saliente' and exists (
    select 1 from public.personas where id = new.persona_id and no_contactar
  ) then
    raise exception 'La persona pidió no ser contactada (Baja): no se le envían mensajes';
  end if;
  if new.lead_id is null then
    select id into new.lead_id from public.leads
    where persona_id = new.persona_id and vigente
    order by ultima_interaccion_at desc limit 1;
  end if;
  return new;
end $$;

create trigger mensajes_antes before insert on public.mensajes
  for each row execute function public.mensajes_antes_de_guardar();

create or replace function public.mensajes_despues_de_guardar() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_lead record;
  v_nombre text;
  v_notificados int := 0;
begin
  if new.direccion <> 'entrante' then
    return null;
  end if;
  if new.origen in ('whatsapp', 'simulado') then
    update public.personas
    set ultimo_entrante_at = greatest(coalesce(ultimo_entrante_at, new.created_at), new.created_at)
    where id = new.persona_id;
  end if;
  select nombre into v_nombre from public.personas where id = new.persona_id;
  for v_lead in
    select id, asesor_id from public.leads where persona_id = new.persona_id and vigente
  loop
    perform public.marcar_respuesta_lead(v_lead.id);
    if new.origen <> 'manual' and v_lead.asesor_id is not null then
      perform public.notificar(v_lead.asesor_id, 'mensaje', 'Mensaje de ' || v_nombre,
        left(new.cuerpo, 140), '/leads/' || v_lead.id || '?tab=chat');
      v_notificados := v_notificados + 1;
    end if;
  end loop;
  if new.origen <> 'manual' and v_notificados = 0 then
    perform public.notificar_admins('mensaje', 'Mensaje de ' || v_nombre,
      left(new.cuerpo, 140), '/chats?persona=' || new.persona_id);
  end if;
  return null;
end $$;

create trigger mensajes_despues after insert on public.mensajes
  for each row execute function public.mensajes_despues_de_guardar();

-- Registro de un mensaje desde el panel: envío (tras llamar a WhatsApp) o registro manual (HU-12)
create or replace function public.registrar_mensaje(
  p_persona_id uuid,
  p_direccion text,
  p_cuerpo text,
  p_origen text,
  p_lead_id uuid default null,
  p_estado text default 'registrado',
  p_tipo text default 'texto',
  p_plantilla_clave text default null,
  p_wa_id text default null,
  p_error text default null,
  p_metadata jsonb default '{}'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not public.puede_ver_persona(p_persona_id) then
    raise exception 'No tienes acceso a esta persona' using errcode = '42501';
  end if;
  if p_origen not in ('panel', 'manual') then
    raise exception 'Origen no permitido';
  end if;
  insert into public.mensajes (
    persona_id, lead_id, direccion, tipo, cuerpo, plantilla_clave, origen, estado, wa_id, error, metadata
  ) values (
    p_persona_id, p_lead_id, p_direccion, p_tipo, p_cuerpo, p_plantilla_clave, p_origen, p_estado,
    p_wa_id, p_error, coalesce(p_metadata, '{}')
  ) returning id into v_id;
  return v_id;
end $$;

create or replace function public.marcar_mensajes_leidos(p_persona_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.puede_ver_persona(p_persona_id) then
    raise exception 'No tienes acceso a esta persona' using errcode = '42501';
  end if;
  update public.mensajes set leido_at = now()
  where persona_id = p_persona_id and direccion = 'entrante' and leido_at is null;
end $$;

-- Novedades para leads en "No responde" (una vez al mes por defecto, solo con consentimiento de marketing)
create or replace function public.novedades_no_responde_desde(l public.leads) returns timestamptz
language sql stable security definer set search_path = public as $$
  select coalesce(l.ultimas_novedades_at, l.salida_at)
    + make_interval(days => coalesce(public.param_int('novedades_no_responde_dias'), 30));
$$;

create or replace function public.registrar_novedades_enviadas(p_lead_id uuid, p_mensaje_id uuid default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.puede_ver_lead(p_lead_id) then
    raise exception 'No tienes acceso a este lead' using errcode = '42501';
  end if;
  update public.leads set ultimas_novedades_at = now() where id = p_lead_id;
  perform public.registrar_evento('novedades_enviadas', p_lead_id, jsonb_build_object('mensaje_id', p_mensaje_id));
end $$;

-- Bandeja (HU-07): próxima acción calculada. Se amplía con citas en la fase 3.
create or replace view public.v_bandeja with (security_invoker = true) as
select
  l.id,
  l.numero,
  l.tipo,
  l.estado,
  l.canal,
  l.asesor_id,
  a.nombre as asesor_nombre,
  l.persona_id,
  p.nombre,
  p.telefono,
  l.vigente,
  l.created_at,
  l.ultima_interaccion_at,
  pa.accion as proxima_accion,
  pa.fecha as proxima_accion_at
from public.leads l
join public.personas p on p.id = l.persona_id
left join public.perfiles a on a.id = l.asesor_id
left join lateral (
  select x.accion, x.fecha from (
    select 'Enviar bienvenida'::text as accion, l.created_at as fecha
    where l.bienvenida_at is null and l.estado = 'nuevo'
    union all
    select 'Enviar refuerzo ' || r.numero, r.fecha::timestamp at time zone 'America/Lima'
    from public.refuerzos r where r.lead_id = l.id and r.estado = 'pendiente'
    union all
    select 'Enviar novedades', public.novedades_no_responde_desde(l)
    where l.estado = 'no_responde' and l.consentimiento_marketing and not p.no_contactar
    union all
    select l.proxima_accion, l.proxima_accion_at
    where l.proxima_accion_at is not null and l.estado not in ('baja')
  ) x
  where x.fecha is not null
  order by x.fecha
  limit 1
) pa on true;

-- RLS
alter table public.personas enable row level security;
alter table public.leads enable row level security;
alter table public.lead_historial enable row level security;
alter table public.notas enable row level security;
alter table public.eventos enable row level security;
alter table public.notificaciones enable row level security;
alter table public.refuerzos enable row level security;
alter table public.mensajes enable row level security;

create policy personas_leer on public.personas for select to authenticated
  using (public.puede_ver_persona(id));
create policy personas_editar on public.personas for update to authenticated
  using (public.puede_ver_persona(id)) with check (public.puede_ver_persona(id));

create policy leads_leer on public.leads for select to authenticated
  using (public.es_admin() or (asesor_id = auth.uid() and public.es_usuario_activo()));
create policy leads_editar on public.leads for update to authenticated
  using (public.es_admin() or (asesor_id = auth.uid() and public.es_usuario_activo()))
  with check (public.es_admin() or (asesor_id = auth.uid() and public.es_usuario_activo()));

create policy historial_leer on public.lead_historial for select to authenticated
  using (public.puede_ver_lead(lead_id));

create policy notas_leer on public.notas for select to authenticated
  using (public.puede_ver_lead(lead_id));
create policy notas_crear on public.notas for insert to authenticated
  with check (public.puede_ver_lead(lead_id) and autor_id = auth.uid());

create policy eventos_leer on public.eventos for select to authenticated
  using (
    public.es_admin()
    or (lead_id is not null and public.puede_ver_lead(lead_id))
    or (lead_id is null and persona_id is not null and public.puede_ver_persona(persona_id))
    or (lead_id is null and persona_id is null and public.es_usuario_activo())
  );

create policy notificaciones_leer on public.notificaciones for select to authenticated
  using (usuario_id = auth.uid());
create policy notificaciones_marcar on public.notificaciones for update to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

create policy refuerzos_leer on public.refuerzos for select to authenticated
  using (public.puede_ver_lead(lead_id));

create policy mensajes_leer on public.mensajes for select to authenticated
  using (public.puede_ver_persona(persona_id));

revoke all on public.personas, public.leads, public.lead_historial, public.notas, public.eventos,
  public.notificaciones, public.refuerzos, public.mensajes, public.v_bandeja from anon, authenticated;
grant select on public.personas, public.leads, public.lead_historial, public.notas, public.eventos,
  public.notificaciones, public.refuerzos, public.mensajes, public.v_bandeja to authenticated;
grant insert on public.notas to authenticated;
grant update (nombre, email, genero, horario_preferido, medio_contacto, intencion) on public.personas to authenticated;
grant update (proxima_accion, proxima_accion_at, recibe_novedades, canal, canal_detalle) on public.leads to authenticated;
grant update (leida_at) on public.notificaciones to authenticated;
grant all on public.personas, public.leads, public.lead_historial, public.notas, public.eventos,
  public.notificaciones, public.refuerzos, public.mensajes, public.v_bandeja to service_role;

-- Funciones internas: solo las llaman otras funciones
revoke execute on function public.registrar_evento(text, uuid, jsonb, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.notificar(uuid, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.notificar_admins(text, text, text, text) from public, anon, authenticated;
revoke execute on function public.fijar_estado(uuid, public.estado_lead, text) from public, anon, authenticated;
revoke execute on function public.avanzar_estado(uuid, public.estado_lead, text) from public, anon, authenticated;
revoke execute on function public.marcar_respuesta_lead(uuid) from public, anon, authenticated;
revoke execute on function public.registrar_lead_interno(text, text, public.tipo_lead, public.canal_origen, text, text, boolean, boolean, uuid, text) from public, anon, authenticated;
