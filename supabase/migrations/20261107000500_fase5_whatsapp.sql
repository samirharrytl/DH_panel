-- Fase 5: integración con WhatsApp Cloud API (HU-12)
-- El webhook y el modo simulado llaman a estas funciones con la clave secreta del servidor.

-- Punto de extensión: la fase 6 lo reemplaza para atribuir leads que llegan por enlaces de publicaciones
create or replace function public.atribuir_mensaje_entrante(p_persona_id uuid, p_cuerpo text) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  return null;
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

  select * into v_persona from public.personas where telefono = v_tel;
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

  insert into public.mensajes (persona_id, lead_id, direccion, tipo, cuerpo, origen, estado, wa_id, metadata, created_at, autor_id)
  values (v_persona.id, v_lead, 'entrante', coalesce(p_tipo, 'texto'), p_cuerpo, p_origen, 'recibido', p_wa_id,
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

create or replace function public.actualizar_estado_whatsapp(p_wa_id text, p_estado text, p_error text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_estado not in ('enviado', 'entregado', 'leido', 'fallido') then
    return;
  end if;
  -- No retrocede: un mensaje leído no vuelve a "entregado" si los avisos llegan desordenados
  update public.mensajes
  set estado = p_estado, error = coalesce(p_error, error)
  where wa_id = p_wa_id and direccion = 'saliente'
    and (
      p_estado = 'fallido'
      or array_position(array['registrado', 'enviado', 'entregado', 'leido'], estado)
         < array_position(array['registrado', 'enviado', 'entregado', 'leido'], p_estado)
    );
end $$;

-- Ventana de 24 horas desde el último mensaje del cliente
create or replace function public.ventana_abierta(p_persona_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select ultimo_entrante_at > now() - interval '24 hours' from public.personas where id = p_persona_id), false);
$$;

revoke execute on function public.registrar_entrante_whatsapp(text, text, text, text, text, timestamptz, jsonb, text) from public, anon, authenticated;
revoke execute on function public.actualizar_estado_whatsapp(text, text, text) from public, anon, authenticated;
revoke execute on function public.atribuir_mensaje_entrante(uuid, text) from public, anon, authenticated;
grant execute on function public.registrar_entrante_whatsapp(text, text, text, text, text, timestamptz, jsonb, text) to service_role;
grant execute on function public.actualizar_estado_whatsapp(text, text, text) to service_role;

-- Chat en vivo: el panel escucha mensajes y notificaciones con Supabase Realtime (respeta RLS)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.mensajes, public.notificaciones;
  end if;
end $$;
