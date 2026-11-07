-- Fase 4: interesados y match (HU-19 a HU-27)

create type public.nivel_financiero as enum ('no_validada', 'declarada', 'precalificada', 'aprobada');
create type public.respuesta_match as enum ('me_interesa', 'no_me_interesa', 'ver_parecidos');

-- HU-19: perfil de búsqueda (Módulo 2.2)
create table public.busquedas (
  lead_id uuid primary key references public.leads (id) on delete cascade,
  finalidad text check (finalidad in ('vivir', 'invertir')),
  distritos text[] not null default '{}',
  tipos text[] not null default '{}',
  precio_min numeric(14, 2),
  precio_max numeric(14, 2),
  dormitorios_min int,
  metraje_min numeric(10, 2),
  imprescindibles text[] not null default '{}',
  notas text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.perfiles (id) default auth.uid(),
  check (precio_min is null or precio_max is null or precio_min <= precio_max)
);

create trigger busquedas_autor before update on public.busquedas
  for each row execute function public.tocar_autor();

-- HU-20: capacidad financiera (Módulo 2.3)
create table public.capacidad_financiera (
  lead_id uuid primary key references public.leads (id) on delete cascade,
  presupuesto_max numeric(14, 2),
  forma_pago text check (forma_pago in ('contado', 'credito', 'mixto')),
  cuota_inicial numeric(14, 2),
  precalificacion boolean not null default false,
  mivivienda boolean not null default false,
  techo_propio boolean not null default false,
  nivel public.nivel_financiero not null default 'no_validada',
  nivel_at timestamptz,
  notas text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.perfiles (id) default auth.uid()
);

create or replace function public.capacidad_antes_de_guardar() returns trigger
language plpgsql as $$
begin
  -- "Declarada": indicó presupuesto y forma de pago
  if new.nivel = 'no_validada' and new.presupuesto_max is not null and new.forma_pago is not null then
    new.nivel := 'declarada';
  end if;
  if tg_op = 'INSERT' or new.nivel is distinct from old.nivel then
    new.nivel_at := now();
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;

create trigger capacidad_antes before insert or update on public.capacidad_financiera
  for each row execute function public.capacidad_antes_de_guardar();

-- Con perfil y capacidad declarada, el interesado queda Calificado
create or replace function public.revisar_calificacion(p_lead_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.busquedas where lead_id = p_lead_id)
     and exists (select 1 from public.capacidad_financiera where lead_id = p_lead_id and nivel >= 'declarada') then
    perform public.avanzar_estado(p_lead_id, 'calificado', 'Perfil y capacidad registrados');
  end if;
end $$;

create or replace function public.capacidad_despues_de_guardar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.nivel is distinct from old.nivel then
    perform public.registrar_evento('nivel_financiero', new.lead_id, jsonb_build_object(
      'de', case when tg_op = 'UPDATE' then old.nivel end, 'a', new.nivel,
      'forma_pago', new.forma_pago, 'presupuesto_max', new.presupuesto_max));
  end if;
  perform public.revisar_calificacion(new.lead_id);
  return null;
end $$;

create trigger capacidad_despues after insert or update on public.capacidad_financiera
  for each row execute function public.capacidad_despues_de_guardar();

create or replace function public.busqueda_despues_de_guardar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.registrar_evento('perfil_busqueda', new.lead_id, to_jsonb(new) - 'lead_id' - 'updated_by');
  perform public.revisar_calificacion(new.lead_id);
  return null;
end $$;

create trigger busqueda_despues after insert or update on public.busquedas
  for each row execute function public.busqueda_despues_de_guardar();

create or replace function public.nivel_lead(p_lead_id uuid) returns public.nivel_financiero
language sql stable security definer set search_path = public as $$
  select coalesce((select nivel from public.capacidad_financiera where lead_id = p_lead_id), 'no_validada');
$$;

