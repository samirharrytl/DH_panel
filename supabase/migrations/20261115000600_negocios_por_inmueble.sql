-- Negocios por inmueble y búsqueda: el inmueble es la unidad de captación del propietario, el interesado
-- tiene varias búsquedas, Cliente deja de ser un estado final y Contactos centraliza los datos comunes.
-- Diseño: docs/superpowers/specs/2026-11-15-negocios-por-inmueble-y-busqueda-design.md

-- ---------- Inmueble en captación ----------
-- Tipo, dirección y distrito pueden quedar vacíos mientras el inmueble está en captación; se exigen al salir
alter table public.inmuebles
  alter column tipo drop not null,
  alter column direccion drop not null,
  alter column distrito drop not null,
  add column etapa_captacion text check (etapa_captacion in ('calificando', 'cita_agendada', 'cita_realizada')),
  add constraint inmuebles_datos_fuera_de_captacion
    check (estado = 'en_captacion' or (tipo is not null and direccion is not null and distrito is not null));

-- La etapa solo existe en captación; al entrar empieza en "calificando"
create function public.inmuebles_etapa() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.estado <> 'en_captacion' then
    new.etapa_captacion := null;
  elsif new.etapa_captacion is null then
    new.etapa_captacion := 'calificando';
  end if;
  return new;
end $$;
create trigger inmuebles_etapa before insert or update on public.inmuebles
  for each row execute function public.inmuebles_etapa();

-- Cada cambio de etapa deja su evento, con fecha y autor
create function public.inmuebles_etapa_evento() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.registrar_evento('etapa_inmueble', new.propietario_lead_id,
    jsonb_build_object('de', old.etapa_captacion, 'a', new.etapa_captacion), new.id, new.persona_id);
  return null;
end $$;
create trigger inmuebles_etapa_evento after update on public.inmuebles
  for each row
  when (old.etapa_captacion is not null and new.etapa_captacion is not null
        and old.etapa_captacion is distinct from new.etapa_captacion)
  execute function public.inmuebles_etapa_evento();
revoke all on function public.inmuebles_etapa(), public.inmuebles_etapa_evento() from public, anon, authenticated;

-- Todo inmueble con propietario nace con su ficha de captación (la crea la base, no cada función)
create function public.inmuebles_captacion_inicial() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.inmueble_captacion (inmueble_id) values (new.id) on conflict do nothing;
  return null;
end $$;

-- v_inmuebles usa i.*: se vuelve a crear para que incluya la etapa
drop view public.v_inmuebles;
create view public.v_inmuebles with (security_invoker = true) as
select
  i.*,
  pe.nombre as propietario_nombre,
  a.nombre as asesor_nombre,
  (select f.ruta from public.inmueble_fotos f where f.inmueble_id = i.id order by f.orden, f.created_at limit 1) as foto_portada,
  k.vence_el as contrato_vence_el,
  k.id as contrato_id,
  (select count(*)::int from public.leads l where l.inmueble_interes_id = i.id) as leads_interesados,
  (select count(*)::int from public.match_opciones mo where mo.inmueble_id = i.id) as veces_match,
  (select count(*)::int from public.match_opciones mo where mo.inmueble_id = i.id and mo.respuesta = 'me_interesa') as me_interesa,
  (select count(*)::int from public.citas c where c.inmueble_id = i.id and c.tipo = 'visita' and c.estado = 'realizada') as visitas_realizadas
from public.inmuebles i
left join public.personas pe on pe.id = i.persona_id
left join public.perfiles a on a.id = i.asesor_id
left join public.contratos k on k.inmueble_id = i.id and k.estado = 'vigente';
revoke all on public.v_inmuebles from anon, authenticated;
grant select on public.v_inmuebles to authenticated;
grant all on public.v_inmuebles to service_role;

-- Datos sensibles de la captación: los ve solo el administrador y el asesor del lead (como la calificación)
create table public.inmueble_captacion (
  inmueble_id uuid primary key references public.inmuebles (id) on delete cascade,
  rol_contacto text check (rol_contacto in ('propietario', 'encargado')),
  tiene_poder boolean,
  hipoteca boolean,
  hipoteca_banco text,
  hipoteca_saldo numeric(14, 2),
  urgencia text check (urgencia in ('inmediata', 'menos_3_meses', '3_a_6_meses', 'mas_6_meses', 'sin_apuro')),
  inscrito_sunarp boolean,
  copropietarios boolean,
  copropietarios_detalle text,
  notas text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.perfiles (id) default auth.uid()
);
create trigger inmueble_captacion_autor before update on public.inmueble_captacion
  for each row execute function public.tocar_autor();

create trigger inmuebles_captacion_inicial after insert on public.inmuebles
  for each row when (new.propietario_lead_id is not null)
  execute function public.inmuebles_captacion_inicial();
revoke all on function public.inmuebles_captacion_inicial() from public, anon, authenticated;

