-- Fase 3: propietarios, citas e inmuebles (HU-13 a HU-18)

create type public.estado_inmueble as enum ('en_captacion', 'en_cartera', 'vendido', 'retirado');
create type public.tipo_cita as enum ('cita_propietario', 'visita');
create type public.estado_cita as enum ('programada', 'realizada', 'cancelada', 'no_asistio');

-- HU-13: ficha de calificación del propietario (Módulo 1.2). La preferencia y el horario de contacto
-- se guardan en la persona.
create table public.calificacion_propietario (
  lead_id uuid primary key references public.leads (id) on delete cascade,
  rol_contacto text check (rol_contacto in ('propietario', 'encargado')),
  tiene_poder boolean,
  hipoteca boolean,
  hipoteca_banco text,
  hipoteca_saldo numeric(14, 2),
  tipo_inmueble text check (tipo_inmueble in ('departamento', 'casa', 'terreno', 'local', 'oficina', 'otro')),
  direccion text,
  distrito text,
  metraje numeric(10, 2),
  dormitorios int,
  banos int,
  cochera boolean,
  precio_esperado numeric(14, 2),
  urgencia text check (urgencia in ('inmediata', 'menos_3_meses', '3_a_6_meses', 'mas_6_meses', 'sin_apuro')),
  inscrito_sunarp boolean,
  copropietarios boolean,
  copropietarios_detalle text,
  notas text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.perfiles (id) default auth.uid()
);

create trigger calificacion_autor before update on public.calificacion_propietario
  for each row execute function public.tocar_autor();

create table public.inmuebles (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  codigo text generated always as ('DH-' || lpad(numero::text, 4, '0')) stored,
  propietario_lead_id uuid references public.leads (id),
  persona_id uuid references public.personas (id),
  asesor_id uuid references public.perfiles (id),
  estado public.estado_inmueble not null default 'en_captacion',
  tipo text not null check (tipo in ('departamento', 'casa', 'terreno', 'local', 'oficina', 'otro')),
  direccion text not null,
  distrito text not null,
  referencia text,
  metraje numeric(10, 2),
  dormitorios int,
  banos int,
  cocheras int not null default 0,
  ascensor boolean not null default false,
  mascotas boolean not null default false,
  caracteristicas text[] not null default '{}',
  precio_esperado numeric(14, 2),
  precio numeric(14, 2),
  conservacion text check (conservacion in ('estreno', 'muy_bueno', 'bueno', 'regular', 'para_remodelar')),
  descripcion text,
  acceso_llave text,
  acceso_codigo text,
  acceso_dni boolean not null default false,
  acceso_otros text,
  autoriza_publicar boolean not null default false,
  en_cartera_at timestamptz,
  vendido_at timestamptz,
  retirado_at timestamptz,
  motivo_retiro text,
  created_at timestamptz not null default now(),
  created_by uuid references public.perfiles (id) default auth.uid(),
  updated_at timestamptz not null default now()
);

create index inmuebles_estado_idx on public.inmuebles (estado);
create index inmuebles_distrito_idx on public.inmuebles (lower(distrito));

create trigger inmuebles_updated_at before update on public.inmuebles
  for each row execute function public.tocar_updated_at();

alter table public.leads add column inmueble_interes_id uuid references public.inmuebles (id);
alter table public.eventos
  add constraint eventos_inmueble_fk foreign key (inmueble_id) references public.inmuebles (id);
create index eventos_inmueble_idx on public.eventos (inmueble_id, created_at);

create table public.inmueble_fotos (
  id uuid primary key default gen_random_uuid(),
  inmueble_id uuid not null references public.inmuebles (id) on delete cascade,
  ruta text not null,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references public.perfiles (id) default auth.uid()
);

create index inmueble_fotos_idx on public.inmueble_fotos (inmueble_id, orden);

