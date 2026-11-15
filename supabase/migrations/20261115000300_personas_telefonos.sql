-- Personas con varios teléfonos, intenciones registradas con su detalle y unión de personas.
-- Diseño: docs/superpowers/specs/2026-11-15-intenciones-y-telefonos-design.md

-- ---------- Teléfonos ----------
create table public.persona_telefonos (
  telefono text primary key check (telefono ~ '^[0-9]{8,15}$'),
  persona_id uuid not null references public.personas (id) on delete cascade,
  principal boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references public.perfiles (id) default auth.uid()
);
create unique index persona_telefonos_un_principal on public.persona_telefonos (persona_id) where principal;
create index persona_telefonos_persona_idx on public.persona_telefonos (persona_id);

insert into public.persona_telefonos (telefono, persona_id, principal)
select telefono, id, true from public.personas;

-- Toda persona nueva entra con su teléfono como principal
create function public.personas_telefono_principal() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.persona_telefonos (telefono, persona_id, principal, created_by)
  values (new.telefono, new.id, true, auth.uid());
  return null;
end $$;
create trigger personas_telefono_principal after insert on public.personas
  for each row execute function public.personas_telefono_principal();

create function public.persona_por_telefono(p_tel text) returns uuid
language sql stable security definer set search_path = public as $$
  select persona_id from public.persona_telefonos where telefono = p_tel;
$$;

alter table public.persona_telefonos enable row level security;
create policy persona_telefonos_leer on public.persona_telefonos for select to authenticated
  using (public.puede_ver_persona(persona_id));
revoke all on public.persona_telefonos from anon, authenticated;
grant select on public.persona_telefonos to authenticated;

-- Número por el que entró o salió cada mensaje (la ventana de 24 h de WhatsApp es por número)
alter table public.mensajes add column telefono text;
update public.mensajes m set telefono = p.telefono from public.personas p where p.id = m.persona_id;

create or replace function public.mensajes_antes_de_guardar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.direccion = 'saliente' and new.origen not in ('celular', 'importado') and exists (
    select 1 from public.personas where id = new.persona_id and no_contactar
  ) then
    raise exception 'La persona pidió no ser contactada (Baja): no se le envían mensajes';
  end if;
  if new.lead_id is null then
    select id into new.lead_id from public.leads
    where persona_id = new.persona_id and vigente
    order by ultima_interaccion_at desc limit 1;
  end if;
  -- El panel indica el número de destino en metadata.telefono; si no, el principal
  if new.telefono is null then
    new.telefono := coalesce(
      public.normalizar_telefono(new.metadata ->> 'telefono'),
      (select telefono from public.personas where id = new.persona_id)
    );
  end if;
  return new;
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