create or replace function public.exigir_nivel(p_lead_id uuid, p_paso text) returns void
language plpgsql stable security definer set search_path = public as $$
declare
  v_exigido public.nivel_financiero := public.param_texto(p_paso)::public.nivel_financiero;
  v_actual public.nivel_financiero := public.nivel_lead(p_lead_id);
begin
  if v_actual < v_exigido then
    raise exception 'El nivel financiero del interesado es "%" y para % se exige "%"',
      replace(v_actual::text, '_', ' '),
      case p_paso when 'nivel_visita' then 'agendar la visita' else 'iniciar la compraventa' end,
      replace(v_exigido::text, '_', ' ');
  end if;
end $$;

-- HU-21: derivación a banco o bróker
create table public.derivaciones (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  entidad text not null,
  tipo_entidad text not null check (tipo_entidad in ('banco', 'broker')),
  estado text not null default 'derivado' check (estado in ('derivado', 'en_evaluacion', 'precalificado', 'aprobado', 'rechazado', 'desistio')),
  derivado_el date not null default public.hoy_lima(),
  respuesta_el date,
  notas text,
  created_at timestamptz not null default now(),
  created_by uuid references public.perfiles (id) default auth.uid(),
  updated_at timestamptz not null default now()
);

create trigger derivaciones_updated_at before update on public.derivaciones
  for each row execute function public.tocar_updated_at();

create or replace function public.derivacion_despues_de_guardar() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_nivel public.nivel_financiero;
begin
  if tg_op = 'UPDATE' and new.estado is not distinct from old.estado then
    return null;
  end if;
  perform public.registrar_evento('derivacion', new.lead_id, jsonb_build_object(
    'derivacion_id', new.id, 'entidad', new.entidad, 'tipo', new.tipo_entidad, 'estado', new.estado));
  v_nivel := case new.estado when 'precalificado' then 'precalificada' when 'aprobado' then 'aprobada' end;
  if v_nivel is not null then
    insert into public.capacidad_financiera (lead_id, nivel, precalificacion)
    values (new.lead_id, v_nivel, true)
    on conflict (lead_id) do update
    set nivel = greatest(public.capacidad_financiera.nivel, excluded.nivel), precalificacion = true;
  end if;
  return null;
end $$;

create trigger derivaciones_despues after insert or update on public.derivaciones
  for each row execute function public.derivacion_despues_de_guardar();

-- HU-22 y HU-23: envíos de match y respuestas
create table public.match_envios (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  tipo text not null default 'match' check (tipo in ('match', 'novedad')),
  mensaje_id uuid references public.mensajes (id),
  enviado_at timestamptz not null default now(),
  enviado_por uuid references public.perfiles (id) default auth.uid()
);

create table public.match_opciones (
  id uuid primary key default gen_random_uuid(),
  envio_id uuid not null references public.match_envios (id) on delete cascade,
  lead_id uuid not null references public.leads (id) on delete cascade,
  inmueble_id uuid not null references public.inmuebles (id),
  puntaje numeric(5, 1),
  detalle jsonb not null default '{}',
  respuesta public.respuesta_match,
  respondido_at timestamptz,
  respuesta_por uuid references public.perfiles (id),
  unique (envio_id, inmueble_id)
);

create index match_opciones_lead_idx on public.match_opciones (lead_id, inmueble_id);
create index match_opciones_inmueble_idx on public.match_opciones (inmueble_id);