-- HU-16: contrato firmado en físico y registrado en la plataforma
create table public.contratos (
  id uuid primary key default gen_random_uuid(),
  inmueble_id uuid not null references public.inmuebles (id) on delete cascade,
  fecha_firma date not null,
  exclusividad boolean not null,
  plazo_meses int not null check (plazo_meses > 0),
  vence_el date generated always as ((fecha_firma + make_interval(months => plazo_meses))::date) stored,
  comision_pct numeric(5, 2) not null check (comision_pct >= 0 and comision_pct <= 100),
  autoriza_publicar boolean not null,
  archivo_ruta text,
  estado text not null default 'vigente' check (estado in ('vigente', 'renovado', 'terminado')),
  contrato_anterior_id uuid references public.contratos (id),
  notas text,
  created_at timestamptz not null default now(),
  created_by uuid references public.perfiles (id) default auth.uid()
);

create unique index contratos_un_vigente on public.contratos (inmueble_id) where estado = 'vigente';

-- HU-14 y HU-26: citas con propietarios y visitas de interesados
create table public.citas (
  id uuid primary key default gen_random_uuid(),
  tipo public.tipo_cita not null,
  lead_id uuid not null references public.leads (id),
  inmueble_id uuid references public.inmuebles (id),
  asesor_id uuid references public.perfiles (id),
  inicio timestamptz not null,
  duracion_min int not null default 60 check (duracion_min between 15 and 480),
  direccion text not null,
  distrito text,
  acceso_llave text,
  acceso_codigo text,
  acceso_dni boolean not null default false,
  acceso_otros text,
  numero int,
  estado public.estado_cita not null default 'programada',
  estado_lead_previo public.estado_lead,
  reprogramaciones int not null default 0,
  motivo_cancelacion text,
  notas text,
  resultado text,
  confirmacion_at timestamptz,
  recordatorio_24h_at timestamptz,
  recordatorio_dia_at timestamptz,
  realizada_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references public.perfiles (id) default auth.uid(),
  updated_at timestamptz not null default now()
);

create index citas_inicio_idx on public.citas (inicio);
create index citas_lead_idx on public.citas (lead_id);
create index citas_asesor_idx on public.citas (asesor_id, inicio);

create trigger citas_updated_at before update on public.citas
  for each row execute function public.tocar_updated_at();