create function public.puede_ver_captacion(p_inmueble_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.es_admin() or exists (
    select 1 from public.inmuebles i
    where i.id = p_inmueble_id and i.propietario_lead_id is not null and public.puede_ver_lead(i.propietario_lead_id)
  );
$$;

alter table public.inmueble_captacion enable row level security;
create policy captacion_leer on public.inmueble_captacion for select to authenticated
  using (public.puede_ver_captacion(inmueble_id));
create policy captacion_crear on public.inmueble_captacion for insert to authenticated
  with check (public.puede_ver_captacion(inmueble_id));
create policy captacion_editar on public.inmueble_captacion for update to authenticated
  using (public.puede_ver_captacion(inmueble_id)) with check (public.puede_ver_captacion(inmueble_id));
revoke all on public.inmueble_captacion from anon, authenticated;
grant select, insert, update on public.inmueble_captacion to authenticated;
grant all on public.inmueble_captacion to service_role;
revoke all on function public.puede_ver_captacion(uuid) from public, anon;
grant execute on function public.puede_ver_captacion(uuid) to authenticated;

-- El asesor agrega inmuebles al propietario; nace en captación, etapa "calificando"
create function public.agregar_inmueble(
  p_lead_id uuid,
  p_tipo text default null,
  p_direccion text default null,
  p_distrito text default null,
  p_precio_esperado numeric default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  l public.leads%rowtype;
  v_id uuid;
begin
  if not public.puede_ver_lead(p_lead_id) then
    raise exception 'No tienes acceso a este lead' using errcode = '42501';
  end if;
  select * into l from public.leads where id = p_lead_id for update;
  if l.tipo <> 'propietario' then
    raise exception 'Solo los propietarios tienen inmuebles';
  end if;
  if l.estado = 'baja' then
    raise exception 'El lead está en Baja';
  end if;
  if not l.vigente then
    raise exception 'Este lead es de un ciclo anterior';
  end if;
  insert into public.inmuebles (propietario_lead_id, persona_id, asesor_id, tipo, direccion, distrito, precio_esperado)
  values (p_lead_id, l.persona_id, coalesce(l.asesor_id, auth.uid()), nullif(trim(p_tipo), ''),
          nullif(trim(p_direccion), ''), nullif(trim(p_distrito), ''), p_precio_esperado)
  returning id into v_id;
  update public.leads set ultima_interaccion_at = now() where id = p_lead_id;
  perform public.registrar_evento('inmueble_agregado', p_lead_id, '{}', v_id);
  return v_id;
end $$;
revoke all on function public.agregar_inmueble(uuid, text, text, text, numeric) from public, anon;
grant execute on function public.agregar_inmueble(uuid, text, text, text, numeric) to authenticated;

-- ---------- Citas por inmueble ----------
-- Firma nueva con p_inmueble_id al final. Con un solo inmueble en captación se usa ese; con varios hay que elegir.
drop function public.agendar_cita(uuid, timestamptz, text, text, int, text, text, boolean, text, text);
create function public.agendar_cita(
  p_lead_id uuid,
  p_inicio timestamptz,
  p_direccion text,
  p_distrito text default null,
  p_duracion_min int default 60,
  p_acceso_llave text default null,
  p_acceso_codigo text default null,
  p_acceso_dni boolean default false,
  p_acceso_otros text default null,
  p_notas text default null,
  p_inmueble_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  l public.leads%rowtype;
  v_id uuid;
  v_numero int;
  v_inmueble uuid;
  v_n int;
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
  if not l.vigente then
    raise exception 'Este lead es de un ciclo anterior';
  end if;
  if coalesce(trim(p_direccion), '') = '' then
    raise exception 'La dirección es obligatoria';
  end if;

  if p_inmueble_id is not null then
    select id into v_inmueble from public.inmuebles
    where id = p_inmueble_id and propietario_lead_id = p_lead_id and estado = 'en_captacion';
    if v_inmueble is null then
      raise exception 'El inmueble no es de este propietario o ya no está en captación';
    end if;
  else
    select count(*), (array_agg(id order by created_at desc))[1] into v_n, v_inmueble
    from public.inmuebles where propietario_lead_id = p_lead_id and estado = 'en_captacion';
    if v_n > 1 then
      raise exception 'Elige el inmueble de la cita';
    elsif v_n = 0 then
      raise exception 'Agrega primero el inmueble';
    end if;
  end if;

  select count(*) + 1 into v_numero from public.citas
  where inmueble_id = v_inmueble and tipo = 'cita_propietario' and estado in ('programada', 'realizada');

  insert into public.citas (
    tipo, lead_id, inmueble_id, asesor_id, inicio, duracion_min, direccion, distrito,
    acceso_llave, acceso_codigo, acceso_dni, acceso_otros, numero, estado_lead_previo, notas
  ) values (
    'cita_propietario', p_lead_id, v_inmueble, coalesce(l.asesor_id, auth.uid()), p_inicio,
    coalesce(p_duracion_min, 60), trim(p_direccion), nullif(trim(p_distrito), ''),
    nullif(trim(p_acceso_llave), ''), nullif(trim(p_acceso_codigo), ''), coalesce(p_acceso_dni, false),
    nullif(trim(p_acceso_otros), ''), v_numero, l.estado, p_notas
  ) returning id into v_id;

  update public.inmuebles set etapa_captacion = 'cita_agendada' where id = v_inmueble;
  perform public.avanzar_estado(p_lead_id, 'cita_agendada', 'Cita ' || v_numero || ' agendada');
  update public.leads set ultima_interaccion_at = now() where id = p_lead_id;
  perform public.registrar_evento('cita_agendada', p_lead_id,
    jsonb_build_object('cita_id', v_id, 'numero', v_numero, 'inicio', p_inicio), v_inmueble);
  perform public.notificar_cita(v_id, 'Cita agendada');
  return v_id;
end $$;
revoke all on function public.agendar_cita(uuid, timestamptz, text, text, int, text, text, boolean, text, text, uuid) from public, anon;
grant execute on function public.agendar_cita(uuid, timestamptz, text, text, int, text, text, boolean, text, text, uuid) to authenticated;

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

  if c.tipo = 'cita_propietario' and c.inmueble_id is not null
     and not exists (
       select 1 from public.citas
       where inmueble_id = c.inmueble_id and tipo = 'cita_propietario' and estado = 'programada') then
    update public.inmuebles
    set etapa_captacion = case when exists (
          select 1 from public.citas
          where inmueble_id = c.inmueble_id and tipo = 'cita_propietario' and estado = 'realizada')
        then 'cita_realizada' else 'calificando' end
    where id = c.inmueble_id and estado = 'en_captacion';
  end if;

  perform public.registrar_evento(
    case when c.tipo = 'visita' then 'visita_' else 'cita_' end || p_estado::text, c.lead_id,
    jsonb_build_object('cita_id', c.id, 'motivo', p_motivo), c.inmueble_id);
  perform public.notificar_cita(p_cita_id, case when c.tipo = 'visita' then 'Visita cancelada' else 'Cita cancelada' end);
end $$;

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
  v_inmueble := c.inmueble_id;
  if v_inmueble is null then
    raise exception 'La cita no tiene inmueble: agrega primero el inmueble y agéndala de nuevo';
  end if;

  -- Las consideraciones de acceso de la cita pasan al inmueble si este aún no las tiene
  update public.inmuebles
  set tipo = p_tipo, direccion = trim(p_direccion), distrito = trim(p_distrito), precio = p_precio,
      conservacion = p_conservacion, metraje = coalesce(p_metraje, metraje),
      dormitorios = coalesce(p_dormitorios, dormitorios), banos = coalesce(p_banos, banos),
      cocheras = coalesce(p_cocheras, cocheras), ascensor = coalesce(p_ascensor, ascensor),
      descripcion = coalesce(p_descripcion, descripcion),
      acceso_llave = coalesce(acceso_llave, c.acceso_llave), acceso_codigo = coalesce(acceso_codigo, c.acceso_codigo),
      acceso_dni = acceso_dni or c.acceso_dni, acceso_otros = coalesce(acceso_otros, c.acceso_otros),
      etapa_captacion = 'cita_realizada'
  where id = v_inmueble;

  update public.citas
  set estado = 'realizada', realizada_at = coalesce(realizada_at, now()), resultado = p_resultado, inmueble_id = v_inmueble
  where id = p_cita_id;
  perform public.avanzar_estado(c.lead_id, 'cita_realizada', 'Cita realizada');
  perform public.registrar_evento('cita_realizada', c.lead_id,
    jsonb_build_object('cita_id', c.id, 'precio', p_precio, 'conservacion', p_conservacion), v_inmueble);
  return v_inmueble;
end $$;

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
  if i.tipo is null or coalesce(i.direccion, '') = '' or coalesce(i.distrito, '') = '' then
    raise exception 'Completa el tipo, la dirección y el distrito del inmueble antes del contrato';
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


-- ---------- Datos existentes: cada calificación pasa a su inmueble ----------
-- 1) Todo inmueble con propietario tiene su ficha de captación (vacía si no hay calificación)
insert into public.inmueble_captacion (inmueble_id)
select id from public.inmuebles where propietario_lead_id is not null
on conflict do nothing;

-- 2) Lead con calificación y sin inmueble: se crea un inmueble en captación con esos datos
--    (el trigger le crea su ficha de captación)
with nuevos as (
  insert into public.inmuebles (
    propietario_lead_id, persona_id, asesor_id, tipo, direccion, distrito, metraje, dormitorios, banos,
    cocheras, precio_esperado, created_at
  )
  select q.lead_id, l.persona_id, l.asesor_id, q.tipo_inmueble, nullif(trim(q.direccion), ''),
         nullif(trim(q.distrito), ''), q.metraje, q.dormitorios, q.banos,
         case when q.cochera then 1 else 0 end, q.precio_esperado, l.created_at
  from public.calificacion_propietario q
  join public.leads l on l.id = q.lead_id
  where not exists (select 1 from public.inmuebles i where i.propietario_lead_id = q.lead_id)
  returning id, propietario_lead_id, persona_id
)
insert into public.eventos (tipo, lead_id, persona_id, inmueble_id, datos)
select 'inmueble_agregado', n.propietario_lead_id, n.persona_id, n.id, '{"origen": "migracion"}'::jsonb
from nuevos n;

-- 3) La calificación del lead va a su inmueble más reciente: lo sensible a la ficha de captación y lo
--    público al inmueble solo si el inmueble no lo tenía
with ultimo as (
  select distinct on (propietario_lead_id) id, propietario_lead_id
  from public.inmuebles
  where propietario_lead_id is not null
  order by propietario_lead_id, created_at desc
), pasa_captacion as (
  update public.inmueble_captacion ic
  set rol_contacto = q.rol_contacto, tiene_poder = q.tiene_poder, hipoteca = q.hipoteca,
      hipoteca_banco = q.hipoteca_banco, hipoteca_saldo = q.hipoteca_saldo, urgencia = q.urgencia,
      inscrito_sunarp = q.inscrito_sunarp, copropietarios = q.copropietarios,
      copropietarios_detalle = q.copropietarios_detalle, notas = q.notas
  from public.calificacion_propietario q
  join ultimo u on u.propietario_lead_id = q.lead_id
  where ic.inmueble_id = u.id
  returning u.id
)
update public.inmuebles i
set metraje = coalesce(i.metraje, q.metraje),
    dormitorios = coalesce(i.dormitorios, q.dormitorios),
    banos = coalesce(i.banos, q.banos),
    precio_esperado = coalesce(i.precio_esperado, q.precio_esperado),
    cocheras = case when i.cocheras = 0 and q.cochera then 1 else i.cocheras end