create or replace function public.registrar_entrante_whatsapp(
  p_telefono text,
  p_nombre text,
  p_cuerpo text,
  p_wa_id text,
  p_tipo text default 'texto',
  p_fecha timestamptz default now(),
  p_payload jsonb default '{}',
  p_origen text default 'whatsapp'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tel text := public.normalizar_telefono(p_telefono);
  v_persona public.personas%rowtype;
  v_mensaje uuid;
  v_lead uuid;
  v_boton text := p_payload ->> 'boton';
  v_partes text[];
  v_opcion public.match_opciones%rowtype;
  v_ultima_plantilla text;
begin
  if v_tel is null then
    raise exception 'Teléfono no válido';
  end if;
  if p_origen not in ('whatsapp', 'simulado') then
    raise exception 'Origen no permitido';
  end if;
  if p_wa_id is not null and exists (select 1 from public.mensajes where wa_id = p_wa_id) then
    return jsonb_build_object('duplicado', true);
  end if;

  select * into v_persona from public.personas where id = public.persona_por_telefono(v_tel);
  if not found then
    insert into public.personas (telefono, nombre)
    values (v_tel, coalesce(nullif(trim(p_nombre), ''), '+' || v_tel))
    returning * into v_persona;
    perform public.registrar_evento('persona_nueva_whatsapp', null, jsonb_build_object('telefono', v_tel),
      null, v_persona.id);
  end if;

  select plantilla_clave into v_ultima_plantilla from public.mensajes
  where persona_id = v_persona.id and direccion = 'saliente'
  order by created_at desc limit 1;

  -- Si el mensaje trae el código de una publicación, puede crear o asociar el lead (fase 6)
  v_lead := public.atribuir_mensaje_entrante(v_persona.id, p_cuerpo);

  insert into public.mensajes (persona_id, telefono, lead_id, direccion, tipo, cuerpo, origen, estado, wa_id, metadata, created_at, autor_id)
  values (v_persona.id, v_tel, v_lead, 'entrante', coalesce(p_tipo, 'texto'), p_cuerpo, p_origen, 'recibido', p_wa_id,
          coalesce(p_payload, '{}'), coalesce(p_fecha, now()), null)
  returning id, lead_id into v_mensaje, v_lead;

  -- Respuesta rápida a una opción de match: MATCH:<opcion_id>:<respuesta>
  if v_boton like 'MATCH:%' then
    v_partes := string_to_array(v_boton, ':');
    select * into v_opcion from public.match_opciones where id = public.uuid_o_nulo(v_partes[2]);
    if found and v_partes[3] in ('me_interesa', 'no_me_interesa', 'ver_parecidos')
       and exists (select 1 from public.leads where id = v_opcion.lead_id and persona_id = v_persona.id) then
      update public.match_opciones
      set respuesta = v_partes[3]::public.respuesta_match, respondido_at = now(), respuesta_por = null
      where id = v_opcion.id;
      perform public.registrar_evento('match_respuesta', v_opcion.lead_id,
        jsonb_build_object('opcion_id', v_opcion.id, 'envio_id', v_opcion.envio_id, 'respuesta', v_partes[3],
                           'puntaje', v_opcion.puntaje, 'origen', 'whatsapp'),
        v_opcion.inmueble_id);
    end if;
  end if;

  -- "NO" a una novedad: deja de recibir novedades y se avisa al asesor por si corresponde la Baja
  if upper(trim(coalesce(p_cuerpo, ''))) in ('NO', 'NO.', 'NO GRACIAS', 'BAJA', 'STOP')
     and v_ultima_plantilla in ('novedades', 'novedades_general') then
    update public.leads set recibe_novedades = false
    where persona_id = v_persona.id and vigente and tipo = 'interesado';
    perform public.notificar(l.asesor_id, 'pidio_no_contactar', v_persona.nombre || ' respondió "NO" a las novedades',
      'Ya no recibe novedades. Revisa si también corresponde la Baja.', '/leads/' || l.id)
    from public.leads l where l.persona_id = v_persona.id and l.vigente;
  end if;

  return jsonb_build_object('mensaje_id', v_mensaje, 'persona_id', v_persona.id, 'lead_id', v_lead);
end $$;

create or replace function public.registrar_mensaje_app(
  p_telefono text,
  p_nombre text,
  p_direccion text,
  p_cuerpo text,
  p_wa_id text,
  p_tipo text default 'texto',
  p_fecha timestamptz default now(),
  p_origen text default 'celular',
  p_estado text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tel text := public.normalizar_telefono(p_telefono);
  v_persona public.personas%rowtype;
  v_mensaje uuid;
begin
  if v_tel is null then
    raise exception 'Teléfono no válido';
  end if;
  if p_origen not in ('celular', 'importado') or p_direccion not in ('entrante', 'saliente')
     or (p_origen = 'celular' and p_direccion <> 'saliente') then
    raise exception 'Origen no permitido';
  end if;
  if p_wa_id is not null and exists (select 1 from public.mensajes where wa_id = p_wa_id) then
    return jsonb_build_object('duplicado', true);
  end if;

  select * into v_persona from public.personas where id = public.persona_por_telefono(v_tel);
  if not found then
    insert into public.personas (telefono, nombre)
    values (v_tel, coalesce(nullif(trim(p_nombre), ''), '+' || v_tel))
    returning * into v_persona;
  end if;

  insert into public.mensajes (persona_id, telefono, direccion, tipo, cuerpo, origen, estado, wa_id, created_at, autor_id, leido_at)
  values (
    v_persona.id, v_tel, p_direccion, coalesce(p_tipo, 'texto'), p_cuerpo, p_origen,
    case when p_direccion = 'entrante' then 'recibido'
         when p_estado in ('enviado', 'entregado', 'leido', 'fallido') then p_estado
         else 'enviado' end,
    p_wa_id, coalesce(p_fecha, now()), null,
    -- El historial ya se leyó en el celular
    case when p_direccion = 'entrante' then coalesce(p_fecha, now()) end
  ) returning id into v_mensaje;

  if p_origen = 'celular' then
    -- Si el asesor respondió desde el celular, lo anterior ya está leído
    update public.mensajes set leido_at = now()
    where persona_id = v_persona.id and direccion = 'entrante' and leido_at is null;
    if v_persona.no_contactar then
      perform public.notificar_admins('mensaje', 'Mensaje a una persona en Baja',
        'Desde el celular se escribió a ' || v_persona.nombre || ', que pidió no ser contactada.',
        '/chats?persona=' || v_persona.id);
    end if;
  end if;

  return jsonb_build_object('mensaje_id', v_mensaje, 'persona_id', v_persona.id);
end $$;

create function public.agregar_telefono(p_persona uuid, p_telefono text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_tel text := public.normalizar_telefono(p_telefono);
  v_duena uuid;
begin
  if not public.puede_ver_persona(p_persona) then
    raise exception 'No tienes acceso a esta persona' using errcode = '42501';
  end if;
  if v_tel is null then
    raise exception 'El teléfono no es válido';
  end if;
  v_duena := public.persona_por_telefono(v_tel);
  if v_duena = p_persona then
    raise exception 'Ese número ya está registrado en este cliente';
  elsif v_duena is not null then
    -- Solo quien puede ver al otro cliente se entera de quién es
    if public.puede_ver_persona(v_duena) then
      raise exception 'Ese número ya es de otro cliente (id: %). Únelos desde su perfil', v_duena;
    end if;
    raise exception 'Ese número ya pertenece a otro cliente; pide a un administrador que los una';
  end if;
  insert into public.persona_telefonos (telefono, persona_id) values (v_tel, p_persona);
  perform public.registrar_evento('telefono_agregado', null, jsonb_build_object('telefono', v_tel), null, p_persona);
end $$;

create function public.quitar_telefono(p_persona uuid, p_telefono text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_tel text := public.normalizar_telefono(p_telefono);
  t public.persona_telefonos%rowtype;
begin
  if not public.puede_ver_persona(p_persona) then
    raise exception 'No tienes acceso a esta persona' using errcode = '42501';
  end if;
  select * into t from public.persona_telefonos where telefono = v_tel and persona_id = p_persona;
  if not found then
    raise exception 'Ese número no está registrado en este cliente';
  end if;
  if t.principal then
    raise exception 'No se puede quitar el teléfono principal';
  end if;
  delete from public.persona_telefonos where telefono = v_tel;
  perform public.registrar_evento('telefono_quitado', null, jsonb_build_object('telefono', v_tel), null, p_persona);
end $$;

create function public.marcar_principal(p_persona uuid, p_telefono text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_tel text := public.normalizar_telefono(p_telefono);
  v_anterior text;
begin
  if not public.puede_ver_persona(p_persona) then
    raise exception 'No tienes acceso a esta persona' using errcode = '42501';
  end if;
  if not exists (select 1 from public.persona_telefonos where telefono = v_tel and persona_id = p_persona) then
    raise exception 'Ese número no está registrado en este cliente';
  end if;
  select telefono into v_anterior from public.personas where id = p_persona for update;
  if v_anterior = v_tel then
    return;
  end if;
  -- En dos pasos: el índice de un solo principal se verifica fila por fila
  update public.persona_telefonos set principal = false where persona_id = p_persona and principal;
  update public.persona_telefonos set principal = true where telefono = v_tel;
  update public.personas set telefono = v_tel where id = p_persona;
  perform public.registrar_evento('telefono_principal', null,
    jsonb_build_object('anterior', v_anterior, 'nuevo', v_tel), null, p_persona);
end $$;

revoke all on function public.persona_por_telefono(text) from public, anon, authenticated;
revoke all on function public.personas_telefono_principal() from public, anon, authenticated;
revoke all on function public.agregar_telefono(uuid, text) from public, anon;
revoke all on function public.quitar_telefono(uuid, text) from public, anon;
revoke all on function public.marcar_principal(uuid, text) from public, anon;
grant execute on function public.agregar_telefono(uuid, text) to authenticated;
grant execute on function public.quitar_telefono(uuid, text) to authenticated;
grant execute on function public.marcar_principal(uuid, text) to authenticated;