-- Permisos sobre inmuebles
create or replace function public.puede_editar_inmueble(p_inmueble_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.es_admin() or exists (
    select 1 from public.inmuebles i
    where i.id = p_inmueble_id and i.asesor_id = auth.uid() and public.es_usuario_activo()
  );
$$;

create or replace function public.uuid_o_nulo(p text) returns uuid
language plpgsql immutable as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;

create or replace function public.puede_ver_cita(p_cita_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.citas c
    where c.id = p_cita_id
      and (public.puede_ver_lead(c.lead_id) or (c.asesor_id = auth.uid() and public.es_usuario_activo()))
  );
$$;

-- Inmueble mencionado por el lead (bienvenida personalizada, atribución)
create or replace function public.asociar_inmueble_interes(p_lead_id uuid, p_inmueble_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.puede_ver_lead(p_lead_id) then
    raise exception 'No tienes acceso a este lead' using errcode = '42501';
  end if;
  update public.leads set inmueble_interes_id = p_inmueble_id where id = p_lead_id;
  if p_inmueble_id is not null then
    perform public.registrar_evento('interes_inmueble', p_lead_id, '{}', p_inmueble_id);
  end if;
end $$;

-- Notificación de citas al asesor responsable (agendada, reprogramada o cancelada por otra persona)
create or replace function public.notificar_cita(p_cita_id uuid, p_titulo text) returns void
language plpgsql security definer set search_path = public as $$
declare
  c record;
begin
  select ci.asesor_id, ci.lead_id, ci.inicio, ci.tipo, p.nombre into c
  from public.citas ci
  join public.leads l on l.id = ci.lead_id
  join public.personas p on p.id = l.persona_id
  where ci.id = p_cita_id;
  perform public.notificar(
    c.asesor_id, 'cita', p_titulo,
    c.nombre || ' · ' || to_char(c.inicio at time zone 'America/Lima', 'DD/MM HH24:MI'),
    '/agenda?dia=' || to_char(c.inicio at time zone 'America/Lima', 'YYYY-MM-DD')
  );
end $$;

-- HU-14: agendar cita con el propietario
create or replace function public.agendar_cita(
  p_lead_id uuid,
  p_inicio timestamptz,
  p_direccion text,
  p_distrito text default null,
  p_duracion_min int default 60,
  p_acceso_llave text default null,
  p_acceso_codigo text default null,
  p_acceso_dni boolean default false,
  p_acceso_otros text default null,
  p_notas text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  l public.leads%rowtype;
  v_id uuid;
  v_numero int;
  v_inmueble uuid;
begin
  if not public.puede_ver_lead(p_lead_id) then
    raise exception 'No tienes acceso a este lead' using errcode = '42501';
  end if;
  select * into l from public.leads where id = p_lead_id for update;
  if l.tipo <> 'propietario' then
    raise exception 'Las citas son con propietarios; para interesados agenda una visita';
  end if;
  if l.estado = 'baja' then
    raise exception 'El lead está en Baja';
  end if;
  if l.estado = 'cliente' then
    raise exception 'El propietario ya firmó contrato. Si trae otro inmueble, vuelve a registrarlo para abrir un ciclo nuevo';
  end if;
  if not l.vigente then
    raise exception 'Este lead es de un ciclo anterior';
  end if;
  if coalesce(trim(p_direccion), '') = '' then
    raise exception 'La dirección es obligatoria';
  end if;
  select count(*) + 1 into v_numero from public.citas
  where lead_id = p_lead_id and tipo = 'cita_propietario' and estado in ('programada', 'realizada');
  select id into v_inmueble from public.inmuebles
  where propietario_lead_id = p_lead_id and estado in ('en_captacion', 'en_cartera')
  order by created_at desc limit 1;

  insert into public.citas (
    tipo, lead_id, inmueble_id, asesor_id, inicio, duracion_min, direccion, distrito,
    acceso_llave, acceso_codigo, acceso_dni, acceso_otros, numero, estado_lead_previo, notas
  ) values (
    'cita_propietario', p_lead_id, v_inmueble, coalesce(l.asesor_id, auth.uid()), p_inicio,
    coalesce(p_duracion_min, 60), trim(p_direccion), nullif(trim(p_distrito), ''),
    nullif(trim(p_acceso_llave), ''), nullif(trim(p_acceso_codigo), ''), coalesce(p_acceso_dni, false),
    nullif(trim(p_acceso_otros), ''), v_numero, l.estado, p_notas
  ) returning id into v_id;

  perform public.avanzar_estado(p_lead_id, 'cita_agendada', 'Cita ' || v_numero || ' agendada');
  update public.leads set ultima_interaccion_at = now() where id = p_lead_id;
  perform public.registrar_evento('cita_agendada', p_lead_id,
    jsonb_build_object('cita_id', v_id, 'numero', v_numero, 'inicio', p_inicio), v_inmueble);
  perform public.notificar_cita(v_id, 'Cita agendada');
  return v_id;
end $$;

create or replace function public.reprogramar_cita(p_cita_id uuid, p_inicio timestamptz, p_motivo text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  c public.citas%rowtype;
begin
  if not public.puede_ver_cita(p_cita_id) then
    raise exception 'No tienes acceso a esta cita' using errcode = '42501';
  end if;
  select * into c from public.citas where id = p_cita_id for update;
  if c.estado <> 'programada' then
    raise exception 'Solo se reprograma una cita programada';
  end if;
  update public.citas
  set inicio = p_inicio, reprogramaciones = reprogramaciones + 1,
      confirmacion_at = null, recordatorio_24h_at = null, recordatorio_dia_at = null
  where id = p_cita_id;
  perform public.registrar_evento(
    case when c.tipo = 'visita' then 'visita_reprogramada' else 'cita_reprogramada' end, c.lead_id,
    jsonb_build_object('cita_id', c.id, 'de', c.inicio, 'a', p_inicio, 'motivo', p_motivo), c.inmueble_id);
  perform public.notificar_cita(p_cita_id, case when c.tipo = 'visita' then 'Visita reprogramada' else 'Cita reprogramada' end);
end $$;

-- Cancelar o marcar que no asistió. Si no queda otra programada, el lead vuelve al estado previo.
create or replace function public.cancelar_cita(
  p_cita_id uuid, p_motivo text default null, p_estado public.estado_cita default 'cancelada'
) returns void
language plpgsql security definer set search_path = public as $$
declare
  c public.citas%rowtype;
  v_estado_lead public.estado_lead;
  v_agendado public.estado_lead;
begin
  if not public.puede_ver_cita(p_cita_id) then
    raise exception 'No tienes acceso a esta cita' using errcode = '42501';
  end if;
  if p_estado not in ('cancelada', 'no_asistio') then
    raise exception 'Estado no válido';
  end if;
  select * into c from public.citas where id = p_cita_id for update;
  if c.estado <> 'programada' then
    raise exception 'La cita ya no está programada';
  end if;
  update public.citas set estado = p_estado, motivo_cancelacion = p_motivo where id = p_cita_id;

  v_agendado := case when c.tipo = 'visita' then 'visita_agendada' else 'cita_agendada' end;
  select estado into v_estado_lead from public.leads where id = c.lead_id;
  if v_estado_lead = v_agendado
     and c.estado_lead_previo is not null
     and not exists (select 1 from public.citas where lead_id = c.lead_id and tipo = c.tipo and estado = 'programada') then
    perform public.fijar_estado(c.lead_id, c.estado_lead_previo,
      case when p_estado = 'cancelada' then 'Cita cancelada' else 'No asistió a la cita' end);
  end if;

  perform public.registrar_evento(
    case when c.tipo = 'visita' then 'visita_' else 'cita_' end || p_estado::text, c.lead_id,
    jsonb_build_object('cita_id', c.id, 'motivo', p_motivo), c.inmueble_id);
  perform public.notificar_cita(p_cita_id, case when c.tipo = 'visita' then 'Visita cancelada' else 'Cita cancelada' end);
end $$;

-- Confirmación y recordatorios enviados
create or replace function public.registrar_aviso_cita(p_cita_id uuid, p_aviso text, p_mensaje_id uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  c public.citas%rowtype;
begin
  if not public.puede_ver_cita(p_cita_id) then
    raise exception 'No tienes acceso a esta cita' using errcode = '42501';
  end if;
  select * into c from public.citas where id = p_cita_id;
  if p_aviso = 'confirmacion' then
    update public.citas set confirmacion_at = now() where id = p_cita_id;
  elsif p_aviso = '24h' then
    update public.citas set recordatorio_24h_at = now() where id = p_cita_id;
  elsif p_aviso = 'dia' then
    update public.citas set recordatorio_dia_at = now() where id = p_cita_id;
  else
    raise exception 'Aviso no válido';
  end if;
  perform public.registrar_evento('aviso_cita', c.lead_id,
    jsonb_build_object('cita_id', c.id, 'aviso', p_aviso, 'mensaje_id', p_mensaje_id), c.inmueble_id);
end $$;

-- HU-15: resultado de la cita. Crea (o actualiza) la ficha del inmueble en "En captación".
create or replace function public.registrar_resultado_cita(
  p_cita_id uuid,
  p_resultado text,
  p_tipo text,
  p_direccion text,
  p_distrito text,
  p_precio numeric,
  p_conservacion text,
  p_metraje numeric default null,
  p_dormitorios int default null,
  p_banos int default null,
  p_cocheras int default 0,
  p_ascensor boolean default false,
  p_descripcion text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  c public.citas%rowtype;
  l public.leads%rowtype;
  q public.calificacion_propietario%rowtype;
  v_inmueble uuid;
begin
  if not public.puede_ver_cita(p_cita_id) then
    raise exception 'No tienes acceso a esta cita' using errcode = '42501';
  end if;
  select * into c from public.citas where id = p_cita_id for update;
  if c.tipo <> 'cita_propietario' then
    raise exception 'Para visitas registra la opinión del interesado';
  end if;
  if c.estado in ('cancelada', 'no_asistio') then
    raise exception 'La cita no se realizó';
  end if;
  if p_precio is null or p_precio <= 0 then
    raise exception 'Registra el precio acordado';
  end if;
  select * into l from public.leads where id = c.lead_id;
  select * into q from public.calificacion_propietario where lead_id = c.lead_id;

  v_inmueble := c.inmueble_id;
  if v_inmueble is null then
    select id into v_inmueble from public.inmuebles
    where propietario_lead_id = c.lead_id and estado in ('en_captacion', 'en_cartera')
    order by created_at desc limit 1;
  end if;

  if v_inmueble is null then
    insert into public.inmuebles (
      propietario_lead_id, persona_id, asesor_id, tipo, direccion, distrito, metraje, dormitorios,
      banos, cocheras, ascensor, precio_esperado, precio, conservacion, descripcion,
      acceso_llave, acceso_codigo, acceso_dni, acceso_otros
    ) values (
      c.lead_id, l.persona_id, coalesce(l.asesor_id, auth.uid()), p_tipo, trim(p_direccion), trim(p_distrito),
      p_metraje, p_dormitorios, p_banos, coalesce(p_cocheras, 0), coalesce(p_ascensor, false),
      q.precio_esperado, p_precio, p_conservacion, p_descripcion,
      c.acceso_llave, c.acceso_codigo, c.acceso_dni, c.acceso_otros
    ) returning id into v_inmueble;
    perform public.registrar_evento('inmueble_creado', c.lead_id, '{}', v_inmueble);
  else
    update public.inmuebles
    set tipo = p_tipo, direccion = trim(p_direccion), distrito = trim(p_distrito), precio = p_precio,
        conservacion = p_conservacion, metraje = coalesce(p_metraje, metraje),
        dormitorios = coalesce(p_dormitorios, dormitorios), banos = coalesce(p_banos, banos),
        cocheras = coalesce(p_cocheras, cocheras), ascensor = coalesce(p_ascensor, ascensor),
        descripcion = coalesce(p_descripcion, descripcion)
    where id = v_inmueble;
  end if;

  update public.citas
  set estado = 'realizada', realizada_at = coalesce(realizada_at, now()), resultado = p_resultado, inmueble_id = v_inmueble
  where id = p_cita_id;
  perform public.avanzar_estado(c.lead_id, 'cita_realizada', 'Cita realizada');
  perform public.registrar_evento('cita_realizada', c.lead_id,
    jsonb_build_object('cita_id', c.id, 'precio', p_precio, 'conservacion', p_conservacion), v_inmueble);
  return v_inmueble;
end $$;

-- HU-16: contrato. El inmueble pasa a "En cartera" y el propietario a Cliente.
create or replace function public.registrar_contrato(
  p_inmueble_id uuid,
  p_fecha_firma date,
  p_exclusividad boolean,
  p_plazo_meses int,
  p_comision_pct numeric,
  p_autoriza_publicar boolean,
  p_archivo_ruta text default null,
  p_notas text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  i public.inmuebles%rowtype;
  v_id uuid;
begin
  if not public.puede_editar_inmueble(p_inmueble_id) then
    raise exception 'No puedes editar este inmueble' using errcode = '42501';
  end if;
  select * into i from public.inmuebles where id = p_inmueble_id for update;
  if i.estado <> 'en_captacion' then
    raise exception 'El inmueble ya no está en captación. Para extender el plazo, renueva el contrato';
  end if;
  if i.precio is null then
    raise exception 'Registra el precio acordado del inmueble antes del contrato';
  end if;
  insert into public.contratos (
    inmueble_id, fecha_firma, exclusividad, plazo_meses, comision_pct, autoriza_publicar, archivo_ruta, notas
  ) values (
    p_inmueble_id, p_fecha_firma, p_exclusividad, p_plazo_meses, p_comision_pct, p_autoriza_publicar,
    nullif(p_archivo_ruta, ''), p_notas
  ) returning id into v_id;
  update public.inmuebles
  set estado = 'en_cartera', en_cartera_at = now(), autoriza_publicar = p_autoriza_publicar
  where id = p_inmueble_id;
  if i.propietario_lead_id is not null then
    perform public.avanzar_estado(i.propietario_lead_id, 'cliente', 'Contrato firmado (' || i.codigo || ')');
  end if;
  perform public.registrar_evento('contrato_firmado', i.propietario_lead_id,
    jsonb_build_object('contrato_id', v_id, 'exclusividad', p_exclusividad, 'plazo_meses', p_plazo_meses,
                       'comision_pct', p_comision_pct, 'autoriza_publicar', p_autoriza_publicar),
    p_inmueble_id, i.persona_id);
  return v_id;
end $$;

-- HU-17: renovar el contrato (registra uno nuevo) o retirar el inmueble
create or replace function public.renovar_contrato(
  p_contrato_id uuid,
  p_fecha_firma date,
  p_plazo_meses int,
  p_exclusividad boolean,
  p_comision_pct numeric,
  p_autoriza_publicar boolean,
  p_archivo_ruta text default null,
  p_notas text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  k public.contratos%rowtype;
  v_id uuid;
begin
  select * into k from public.contratos where id = p_contrato_id for update;
  if not found or not public.puede_editar_inmueble(k.inmueble_id) then
    raise exception 'No puedes editar este contrato' using errcode = '42501';
  end if;
  if k.estado <> 'vigente' then
    raise exception 'Solo se renueva el contrato vigente';
  end if;
  update public.contratos set estado = 'renovado' where id = p_contrato_id;
  insert into public.contratos (
    inmueble_id, fecha_firma, exclusividad, plazo_meses, comision_pct, autoriza_publicar, archivo_ruta,
    contrato_anterior_id, notas
  ) values (
    k.inmueble_id, p_fecha_firma, p_exclusividad, p_plazo_meses, p_comision_pct, p_autoriza_publicar,
    nullif(p_archivo_ruta, ''), p_contrato_id, p_notas
  ) returning id into v_id;
  update public.inmuebles set autoriza_publicar = p_autoriza_publicar where id = k.inmueble_id;
  perform public.registrar_evento('contrato_renovado',
    (select propietario_lead_id from public.inmuebles where id = k.inmueble_id),
    jsonb_build_object('contrato_id', v_id, 'anterior_id', p_contrato_id, 'plazo_meses', p_plazo_meses),
    k.inmueble_id);
  return v_id;
end $$;

create or replace function public.retirar_inmueble(p_inmueble_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare
  i public.inmuebles%rowtype;
begin
  if not public.puede_editar_inmueble(p_inmueble_id) then
    raise exception 'No puedes editar este inmueble' using errcode = '42501';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Indica el motivo del retiro';
  end if;
  select * into i from public.inmuebles where id = p_inmueble_id for update;
  if i.estado in ('vendido', 'retirado') then
    raise exception 'El inmueble ya está %', i.estado;
  end if;
  update public.inmuebles
  set estado = 'retirado', retirado_at = now(), motivo_retiro = p_motivo, autoriza_publicar = false
  where id = p_inmueble_id;
  update public.contratos set estado = 'terminado' where inmueble_id = p_inmueble_id and estado = 'vigente';
  perform public.registrar_evento('inmueble_retirado', i.propietario_lead_id,
    jsonb_build_object('motivo', p_motivo), p_inmueble_id, i.persona_id);
end $$;

-- La Baja también cancela las citas programadas
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
    update public.citas set estado = 'cancelada', motivo_cancelacion = 'Baja'
    where lead_id = v_lead and estado = 'programada';
  end loop;
  perform public.registrar_evento('baja', p_lead_id, jsonb_build_object('motivo', p_motivo));
end $$;

-- Bandeja con citas y visitas como próxima acción
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
    select case when c.tipo = 'visita' then 'Visita' else 'Cita' end, c.inicio
    from public.citas c
    where c.lead_id = l.id and c.estado = 'programada' and c.inicio > now() - interval '12 hours'
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

-- HU-18: base de propiedades
create or replace view public.v_inmuebles with (security_invoker = true) as
select
  i.*,
  pe.nombre as propietario_nombre,
  a.nombre as asesor_nombre,
  (select f.ruta from public.inmueble_fotos f where f.inmueble_id = i.id order by f.orden, f.created_at limit 1) as foto_portada,
  k.vence_el as contrato_vence_el,
  k.id as contrato_id
from public.inmuebles i
left join public.personas pe on pe.id = i.persona_id
left join public.perfiles a on a.id = i.asesor_id
left join public.contratos k on k.inmueble_id = i.id and k.estado = 'vigente';

-- Storage: fotos de inmuebles y contratos escaneados, ambos privados
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('inmuebles', 'inmuebles', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('contratos', 'contratos', false, 20971520, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy "inmuebles: leer fotos" on storage.objects for select to authenticated
  using (bucket_id = 'inmuebles' and public.es_usuario_activo());
create policy "inmuebles: subir fotos" on storage.objects for insert to authenticated
  with check (bucket_id = 'inmuebles' and public.puede_editar_inmueble(public.uuid_o_nulo((storage.foldername(name))[1])));
create policy "inmuebles: borrar fotos" on storage.objects for delete to authenticated
  using (bucket_id = 'inmuebles' and public.puede_editar_inmueble(public.uuid_o_nulo((storage.foldername(name))[1])));
create policy "contratos: leer" on storage.objects for select to authenticated
  using (bucket_id = 'contratos' and public.puede_editar_inmueble(public.uuid_o_nulo((storage.foldername(name))[1])));
create policy "contratos: subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'contratos' and public.puede_editar_inmueble(public.uuid_o_nulo((storage.foldername(name))[1])));

-- RLS
alter table public.calificacion_propietario enable row level security;
alter table public.inmuebles enable row level security;
alter table public.inmueble_fotos enable row level security;
alter table public.contratos enable row level security;
alter table public.citas enable row level security;

create policy calificacion_leer on public.calificacion_propietario for select to authenticated
  using (public.puede_ver_lead(lead_id));
create policy calificacion_crear on public.calificacion_propietario for insert to authenticated
  with check (public.puede_ver_lead(lead_id));
create policy calificacion_editar on public.calificacion_propietario for update to authenticated
  using (public.puede_ver_lead(lead_id)) with check (public.puede_ver_lead(lead_id));

create policy inmuebles_leer on public.inmuebles for select to authenticated
  using (public.es_usuario_activo());
create policy inmuebles_editar on public.inmuebles for update to authenticated
  using (public.puede_editar_inmueble(id)) with check (public.puede_editar_inmueble(id));

create policy fotos_leer on public.inmueble_fotos for select to authenticated
  using (public.es_usuario_activo());
create policy fotos_crear on public.inmueble_fotos for insert to authenticated
  with check (public.puede_editar_inmueble(inmueble_id));
create policy fotos_editar on public.inmueble_fotos for update to authenticated
  using (public.puede_editar_inmueble(inmueble_id)) with check (public.puede_editar_inmueble(inmueble_id));
create policy fotos_borrar on public.inmueble_fotos for delete to authenticated
  using (public.puede_editar_inmueble(inmueble_id));

create policy contratos_leer on public.contratos for select to authenticated
  using (public.es_usuario_activo());

create policy citas_leer on public.citas for select to authenticated
  using (public.puede_ver_lead(lead_id) or (asesor_id = auth.uid() and public.es_usuario_activo()));
create policy citas_editar on public.citas for update to authenticated
  using (public.puede_ver_cita(id)) with check (public.puede_ver_cita(id));

revoke all on public.calificacion_propietario, public.inmuebles, public.inmueble_fotos, public.contratos,
  public.citas, public.v_inmuebles from anon, authenticated;
grant select on public.calificacion_propietario, public.inmuebles, public.inmueble_fotos, public.contratos,
  public.citas, public.v_inmuebles to authenticated;
grant insert, update on public.calificacion_propietario to authenticated;
grant insert, update (orden), delete on public.inmueble_fotos to authenticated;
grant update (tipo, direccion, distrito, referencia, metraje, dormitorios, banos, cocheras, ascensor, mascotas,
  caracteristicas, precio_esperado, precio, conservacion, descripcion, acceso_llave, acceso_codigo, acceso_dni,
  acceso_otros) on public.inmuebles to authenticated;
grant update (notas, duracion_min, direccion, distrito, acceso_llave, acceso_codigo, acceso_dni, acceso_otros)
  on public.citas to authenticated;
grant all on public.calificacion_propietario, public.inmuebles, public.inmueble_fotos, public.contratos,
  public.citas, public.v_inmuebles to service_role;
grant select on public.v_bandeja to authenticated;

revoke execute on function public.notificar_cita(uuid, text) from public, anon, authenticated;