from public.calificacion_propietario q
join ultimo u on u.propietario_lead_id = q.lead_id
where i.id = u.id;

-- 4) Las citas de propietario sin inmueble pasan al único inmueble de su lead
update public.citas c
set inmueble_id = x.inmueble_id
from (
  select propietario_lead_id, (array_agg(id))[1] as inmueble_id
  from public.inmuebles
  where propietario_lead_id is not null
  group by propietario_lead_id
  having count(*) = 1
) x
where c.inmueble_id is null and c.tipo = 'cita_propietario' and c.lead_id = x.propietario_lead_id;

-- 5) La etapa de cada inmueble en captación sale de sus citas
update public.inmuebles i
set etapa_captacion = case
  when exists (select 1 from public.citas c
               where c.inmueble_id = i.id and c.tipo = 'cita_propietario' and c.estado = 'programada') then 'cita_agendada'
  when exists (select 1 from public.citas c
               where c.inmueble_id = i.id and c.tipo = 'cita_propietario' and c.estado = 'realizada') then 'cita_realizada'
  else 'calificando' end
where i.estado = 'en_captacion';

-- ---------- Cliente deja de ser un estado final ----------
-- Cliente significa 'ya cerró al menos un negocio': el lead sigue operando mientras tenga negocios abiertos.
-- Cliente es el estado más alto del embudo: las acciones no lo mueven, pero sí registran la interacción.

