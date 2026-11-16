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
  insert into public.inmueble_captacion (inmueble_id) values (v_id);
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

-- 2) La calificación del lead va al inmueble más reciente del lead (lo sensible a la ficha de captación,
--    y lo público al inmueble solo si el inmueble no lo tenía)
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

-- 3) Lead con calificación y sin inmueble: se crea un inmueble en captación con esos datos
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
), captacion as (
  insert into public.inmueble_captacion (
    inmueble_id, rol_contacto, tiene_poder, hipoteca, hipoteca_banco, hipoteca_saldo, urgencia,
    inscrito_sunarp, copropietarios, copropietarios_detalle, notas
  )
  select n.id, q.rol_contacto, q.tiene_poder, q.hipoteca, q.hipoteca_banco, q.hipoteca_saldo, q.urgencia,
         q.inscrito_sunarp, q.copropietarios, q.copropietarios_detalle, q.notas
  from nuevos n
  join public.calificacion_propietario q on q.lead_id = n.propietario_lead_id
  returning inmueble_id
)
insert into public.eventos (tipo, lead_id, persona_id, inmueble_id, datos)
select 'inmueble_agregado', n.propietario_lead_id, n.persona_id, n.id, '{"origen": "migracion"}'::jsonb
from nuevos n;

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