-- Puntaje de ajuste entre un interesado y un inmueble (0 a 100) y motivo de exclusión, si lo hay
create or replace function public.calcular_match(p_lead_id uuid, p_inmueble_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  b public.busquedas%rowtype;
  c public.capacidad_financiera%rowtype;
  i public.inmuebles%rowtype;
  v_zona numeric;
  v_precio numeric;
  v_dorm numeric;
  v_metraje numeric;
  v_impr numeric;
  v_feedback numeric := 0;
  v_req int;
  v_ok int := 0;
  v_item text;
  v_excluido text;
begin
  select * into b from public.busquedas where lead_id = p_lead_id;
  select * into c from public.capacidad_financiera where lead_id = p_lead_id;
  select * into i from public.inmuebles where id = p_inmueble_id;

  if i.estado is distinct from 'en_cartera' then
    v_excluido := 'no_disponible';
  elsif c.presupuesto_max is not null and i.precio > c.presupuesto_max then
    v_excluido := 'fuera_de_capacidad';
  elsif coalesce(cardinality(b.tipos), 0) > 0 and not (i.tipo = any (b.tipos)) then
    v_excluido := 'otro_tipo';
  elsif exists (
    select 1 from public.match_opciones
    where lead_id = p_lead_id and inmueble_id = p_inmueble_id and respuesta = 'no_me_interesa'
  ) then
    v_excluido := 'rechazado';
  end if;

  v_zona := case
    when coalesce(cardinality(b.distritos), 0) = 0 then 30
    when lower(i.distrito) in (select lower(x) from unnest(b.distritos) x) then 30
    else 0
  end;
  v_precio := case
    when i.precio is null then 0
    when b.precio_min is null and b.precio_max is null then 25
    when (b.precio_min is null or i.precio >= b.precio_min) and (b.precio_max is null or i.precio <= b.precio_max) then 25
    when b.precio_min is not null and i.precio < b.precio_min then 15
    when b.precio_max is not null and i.precio <= b.precio_max * 1.1 then 12.5
    else 0
  end;
  v_dorm := case
    when b.dormitorios_min is null then 15
    when i.dormitorios >= b.dormitorios_min then 15
    when i.dormitorios = b.dormitorios_min - 1 then 5
    else 0
  end;
  v_metraje := case
    when b.metraje_min is null then 10
    when i.metraje >= b.metraje_min then 10
    when i.metraje >= b.metraje_min * 0.9 then 5
    else 0
  end;
  v_req := coalesce(cardinality(b.imprescindibles), 0);
  if v_req = 0 then
    v_impr := 20;
  else
    foreach v_item in array b.imprescindibles loop
      if (v_item = 'cochera' and i.cocheras > 0)
         or (v_item = 'ascensor' and i.ascensor)
         or (v_item = 'mascotas' and i.mascotas)
         or lower(v_item) in (select lower(x) from unnest(i.caracteristicas) x) then
        v_ok := v_ok + 1;
      end if;
    end loop;
    v_impr := round(20.0 * v_ok / v_req, 1);
  end if;

  -- Las respuestas previas ajustan el cruce
  if exists (
    select 1 from public.match_opciones mo join public.inmuebles o on o.id = mo.inmueble_id
    where mo.lead_id = p_lead_id and mo.inmueble_id <> i.id and mo.respuesta in ('me_interesa', 'ver_parecidos')
      and lower(o.distrito) = lower(i.distrito) and o.tipo = i.tipo
  ) then
    v_feedback := v_feedback + 5;
  end if;
  if exists (
    select 1 from public.match_opciones mo join public.inmuebles o on o.id = mo.inmueble_id
    where mo.lead_id = p_lead_id and mo.inmueble_id <> i.id and mo.respuesta = 'no_me_interesa'
      and lower(o.distrito) = lower(i.distrito) and o.tipo = i.tipo
  ) then
    v_feedback := v_feedback - 5;
  end if;

  return jsonb_build_object(
    'puntaje', greatest(0, least(100, v_zona + v_precio + v_dorm + v_metraje + v_impr + v_feedback)),
    'zona', v_zona, 'precio', v_precio, 'dormitorios', v_dorm, 'metraje', v_metraje,
    'imprescindibles', v_impr, 'ajuste_respuestas', v_feedback, 'excluido', v_excluido
  );
end $$;

-- HU-22: inmuebles que hacen match, ordenados por ajuste
create or replace function public.sugerir_matches(p_lead_id uuid)
returns table (
  inmueble_id uuid, codigo text, tipo text, distrito text, precio numeric, dormitorios int,
  metraje numeric, puntaje numeric, detalle jsonb, ultimo_envio_at timestamptz, ultima_respuesta public.respuesta_match
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.puede_ver_lead(p_lead_id) then
    raise exception 'No tienes acceso a este lead' using errcode = '42501';
  end if;
  return query
  select i.id, i.codigo, i.tipo, i.distrito, i.precio, i.dormitorios, i.metraje,
         (m ->> 'puntaje')::numeric, m, u.enviado_at, u.respuesta
  from public.inmuebles i
  cross join lateral public.calcular_match(p_lead_id, i.id) m
  left join lateral (
    select e.enviado_at, mo.respuesta
    from public.match_opciones mo join public.match_envios e on e.id = mo.envio_id
    where mo.lead_id = p_lead_id and mo.inmueble_id = i.id
    order by e.enviado_at desc limit 1
  ) u on true
  where i.estado = 'en_cartera' and m ->> 'excluido' is null
  order by (m ->> 'puntaje')::numeric desc, i.en_cartera_at desc;
end $$;

-- Validación previa a un envío (se usa antes de mandar el WhatsApp y otra vez al registrarlo)
create or replace function public.validar_envio_match(p_lead_id uuid, p_tipo text, p_cantidad int) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  l public.leads%rowtype;
  v_max int := coalesce(public.param_int('match_max_opciones'), 3);
  v_tope int := coalesce(public.param_int('novedades_tope_dias'), 7);
begin
  if not public.puede_ver_lead(p_lead_id) then
    return 'No tienes acceso a este lead';
  end if;
  select * into l from public.leads where id = p_lead_id;
  if l.tipo <> 'interesado' then
    return 'Los matches se envían a interesados';
  end if;
  if l.estado = 'baja' or exists (select 1 from public.personas where id = l.persona_id and no_contactar) then
    return 'El lead está en Baja: no recibe mensajes';
  end if;
  if p_cantidad < 1 or p_cantidad > v_max then
    return 'Elige entre 1 y ' || v_max || ' inmuebles por envío';
  end if;
  if p_tipo = 'novedad' then
    if not l.recibe_novedades then
      return 'El interesado pidió no recibir novedades';
    end if;
    if l.ultimas_novedades_at is not null and l.ultimas_novedades_at > now() - make_interval(days => v_tope) then
      return 'Ya recibió una novedad el ' || to_char(l.ultimas_novedades_at at time zone 'America/Lima', 'DD/MM')
        || '; el tope es una cada ' || v_tope || ' días';
    end if;
  end if;
  return null;
end $$;

create or replace function public.registrar_envio_match(
  p_lead_id uuid, p_inmuebles uuid[], p_tipo text default 'match', p_mensaje_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_error text := public.validar_envio_match(p_lead_id, p_tipo, coalesce(cardinality(p_inmuebles), 0));
  v_envio uuid;
  v_inmueble uuid;
  v_match jsonb;
begin
  if v_error is not null then
    raise exception '%', v_error;
  end if;
  insert into public.match_envios (lead_id, tipo, mensaje_id) values (p_lead_id, p_tipo, p_mensaje_id)
  returning id into v_envio;
  foreach v_inmueble in array p_inmuebles loop
    if not exists (select 1 from public.inmuebles where id = v_inmueble and estado = 'en_cartera') then
      raise exception 'Uno de los inmuebles ya no está en cartera';
    end if;
    v_match := public.calcular_match(p_lead_id, v_inmueble);
    insert into public.match_opciones (envio_id, lead_id, inmueble_id, puntaje, detalle)
    values (v_envio, p_lead_id, v_inmueble, (v_match ->> 'puntaje')::numeric, v_match);
    perform public.registrar_evento('match_opcion_enviada', p_lead_id,
      jsonb_build_object('envio_id', v_envio, 'tipo', p_tipo, 'puntaje', v_match -> 'puntaje'), v_inmueble);
  end loop;
  if p_tipo = 'novedad' then
    update public.leads set ultimas_novedades_at = now() where id = p_lead_id;
  end if;
  perform public.avanzar_estado(p_lead_id, 'match_enviado',
    case when p_tipo = 'novedad' then 'Novedad enviada' else 'Matches enviados' end);
  return v_envio;
end $$;

create or replace function public.registrar_respuesta_match(p_opcion_id uuid, p_respuesta public.respuesta_match) returns void
language plpgsql security definer set search_path = public as $$
declare
  o public.match_opciones%rowtype;
begin
  select * into o from public.match_opciones where id = p_opcion_id for update;
  if not found or not public.puede_ver_lead(o.lead_id) then
    raise exception 'No tienes acceso a esta opción' using errcode = '42501';
  end if;
  update public.match_opciones
  set respuesta = p_respuesta, respondido_at = now(), respuesta_por = auth.uid()
  where id = p_opcion_id;
  perform public.marcar_respuesta_lead(o.lead_id);
  perform public.registrar_evento('match_respuesta', o.lead_id,
    jsonb_build_object('opcion_id', o.id, 'envio_id', o.envio_id, 'respuesta', p_respuesta, 'puntaje', o.puntaje),
    o.inmueble_id);
end $$;

-- HU-24: interesados activos a los que les encaja un inmueble (para la novedad)
create or replace function public.interesados_para_inmueble(p_inmueble_id uuid, p_minimo numeric default 50)
returns table (
  lead_id uuid, nombre text, telefono text, estado public.estado_lead, puntaje numeric, detalle jsonb,
  puede_recibir boolean, motivo text
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_usuario_activo() then
    raise exception 'Usuario no autorizado' using errcode = '42501';
  end if;
  return query
  select l.id, p.nombre, p.telefono, l.estado, (m ->> 'puntaje')::numeric, m,
         public.validar_envio_match(l.id, 'novedad', 1) is null,
         public.validar_envio_match(l.id, 'novedad', 1)
  from public.leads l
  join public.personas p on p.id = l.persona_id
  cross join lateral public.calcular_match(l.id, p_inmueble_id) m
  where l.tipo = 'interesado' and l.vigente
    and l.estado in ('en_conversacion', 'calificado', 'match_enviado', 'visita_agendada', 'visita_realizada')
    and not p.no_contactar
    and public.puede_ver_lead(l.id)
    and m ->> 'excluido' is null
    and (m ->> 'puntaje')::numeric >= p_minimo
    and not exists (select 1 from public.match_opciones mo where mo.lead_id = l.id and mo.inmueble_id = p_inmueble_id)
  order by (m ->> 'puntaje')::numeric desc;
end $$;

-- Inmuebles nuevos en la base (últimos 30 días) con interesados a los que se les puede enviar la novedad
create or replace function public.novedades_pendientes()
returns table (inmueble_id uuid, codigo text, distrito text, tipo text, interesados int)
language plpgsql stable security definer set search_path = public as $$
begin
  return query
  select i.id, i.codigo, i.distrito, i.tipo, count(x.lead_id)::int
  from public.inmuebles i
  cross join lateral public.interesados_para_inmueble(i.id) x
  where i.estado = 'en_cartera' and i.en_cartera_at > now() - interval '30 days' and x.puede_recibir
  group by i.id, i.codigo, i.distrito, i.tipo
  order by max(i.en_cartera_at) desc;
end $$;

-- HU-25: priorización entre los inmuebles que le interesan
create or replace function public.priorizar_interes(p_lead_id uuid)
returns table (
  inmueble_id uuid, codigo text, distrito text, precio numeric, ajuste numeric, factor_precio numeric,
  disponibilidad numeric, prioridad numeric, visita_programada boolean
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_presupuesto numeric := (select presupuesto_max from public.capacidad_financiera where lead_id = p_lead_id);
begin
  if not public.puede_ver_lead(p_lead_id) then
    raise exception 'No tienes acceso a este lead' using errcode = '42501';
  end if;
  return query
  with interes as (
    select distinct on (mo.inmueble_id) mo.inmueble_id, mo.respuesta
    from public.match_opciones mo
    where mo.lead_id = p_lead_id and mo.respuesta is not null
    order by mo.inmueble_id, mo.respondido_at desc
  ), base as (
    select i.id, i.codigo, i.distrito, i.precio,
      ((public.calcular_match(p_lead_id, i.id)) ->> 'puntaje')::numeric as ajuste,
      case
        when v_presupuesto is null or v_presupuesto <= 0 or i.precio is null then 0.5
        when i.precio > v_presupuesto then 0
        else round(0.5 + 0.5 * (v_presupuesto - i.precio) / v_presupuesto, 2)
      end as factor_precio,
      case when coalesce(i.acceso_llave, i.acceso_codigo) is not null then 1.0 else 0.5 end as disponibilidad,
      exists (
        select 1 from public.citas c
        where c.lead_id = p_lead_id and c.inmueble_id = i.id and c.estado = 'programada'
      ) as visita_programada
    from interes t join public.inmuebles i on i.id = t.inmueble_id
    where t.respuesta = 'me_interesa' and i.estado = 'en_cartera'
  )
  select b.id, b.codigo, b.distrito, b.precio, b.ajuste, b.factor_precio, b.disponibilidad,
         round(0.5 * b.ajuste / 100 + 0.3 * b.factor_precio + 0.2 * b.disponibilidad, 3),
         b.visita_programada
  from base b
  order by 8 desc;
end $$;

-- HU-26: visita con los datos de acceso del inmueble
create or replace function public.agendar_visita(
  p_lead_id uuid, p_inmueble_id uuid, p_inicio timestamptz, p_duracion_min int default 45, p_notas text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  l public.leads%rowtype;
  i public.inmuebles%rowtype;
  v_id uuid;
begin
  if not public.puede_ver_lead(p_lead_id) then
    raise exception 'No tienes acceso a este lead' using errcode = '42501';
  end if;
  select * into l from public.leads where id = p_lead_id for update;
  if l.tipo <> 'interesado' then
    raise exception 'Las visitas son de interesados';
  end if;
  if l.estado = 'baja' or not l.vigente then
    raise exception 'El lead no está activo';
  end if;
  perform public.exigir_nivel(p_lead_id, 'nivel_visita');
  select * into i from public.inmuebles where id = p_inmueble_id;
  if i.estado is distinct from 'en_cartera' then
    raise exception 'El inmueble no está en cartera';
  end if;
  insert into public.citas (
    tipo, lead_id, inmueble_id, asesor_id, inicio, duracion_min, direccion, distrito,
    acceso_llave, acceso_codigo, acceso_dni, acceso_otros, estado_lead_previo, notas
  ) values (
    'visita', p_lead_id, p_inmueble_id, coalesce(l.asesor_id, auth.uid()), p_inicio, coalesce(p_duracion_min, 45),
    i.direccion, i.distrito, i.acceso_llave, i.acceso_codigo, i.acceso_dni, i.acceso_otros, l.estado, p_notas
  ) returning id into v_id;
  perform public.avanzar_estado(p_lead_id, 'visita_agendada', 'Visita a ' || i.codigo);
  update public.leads set ultima_interaccion_at = now() where id = p_lead_id;
  perform public.registrar_evento('visita_agendada', p_lead_id,
    jsonb_build_object('cita_id', v_id, 'inicio', p_inicio), p_inmueble_id);
  perform public.notificar_cita(v_id, 'Visita agendada');
  return v_id;
end $$;

-- HU-27: opinión tras la visita
create table public.visita_opiniones (
  cita_id uuid primary key references public.citas (id) on delete cascade,
  lead_id uuid not null references public.leads (id),
  inmueble_id uuid not null references public.inmuebles (id),
  calificacion int check (calificacion between 1 and 5),
  interes text check (interes in ('alto', 'medio', 'bajo', 'ninguno')),
  le_gusto text,
  no_le_gusto text,
  comentario text,
  created_at timestamptz not null default now(),
  created_by uuid references public.perfiles (id) default auth.uid()
);

create index visita_opiniones_inmueble_idx on public.visita_opiniones (inmueble_id);

create or replace function public.marcar_visita_realizada(p_cita_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  c public.citas%rowtype;
begin
  if not public.puede_ver_cita(p_cita_id) then
    raise exception 'No tienes acceso a esta visita' using errcode = '42501';
  end if;
  select * into c from public.citas where id = p_cita_id for update;
  if c.tipo <> 'visita' then
    raise exception 'No es una visita';
  end if;
  if c.estado in ('cancelada', 'no_asistio') then
    raise exception 'La visita no se realizó';
  end if;
  if c.estado = 'programada' then
    update public.citas set estado = 'realizada', realizada_at = now() where id = p_cita_id;
    perform public.avanzar_estado(c.lead_id, 'visita_realizada', 'Visita realizada');
    perform public.registrar_evento('visita_realizada', c.lead_id, jsonb_build_object('cita_id', c.id), c.inmueble_id);
  end if;
end $$;

create or replace function public.registrar_opinion_visita(
  p_cita_id uuid, p_calificacion int, p_interes text, p_le_gusto text default null,
  p_no_le_gusto text default null, p_comentario text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  c public.citas%rowtype;
begin
  perform public.marcar_visita_realizada(p_cita_id);
  select * into c from public.citas where id = p_cita_id;
  insert into public.visita_opiniones (cita_id, lead_id, inmueble_id, calificacion, interes, le_gusto, no_le_gusto, comentario)
  values (p_cita_id, c.lead_id, c.inmueble_id, p_calificacion, p_interes, p_le_gusto, p_no_le_gusto, p_comentario)
  on conflict (cita_id) do update
  set calificacion = excluded.calificacion, interes = excluded.interes, le_gusto = excluded.le_gusto,
      no_le_gusto = excluded.no_le_gusto, comentario = excluded.comentario;
  perform public.registrar_evento('opinion_visita', c.lead_id,
    jsonb_build_object('cita_id', c.id, 'calificacion', p_calificacion, 'interes', p_interes), c.inmueble_id);
end $$;

-- Compraventa: se inicia con el nivel exigido (HU-20) y se cierra en la fase 7 (HU-31)
create table public.compraventas (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id),
  inmueble_id uuid not null references public.inmuebles (id),
  estado text not null default 'en_curso' check (estado in ('en_curso', 'cerrada', 'caida')),
  iniciada_at timestamptz not null default now(),
  iniciada_por uuid references public.perfiles (id) default auth.uid(),
  fecha_cierre date,
  precio_venta numeric(14, 2),
  comision_pagada numeric(14, 2),
  cerrada_por uuid references public.perfiles (id),
  motivo_caida text,
  notas text,
  updated_at timestamptz not null default now()
);

create unique index compraventas_una_cerrada on public.compraventas (inmueble_id) where estado = 'cerrada';

create trigger compraventas_updated_at before update on public.compraventas
  for each row execute function public.tocar_updated_at();

create or replace function public.iniciar_compraventa(p_lead_id uuid, p_inmueble_id uuid, p_notas text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  l public.leads%rowtype;
  v_id uuid;
begin
  if not public.puede_ver_lead(p_lead_id) then
    raise exception 'No tienes acceso a este lead' using errcode = '42501';
  end if;
  select * into l from public.leads where id = p_lead_id for update;
  if l.tipo <> 'interesado' or l.estado = 'baja' or not l.vigente then
    raise exception 'La compraventa se inicia con un interesado activo';
  end if;
  perform public.exigir_nivel(p_lead_id, 'nivel_compraventa');
  if not exists (select 1 from public.inmuebles where id = p_inmueble_id and estado = 'en_cartera') then
    raise exception 'El inmueble no está en cartera';
  end if;
  if exists (select 1 from public.compraventas where lead_id = p_lead_id and estado = 'en_curso') then
    raise exception 'El interesado ya tiene una compraventa en curso';
  end if;
  insert into public.compraventas (lead_id, inmueble_id, notas) values (p_lead_id, p_inmueble_id, p_notas)
  returning id into v_id;
  perform public.avanzar_estado(p_lead_id, 'compraventa', 'Compraventa iniciada');
  perform public.registrar_evento('compraventa_iniciada', p_lead_id, jsonb_build_object('compraventa_id', v_id), p_inmueble_id);
  return v_id;
end $$;

-- RLS
alter table public.busquedas enable row level security;
alter table public.capacidad_financiera enable row level security;
alter table public.derivaciones enable row level security;
alter table public.match_envios enable row level security;
alter table public.match_opciones enable row level security;
alter table public.visita_opiniones enable row level security;
alter table public.compraventas enable row level security;

create policy busquedas_leer on public.busquedas for select to authenticated using (public.puede_ver_lead(lead_id));
create policy busquedas_crear on public.busquedas for insert to authenticated with check (public.puede_ver_lead(lead_id));
create policy busquedas_editar on public.busquedas for update to authenticated
  using (public.puede_ver_lead(lead_id)) with check (public.puede_ver_lead(lead_id));

create policy capacidad_leer on public.capacidad_financiera for select to authenticated using (public.puede_ver_lead(lead_id));
create policy capacidad_crear on public.capacidad_financiera for insert to authenticated with check (public.puede_ver_lead(lead_id));
create policy capacidad_editar on public.capacidad_financiera for update to authenticated
  using (public.puede_ver_lead(lead_id)) with check (public.puede_ver_lead(lead_id));

create policy derivaciones_leer on public.derivaciones for select to authenticated using (public.puede_ver_lead(lead_id));
create policy derivaciones_crear on public.derivaciones for insert to authenticated with check (public.puede_ver_lead(lead_id));
create policy derivaciones_editar on public.derivaciones for update to authenticated
  using (public.puede_ver_lead(lead_id)) with check (public.puede_ver_lead(lead_id));

create policy match_envios_leer on public.match_envios for select to authenticated
  using (public.puede_ver_lead(lead_id) or public.es_admin());
create policy match_opciones_leer on public.match_opciones for select to authenticated
  using (public.puede_ver_lead(lead_id) or public.puede_editar_inmueble(inmueble_id));

create policy opiniones_leer on public.visita_opiniones for select to authenticated
  using (public.puede_ver_lead(lead_id) or public.puede_editar_inmueble(inmueble_id));

create policy compraventas_leer on public.compraventas for select to authenticated
  using (public.puede_ver_lead(lead_id) or public.puede_editar_inmueble(inmueble_id));

revoke all on public.busquedas, public.capacidad_financiera, public.derivaciones, public.match_envios,
  public.match_opciones, public.visita_opiniones, public.compraventas from anon, authenticated;
grant select on public.busquedas, public.capacidad_financiera, public.derivaciones, public.match_envios,
  public.match_opciones, public.visita_opiniones, public.compraventas to authenticated;
grant insert, update on public.busquedas, public.capacidad_financiera to authenticated;
grant insert on public.derivaciones to authenticated;
grant update (estado, respuesta_el, notas, entidad, tipo_entidad) on public.derivaciones to authenticated;
grant all on public.busquedas, public.capacidad_financiera, public.derivaciones, public.match_envios,
  public.match_opciones, public.visita_opiniones, public.compraventas to service_role;

revoke execute on function public.revisar_calificacion(uuid) from public, anon, authenticated;