create or replace function public.avanzar_estado(
  p_lead_id uuid, p_estado public.estado_lead, p_nota text default null
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_actual public.estado_lead;
begin
  select estado into v_actual from public.leads where id = p_lead_id for update;
  if v_actual is null or v_actual = 'baja' then
    return false;
  end if;
  if v_actual in ('no_responde', 'descartado') or public.orden_estado(v_actual) < public.orden_estado(p_estado) then
    perform public.fijar_estado(p_lead_id, p_estado, p_nota);
    update public.leads set ultima_interaccion_at = now() where id = p_lead_id;
    return true;
  end if;
  return false;
end $$;

create or replace function public.marcar_respuesta_lead(p_lead_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_estado public.estado_lead;
begin
  select estado into v_estado from public.leads where id = p_lead_id;
  if v_estado is null or v_estado = 'baja' then
    return;
  end if;
  update public.leads set respondio_at = now(), ultima_interaccion_at = now() where id = p_lead_id;
  update public.refuerzos set estado = 'cancelado' where lead_id = p_lead_id and estado = 'pendiente';
  if v_estado in ('nuevo', 'contactado', 'no_responde') then
    perform public.fijar_estado(p_lead_id, 'en_conversacion', 'Respondió');
  end if;
end $$;

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
  p_nota text,
  p_detalle jsonb default '{}'
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
  v_otra uuid;
  v_sugerencia bigint;
  v_inmuebles int;
  v_busquedas int;
begin
  if v_tel is null then
    raise exception 'El teléfono no es válido';
  end if;
  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'El nombre es obligatorio';
  end if;

  select * into v_persona from public.personas where id = public.persona_por_telefono(v_tel) for update;
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

  elsif v_lead.ultima_interaccion_at < now() - make_interval(months => v_plazo) then
    -- Pasado el plazo: ciclo nuevo, mismo asesor, historial visible. Cliente no se corta aquí: dentro del
    -- plazo se suma al mismo lead; vencido el plazo, el ciclo nuevo se lleva los negocios abiertos.
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

    -- Los inmuebles abiertos siguen el negocio en el ciclo nuevo; lo vendido o retirado queda en el anterior
    update public.inmuebles
    set propietario_lead_id = v_lead_id
    where propietario_lead_id = v_lead.id and estado in ('en_captacion', 'en_cartera');
    get diagnostics v_inmuebles = row_count;
    -- Las citas pendientes acompañan a su inmueble
    update public.citas
    set lead_id = v_lead_id
    where lead_id = v_lead.id and estado = 'programada'
      and inmueble_id in (select id from public.inmuebles where propietario_lead_id = v_lead_id);
    -- Las búsquedas activas también siguen en el ciclo nuevo; las cumplidas o inactivas quedan atrás
    update public.busquedas set lead_id = v_lead_id where lead_id = v_lead.id and activa;
    get diagnostics v_busquedas = row_count;
    -- Si sigue con negocios abiertos, el ciclo nuevo también es Cliente: ya cerró al menos un negocio
    if v_lead.estado = 'cliente' and (v_inmuebles > 0 or v_busquedas > 0) then
      perform public.fijar_estado(v_lead_id, 'cliente', 'Sigue como Cliente: sus negocios abiertos pasan al ciclo nuevo');
    end if;
    perform public.registrar_evento('ciclo_traspaso', v_lead_id,
      jsonb_build_object('inmuebles', v_inmuebles, 'busquedas', v_busquedas, 'ciclo_anterior', v_lead.id));
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
    coalesce(p_detalle, '{}') || jsonb_build_object(
      'resultado', v_resultado, 'canal', p_canal, 'canal_detalle', p_canal_detalle, 'tipo', p_tipo,
      'telefono', v_tel, 'email', nullif(trim(p_email), '')
    )
  );

  if v_resultado in ('retomado', 'ya_activo', 'baja') then
    if v_lead.asesor_id is not null then
      perform public.notificar(v_lead.asesor_id, 'lead_regreso', 'Un lead volvió a escribir',
        v_persona.nombre || ' (' || p_tipo || ')', '/leads/' || v_lead_id);
    else
      perform public.notificar_admins('lead_regreso', 'Un lead volvió a escribir',
        v_persona.nombre || ' (' || p_tipo || ')', '/leads/' || v_lead_id);
    end if;
  end if;

  -- Mismo correo en otra persona: se sugiere unirlas
  if nullif(trim(p_email), '') is not null then
    for v_otra in
      select id from public.personas where lower(email) = lower(trim(p_email)) and id <> v_persona.id
    loop
      insert into public.sugerencias_union (persona_a, persona_b) values (v_otra, v_persona.id)
      on conflict do nothing returning id into v_sugerencia;
      continue when v_sugerencia is null;
      perform public.registrar_evento('union_sugerida', null,
        jsonb_build_object('otra_persona', v_persona.id, 'motivo', 'correo', 'sugerencia_id', v_sugerencia), null, v_otra);
      perform public.registrar_evento('union_sugerida', null,
        jsonb_build_object('otra_persona', v_otra, 'motivo', 'correo', 'sugerencia_id', v_sugerencia), null, v_persona.id);
      -- El asesor solo se entera si también lleva a la otra persona; si no, los administradores
      if v_lead.asesor_id is not null
         and exists (select 1 from public.leads where persona_id = v_otra and asesor_id = v_lead.asesor_id) then
        perform public.notificar(v_lead.asesor_id, 'union_sugerida', 'Posible misma persona',
          v_persona.nombre || ' comparte correo con otro cliente', '/personas/' || v_persona.id);
      else
        perform public.notificar_admins('union_sugerida', 'Posible misma persona',
          v_persona.nombre || ' comparte correo con otro cliente', '/personas/' || v_persona.id);
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'lead_id', v_lead_id,
    'persona_id', v_persona.id,
    'resultado', v_resultado,
    'asesor_id', v_lead.asesor_id,
    'asesor_nombre', (select nombre from public.perfiles where id = v_lead.asesor_id)
  );
end $$;
revoke all on function public.registrar_lead_interno(text, text, public.tipo_lead, public.canal_origen, text, text, boolean, boolean, uuid, text, jsonb) from public, anon, authenticated;

create or replace function public.dar_baja(p_lead_id uuid, p_motivo text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_persona uuid;
  v_lead public.leads%rowtype;
begin
  if not public.puede_ver_lead(p_lead_id) then
    raise exception 'No tienes acceso a este lead' using errcode = '42501';
  end if;
  select persona_id into v_persona from public.leads where id = p_lead_id;
  update public.personas set no_contactar = true, no_contactar_at = now() where id = v_persona;
  for v_lead in
    select * from public.leads where persona_id = v_persona and vigente and estado <> 'baja'
  loop
    -- Cliente no cambia de estado, pero tampoco recibe refuerzos ni recordatorios
    if v_lead.estado <> 'cliente' then
      perform public.fijar_estado(v_lead.id, 'baja', coalesce(nullif(trim(p_motivo), ''), 'Pidió no ser contactado'));
      update public.leads set motivo_salida = p_motivo where id = v_lead.id;
    end if;
    update public.refuerzos set estado = 'cancelado' where lead_id = v_lead.id and estado = 'pendiente';
    update public.citas set estado = 'cancelada', motivo_cancelacion = 'Baja'
    where lead_id = v_lead.id and estado = 'programada';
  end loop;
  perform public.registrar_evento('baja', p_lead_id, jsonb_build_object('motivo', p_motivo));
end $$;

create or replace function public.unir_personas(p_queda uuid, p_absorbida uuid, p_leads_que_siguen uuid[] default '{}')
returns void
language plpgsql security definer set search_path = public as $$
declare
  q public.personas%rowtype;
  a public.personas%rowtype;
  v_tipo public.tipo_lead;
  v_la public.leads%rowtype;
  v_lb public.leads%rowtype;
  v_cerrar uuid;
  v_sigue uuid;
  v_cerrados jsonb := '[]';
  v_telefonos jsonb;
  v_sugerencias jsonb;
  v_movidos jsonb := '{}';
  v_n int;
  v_lead public.leads%rowtype;
begin
  if p_queda = p_absorbida then
    raise exception 'Elige dos personas distintas';
  end if;
  if not (public.puede_ver_persona(p_queda) and public.puede_ver_persona(p_absorbida)) then
    raise exception 'No tienes acceso a esta persona' using errcode = '42501';
  end if;
  select * into q from public.personas where id = p_queda for update;
  select * into a from public.personas where id = p_absorbida for update;
  if q.id is null or a.id is null then
    raise exception 'La persona no existe';
  end if;

  -- Un lead vigente por tipo: el que no sigue se cierra
  foreach v_tipo in array enum_range(null::public.tipo_lead) loop
    v_la := null;
    v_lb := null;
    select * into v_la from public.leads where persona_id = p_queda and tipo = v_tipo and vigente;
    select * into v_lb from public.leads where persona_id = p_absorbida and tipo = v_tipo and vigente;
    continue when v_la.id is null or v_lb.id is null;
    if v_la.id = any (coalesce(p_leads_que_siguen, '{}')) then
      v_sigue := v_la.id; v_cerrar := v_lb.id;
    elsif v_lb.id = any (coalesce(p_leads_que_siguen, '{}')) then
      v_sigue := v_lb.id; v_cerrar := v_la.id;
    else
      raise exception 'Elige qué lead de % sigue', v_tipo;
    end if;
    if exists (select 1 from public.leads where id = v_cerrar and estado = 'cliente') then
      raise exception 'El lead de % que se cerraría ya es Cliente: elige que siga ese', v_tipo;
    end if;
    if exists (select 1 from public.citas where lead_id = v_cerrar and estado = 'programada') then
      raise exception 'El lead de % que se cerraría tiene una cita o visita pendiente: regístrala, reprográmala o cancélala primero', v_tipo;
    end if;
    if exists (select 1 from public.compraventas where lead_id = v_cerrar and estado = 'en_curso') then
      raise exception 'El lead de % que se cerraría tiene una compraventa en curso: elige que siga ese', v_tipo;
    end if;
    update public.leads set vigente = false where id = v_cerrar;
    update public.refuerzos set estado = 'cancelado' where lead_id = v_cerrar and estado = 'pendiente';
    perform public.registrar_evento('lead_cerrado_por_union', v_cerrar, jsonb_build_object('lead_que_sigue', v_sigue));
    v_cerrados := v_cerrados || jsonb_build_object('tipo', v_tipo, 'cerrado', v_cerrar, 'sigue', v_sigue);
  end loop;

  -- Copia de lo que se absorbe, antes de moverlo
  select coalesce(jsonb_agg(jsonb_build_object('telefono', telefono, 'principal', principal)), '[]') into v_telefonos
  from public.persona_telefonos where persona_id = p_absorbida;
  select coalesce(jsonb_agg(to_jsonb(s)), '[]') into v_sugerencias
  from public.sugerencias_union s where p_absorbida in (s.persona_a, s.persona_b);

  update public.leads set persona_id = p_queda where persona_id = p_absorbida;
  get diagnostics v_n = row_count; v_movidos := v_movidos || jsonb_build_object('leads', v_n);
  update public.mensajes set persona_id = p_queda where persona_id = p_absorbida;
  get diagnostics v_n = row_count; v_movidos := v_movidos || jsonb_build_object('mensajes', v_n);
  update public.eventos set persona_id = p_queda where persona_id = p_absorbida;
  get diagnostics v_n = row_count; v_movidos := v_movidos || jsonb_build_object('eventos', v_n);
  update public.inmuebles set persona_id = p_queda where persona_id = p_absorbida;
  get diagnostics v_n = row_count; v_movidos := v_movidos || jsonb_build_object('inmuebles', v_n);
  update public.persona_telefonos set persona_id = p_queda, principal = false where persona_id = p_absorbida;

  -- Sugerencias con terceros pasan a p_queda (salvo que ya exista el mismo par); la del par unido se borra
  -- en cascada con la absorbida
  delete from public.sugerencias_union s
  where p_absorbida in (s.persona_a, s.persona_b) and p_queda not in (s.persona_a, s.persona_b)
    and exists (
      select 1 from public.sugerencias_union o
      where p_queda in (o.persona_a, o.persona_b)
        and (case when s.persona_a = p_absorbida then s.persona_b else s.persona_a end) in (o.persona_a, o.persona_b)
    );
  update public.sugerencias_union
  set persona_a = case when persona_a = p_absorbida then p_queda else persona_a end,
      persona_b = case when persona_b = p_absorbida then p_queda else persona_b end
  where p_absorbida in (persona_a, persona_b) and p_queda not in (persona_a, persona_b);

  -- Datos: se conservan los de p_queda y se completan los vacíos; la Baja gana
  update public.personas set
    email = coalesce(q.email, a.email),
    genero = coalesce(q.genero, a.genero),
    horario_preferido = coalesce(q.horario_preferido, a.horario_preferido),
    medio_contacto = coalesce(q.medio_contacto, a.medio_contacto),
    intencion = coalesce(q.intencion, a.intencion),
    ultimo_entrante_at = greatest(q.ultimo_entrante_at, a.ultimo_entrante_at),
    no_contactar = q.no_contactar or a.no_contactar,
    no_contactar_at = coalesce(q.no_contactar_at, a.no_contactar_at)
  where id = p_queda;
  if q.no_contactar or a.no_contactar then
    for v_lead in
      select * from public.leads where persona_id = p_queda and vigente and estado <> 'baja'
    loop
      -- Cliente no cambia de estado, pero tampoco recibe refuerzos ni recordatorios
      if v_lead.estado <> 'cliente' then
        perform public.fijar_estado(v_lead.id, 'baja', 'Se unió con un registro que pidió no ser contactado');
        update public.leads set motivo_salida = 'Se unió con un registro en Baja' where id = v_lead.id;
      end if;
      update public.refuerzos set estado = 'cancelado' where lead_id = v_lead.id and estado = 'pendiente';
      update public.citas set estado = 'cancelada', motivo_cancelacion = 'Baja'
      where lead_id = v_lead.id and estado = 'programada';
    end loop;
  end if;

  perform public.registrar_evento('personas_unidas', null, jsonb_build_object(
    'absorbida', to_jsonb(a), 'telefonos', v_telefonos, 'sugerencias', v_sugerencias,
    'leads_cerrados', v_cerrados, 'movidos', v_movidos
  ), null, p_queda);

  delete from public.personas where id = p_absorbida;
end $$;


-- ---------- Varias búsquedas por interesado ----------
-- Cada búsqueda es una unidad del negocio: el interesado puede tener varias activas y cerrar una sin
-- cerrar las demás.

alter table public.busquedas drop constraint busquedas_pkey;
alter table public.busquedas add column id uuid not null default gen_random_uuid();
alter table public.busquedas add primary key (id);
create index busquedas_lead_idx on public.busquedas (lead_id);
alter table public.busquedas
  add column nombre text not null default 'Principal',
  add column activa boolean not null default true,
  add column cumplida_at timestamptz;

-- Cada alta, edición y desactivación deja su evento con la búsqueda de la que se trata
create or replace function public.busqueda_despues_de_guardar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.registrar_evento('busqueda_agregada', new.lead_id,
      jsonb_build_object('busqueda_id', new.id, 'nombre', new.nombre));
  else
    perform public.registrar_evento('perfil_busqueda', new.lead_id,
      (to_jsonb(new) - 'lead_id' - 'updated_by') || jsonb_build_object('busqueda_id', new.id));
    if old.activa and not new.activa then
      perform public.registrar_evento('busqueda_desactivada', new.lead_id,
        jsonb_build_object('busqueda_id', new.id, 'nombre', new.nombre,
                           'cumplida', new.cumplida_at is not null));
    end if;
  end if;
  perform public.revisar_calificacion(new.lead_id);
  return null;
end $$;

-- Puntaje de un inmueble contra una búsqueda concreta (o sin perfil, si es nula)
create or replace function public.calcular_match_busqueda(
  p_busqueda_id uuid, p_lead_id uuid, p_inmueble_id uuid
) returns jsonb
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
  select * into b from public.busquedas where id = p_busqueda_id;
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

  -- Las respuestas previas ajustan el cruce (es un aprendizaje por lead, no por búsqueda)
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
    'imprescindibles', v_impr, 'ajuste_respuestas', v_feedback, 'excluido', v_excluido,
    'busqueda_id', b.id, 'busqueda_nombre', b.nombre
  );
end $$;

-- El cruce general usa la mejor búsqueda activa del interesado (o el perfil vacío si no tiene)
create or replace function public.calcular_match(p_lead_id uuid, p_inmueble_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  b record;
  v_match jsonb;
  v_mejor jsonb;
begin
  for b in select id from public.busquedas where lead_id = p_lead_id and activa loop
    v_match := public.calcular_match_busqueda(b.id, p_lead_id, p_inmueble_id);
    if v_mejor is null then
      v_mejor := v_match;
    elsif (v_match ->> 'excluido') is null
      and ((v_mejor ->> 'excluido') is not null
           or (v_match ->> 'puntaje')::numeric > (v_mejor ->> 'puntaje')::numeric) then
      v_mejor := v_match;
    end if;
  end loop;
  return coalesce(v_mejor, public.calcular_match_busqueda(null, p_lead_id, p_inmueble_id));
end $$;

-- HU-22: inmuebles que hacen match, con la búsqueda con la que hicieron match
drop function public.sugerir_matches(uuid);
create function public.sugerir_matches(p_lead_id uuid)
returns table (
  inmueble_id uuid, codigo text, tipo text, distrito text, precio numeric, dormitorios int,
  metraje numeric, puntaje numeric, detalle jsonb, ultimo_envio_at timestamptz, ultima_respuesta public.respuesta_match,
  busqueda_id uuid, busqueda_nombre text
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.puede_ver_lead(p_lead_id) then
    raise exception 'No tienes acceso a este lead' using errcode = '42501';
  end if;
  return query
  select i.id, i.codigo, i.tipo, i.distrito, i.precio, i.dormitorios, i.metraje,
         (m ->> 'puntaje')::numeric, m, u.enviado_at, u.respuesta,
         (m ->> 'busqueda_id')::uuid, m ->> 'busqueda_nombre'
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
revoke all on function public.sugerir_matches(uuid) from public, anon;
grant execute on function public.sugerir_matches(uuid) to authenticated, service_role;

-- El envío guarda con qué búsqueda hizo match
alter table public.match_opciones
  add column busqueda_id uuid references public.busquedas (id) on delete set null;

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
    insert into public.match_opciones (envio_id, lead_id, inmueble_id, busqueda_id, puntaje, detalle)
    values (v_envio, p_lead_id, v_inmueble, (v_match ->> 'busqueda_id')::uuid,
            (v_match ->> 'puntaje')::numeric, v_match);
    perform public.registrar_evento('match_opcion_enviada', p_lead_id,
      jsonb_build_object('envio_id', v_envio, 'tipo', p_tipo, 'puntaje', v_match -> 'puntaje',
                         'busqueda_id', v_match -> 'busqueda_id'), v_inmueble);
  end loop;
  if p_tipo = 'novedad' then
    update public.leads set ultimas_novedades_at = now() where id = p_lead_id;
  end if;
  perform public.avanzar_estado(p_lead_id, 'match_enviado',
    case when p_tipo = 'novedad' then 'Novedad enviada' else 'Matches enviados' end);
  return v_envio;
end $$;

-- HU-24: un Cliente sigue recibiendo novedades mientras tenga búsquedas activas
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
    and l.estado in ('en_conversacion', 'calificado', 'match_enviado', 'visita_agendada', 'visita_realizada', 'cliente')
    and exists (select 1 from public.busquedas b where b.lead_id = l.id and b.activa)
    and not p.no_contactar
    and public.puede_ver_lead(l.id)
    and m ->> 'excluido' is null
    and (m ->> 'puntaje')::numeric >= p_minimo
    and not exists (select 1 from public.match_opciones mo where mo.lead_id = l.id and mo.inmueble_id = p_inmueble_id)
  order by (m ->> 'puntaje')::numeric desc;
end $$;

-- HU-31: al cerrar, la búsqueda que se concretó queda cumplida y las demás siguen activas
create or replace function public.cerrar_compraventa(
  p_compraventa_id uuid,
  p_fecha_cierre date,
  p_precio_venta numeric,
  p_comision_pagada numeric,
  p_notas text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  cv public.compraventas%rowtype;
  i public.inmuebles%rowtype;
  v_dias int := coalesce(public.param_int('testimonio_dias'), 7);
  v_busqueda uuid;
  v_activas int;
  v_n int;
begin
  select * into cv from public.compraventas where id = p_compraventa_id for update;
  if not found or not (public.puede_ver_lead(cv.lead_id) or public.puede_editar_inmueble(cv.inmueble_id)) then
    raise exception 'No tienes acceso a esta compraventa' using errcode = '42501';
  end if;
  if cv.estado <> 'en_curso' then
    raise exception 'La compraventa no está en curso';
  end if;
  if p_fecha_cierre is null then
    raise exception 'Indica la fecha de cierre';
  end if;
  if p_comision_pagada is null or p_comision_pagada < 0 then
    raise exception 'Indica la comisión pagada';
  end if;
  select * into i from public.inmuebles where id = cv.inmueble_id for update;

  update public.compraventas
  set estado = 'cerrada', fecha_cierre = p_fecha_cierre, precio_venta = coalesce(p_precio_venta, i.precio),
      comision_pagada = p_comision_pagada, cerrada_por = auth.uid(), notas = coalesce(p_notas, notas)
  where id = p_compraventa_id;

  -- Otras compraventas en curso del mismo inmueble se caen
  update public.compraventas set estado = 'caida', motivo_caida = 'El inmueble se vendió a otro comprador'
  where inmueble_id = cv.inmueble_id and estado = 'en_curso' and id <> p_compraventa_id;

  update public.inmuebles set estado = 'vendido', vendido_at = now(), autoriza_publicar = false where id = i.id;
  update public.contratos set estado = 'terminado' where inmueble_id = i.id and estado = 'vigente';

  perform public.fijar_estado(cv.lead_id, 'cliente', 'Compraventa cerrada (' || i.codigo || ')');
  update public.leads set ultima_interaccion_at = now() where id = cv.lead_id;

  -- La búsqueda del último match de este inmueble es la que se cumplió; si no hubo, la única activa
  select mo.busqueda_id into v_busqueda
  from public.match_opciones mo join public.match_envios e on e.id = mo.envio_id
  where mo.lead_id = cv.lead_id and mo.inmueble_id = i.id and mo.busqueda_id is not null
  order by e.enviado_at desc, mo.id desc
  limit 1;
  if v_busqueda is null then
    select count(*), (array_agg(id))[1] into v_activas, v_busqueda
    from public.busquedas where lead_id = cv.lead_id and activa;
    if v_activas <> 1 then
      v_busqueda := null;
    end if;
  end if;
  if v_busqueda is not null then
    update public.busquedas set activa = false, cumplida_at = now() where id = v_busqueda and activa;
    get diagnostics v_n = row_count;
    if v_n > 0 then
      perform public.registrar_evento('busqueda_cumplida', cv.lead_id,
        jsonb_build_object('busqueda_id', v_busqueda, 'inmueble_id', i.id, 'compraventa_id', cv.id), i.id);
    end if;
  end if;

  insert into public.testimonios (compraventa_id, lead_id, rol, programado_para)
  values (cv.id, cv.lead_id, 'comprador', p_fecha_cierre + v_dias)
  on conflict do nothing;
  if i.propietario_lead_id is not null then
    insert into public.testimonios (compraventa_id, lead_id, rol, programado_para)
    values (cv.id, i.propietario_lead_id, 'vendedor', p_fecha_cierre + v_dias)
    on conflict do nothing;
  end if;

  perform public.registrar_evento('compraventa_cerrada', cv.lead_id,
    jsonb_build_object('compraventa_id', cv.id, 'fecha', p_fecha_cierre, 'precio_venta', coalesce(p_precio_venta, i.precio),
                       'comision_pagada', p_comision_pagada),
    i.id);
  perform public.registrar_evento('inmueble_vendido', i.propietario_lead_id,
    jsonb_build_object('compraventa_id', cv.id), i.id, i.persona_id);
end $$;

-- ---------- Vende para comprar, bandeja y dataset ----------
-- El interés de compra puede depender de la venta del inmueble del mismo propietario (misma persona)

alter table public.leads add column lead_venta_id uuid references public.leads (id) on delete set null;

create function public.vincular_venta(p_lead_interesado uuid, p_lead_propietario uuid default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  i public.leads%rowtype;
  v public.leads%rowtype;
begin
  if not public.puede_ver_lead(p_lead_interesado) then
    raise exception 'No tienes acceso a este lead' using errcode = '42501';
  end if;
  select * into i from public.leads where id = p_lead_interesado;
  if i.id is null or i.tipo <> 'interesado' then
    raise exception 'El vínculo se marca en el lead del interesado';
  end if;

  if p_lead_propietario is null then
    update public.leads set lead_venta_id = null where id = p_lead_interesado;
    perform public.registrar_evento('vende_para_comprar', p_lead_interesado,
      jsonb_build_object('lead_venta_id', null));
    return;
  end if;

  if not public.puede_ver_lead(p_lead_propietario) then
    raise exception 'No tienes acceso a este lead' using errcode = '42501';
  end if;
  select * into v from public.leads where id = p_lead_propietario;
  if v.id is null or v.tipo <> 'propietario' then
    raise exception 'El vínculo va hacia el lead de un propietario';
  end if;
  if v.persona_id <> i.persona_id then
    raise exception 'Solo puedes vincular la compra con la venta de la misma persona';
  end if;
  if not v.vigente then
    raise exception 'El lead del propietario es de un ciclo anterior';
  end if;
  if v.estado = 'baja' then
    raise exception 'El lead del propietario está en Baja';
  end if;

  update public.leads set lead_venta_id = p_lead_propietario where id = p_lead_interesado;
  perform public.registrar_evento('vende_para_comprar', p_lead_interesado,
    jsonb_build_object('lead_venta_id', p_lead_propietario));
end $$;
revoke all on function public.vincular_venta(uuid, uuid) from public, anon;
grant execute on function public.vincular_venta(uuid, uuid) to authenticated, service_role;

-- La bandeja muestra los inmuebles del propietario, sus búsquedas activas y la venta que condiciona la compra
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
  pa.fecha as proxima_accion_at,
  (select count(*)::int from public.eventos e
   where e.lead_id = l.id and e.tipo in ('lead_registrado', 'lead_regreso')) as intenciones,
  (select coalesce(jsonb_agg(jsonb_build_object('codigo', i.codigo, 'estado', i.estado, 'etapa', i.etapa_captacion)
                             order by i.numero), '[]'::jsonb)
   from public.inmuebles i
   where i.propietario_lead_id = l.id and i.estado not in ('vendido', 'retirado')) as inmuebles,
  (select count(*)::int from public.busquedas b where b.lead_id = l.id and b.activa) as busquedas_activas,
  l.lead_venta_id
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

-- HU-35: una fila por inmueble del propietario (el negocio y la firma son por inmueble)
drop view public.v_dataset_propietarios;
create view public.v_dataset_propietarios with (security_invoker = true) as
select
  l.id as lead_id,
  i.id as inmueble_id,
  l.created_at,
  l.canal,
  l.estado,
  q.rol_contacto,
  q.tiene_poder,
  q.hipoteca,
  q.hipoteca_saldo,
  i.tipo as tipo_inmueble,
  i.distrito,
  i.metraje,
  i.dormitorios,
  i.precio_esperado,
  q.urgencia,
  q.inscrito_sunarp,
  q.copropietarios,
  (
    select round(avg(o.precio / nullif(o.metraje, 0)))
    from public.inmuebles o
    where lower(o.distrito) = lower(i.distrito) and o.tipo = i.tipo and o.estado in ('en_cartera', 'vendido')
  ) as precio_m2_zona,
  case when i.metraje > 0 then round(i.precio_esperado / i.metraje) end as precio_m2_esperado,
  l.respondio_at is not null as respondio,
  case when l.respondio_at is not null and l.bienvenida_at is not null and l.respondio_at >= l.bienvenida_at
    then round(extract(epoch from (l.respondio_at - l.bienvenida_at)) / 3600, 1) end as horas_hasta_respuesta,
  (select count(*) from public.mensajes m where m.lead_id = l.id and m.direccion = 'entrante') as mensajes_entrantes,
  (select count(*) from public.refuerzos r where r.lead_id = l.id and r.estado = 'enviado') as refuerzos_enviados,
  (select count(*) from public.citas c where c.lead_id = l.id and c.estado = 'realizada') as citas_realizadas,
  exists (select 1 from public.contratos k where k.inmueble_id = i.id) as firmo,
  (select min(k.created_at) from public.contratos k where k.inmueble_id = i.id) as firmo_at
from public.inmuebles i
join public.leads l on l.id = i.propietario_lead_id
left join public.inmueble_captacion q on q.inmueble_id = i.id
where i.propietario_lead_id is not null;
revoke all on public.v_dataset_propietarios from anon, authenticated;
grant select on public.v_dataset_propietarios to authenticated;
grant all on public.v_dataset_propietarios to service_role;

-- La ficha de calificación por lead se reemplazó por la ficha de captación de cada inmueble
drop table public.calificacion_propietario;

-- ---------- Contactos: datos comunes con trazabilidad ----------
-- Cada cambio de un dato común de la persona deja el antes y el después en su historial
create or replace function public.personas_editada() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.nombre is distinct from old.nombre then
    perform public.registrar_evento('persona_editada', null,
      jsonb_build_object('campo', 'nombre', 'antes', old.nombre, 'despues', new.nombre), null, new.id);
  end if;
  if new.email is distinct from old.email then
    perform public.registrar_evento('persona_editada', null,
      jsonb_build_object('campo', 'email', 'antes', old.email, 'despues', new.email), null, new.id);
  end if;
  if new.genero is distinct from old.genero then
    perform public.registrar_evento('persona_editada', null,
      jsonb_build_object('campo', 'genero', 'antes', old.genero, 'despues', new.genero), null, new.id);
  end if;
  if new.horario_preferido is distinct from old.horario_preferido then
    perform public.registrar_evento('persona_editada', null,
      jsonb_build_object('campo', 'horario_preferido', 'antes', old.horario_preferido, 'despues', new.horario_preferido), null, new.id);
  end if;
  if new.medio_contacto is distinct from old.medio_contacto then
    perform public.registrar_evento('persona_editada', null,
      jsonb_build_object('campo', 'medio_contacto', 'antes', old.medio_contacto, 'despues', new.medio_contacto), null, new.id);
  end if;
  if new.intencion is distinct from old.intencion then
    perform public.registrar_evento('persona_editada', null,
      jsonb_build_object('campo', 'intencion', 'antes', old.intencion, 'despues', new.intencion), null, new.id);
  end if;
  return null;
end $$;
create trigger personas_editada after update on public.personas
  for each row execute function public.personas_editada();
revoke all on function public.personas_editada() from public, anon, authenticated;
