-- WhatsApp en coexistencia (el mismo número en la app WhatsApp Business del celular y en la Cloud API)
-- y costos de WhatsApp en el tablero.
-- Orígenes nuevos de mensajes:
--   celular:   enviado por el asesor desde la app del celular (webhook smb_message_echoes)
--   importado: historial de la app (hasta 6 meses) que Meta envía una sola vez al conectar el número

alter table public.mensajes drop constraint mensajes_origen_check;
alter table public.mensajes add constraint mensajes_origen_check
  check (origen in ('whatsapp', 'panel', 'manual', 'simulado', 'celular', 'importado'));

-- Cobro que informa Meta con cada estado de entrega (objeto pricing): categoría y tipo (regular = se cobra)
alter table public.mensajes add column cobro_categoria text, add column cobro_tipo text;

-- Lo enviado desde el celular ya salió: se guarda aunque la persona esté en Baja (y se avisa al admin)
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
  return new;
end $$;

-- El historial importado abre la ventana de 24 h si corresponde, pero no cuenta como respuesta nueva ni avisa
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
  if new.origen in ('whatsapp', 'simulado', 'importado') then
    update public.personas
    set ultimo_entrante_at = greatest(coalesce(ultimo_entrante_at, new.created_at), new.created_at)
    where id = new.persona_id;
  end if;
  if new.origen = 'importado' then
    return null;
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

-- Mensaje que viene de la app del celular: eco de un envío (celular) o historial (importado)
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

  select * into v_persona from public.personas where telefono = v_tel;
  if not found then
    insert into public.personas (telefono, nombre)
    values (v_tel, coalesce(nullif(trim(p_nombre), ''), '+' || v_tel))
    returning * into v_persona;
  end if;

  insert into public.mensajes (persona_id, direccion, tipo, cuerpo, origen, estado, wa_id, created_at, autor_id, leido_at)
  values (
    v_persona.id, p_direccion, coalesce(p_tipo, 'texto'), p_cuerpo, p_origen,
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

drop function public.actualizar_estado_whatsapp(text, text, text);
create function public.actualizar_estado_whatsapp(
  p_wa_id text,
  p_estado text,
  p_error text default null,
  p_cobro_categoria text default null,
  p_cobro_tipo text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_avanza boolean;
begin
  if p_estado not in ('enviado', 'entregado', 'leido', 'fallido') then
    return;
  end if;
  -- El estado no retrocede (un leído no vuelve a "entregado" si los avisos llegan desordenados);
  -- el cobro se guarda siempre
  update public.mensajes
  set estado = case when p_estado = 'fallido'
                      or array_position(array['registrado', 'enviado', 'entregado', 'leido'], estado)
                         < array_position(array['registrado', 'enviado', 'entregado', 'leido'], p_estado)
                    then p_estado else estado end,
      error = case when p_estado = 'fallido' then coalesce(p_error, error) else error end,
      cobro_categoria = coalesce(p_cobro_categoria, cobro_categoria),
      cobro_tipo = coalesce(p_cobro_tipo, cobro_tipo)
  where wa_id = p_wa_id and direccion = 'saliente';
end $$;

revoke execute on function public.registrar_mensaje_app(text, text, text, text, text, text, timestamptz, text, text) from public, anon, authenticated;
revoke execute on function public.actualizar_estado_whatsapp(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.registrar_mensaje_app(text, text, text, text, text, text, timestamptz, text, text) to service_role;
grant execute on function public.actualizar_estado_whatsapp(text, text, text, text, text) to service_role;

-- Parámetros con decimales (tarifas)
alter table public.parametros drop constraint parametros_tipo_check;
alter table public.parametros add constraint parametros_tipo_check
  check (tipo in ('entero', 'decimal', 'lista_enteros', 'lista_texto', 'nivel_financiero', 'texto'));

create or replace function public.validar_parametro() returns trigger
language plpgsql as $$
begin
  if new.tipo in ('entero', 'decimal') and (jsonb_typeof(new.valor) <> 'number' or (new.valor #>> '{}')::numeric < 0) then
    raise exception 'El parámetro "%" debe ser un número mayor o igual a 0', new.nombre;
  elsif new.tipo = 'lista_enteros' and (
    jsonb_typeof(new.valor) <> 'array'
    or exists (select 1 from jsonb_array_elements(new.valor) e where jsonb_typeof(e) <> 'number' or (e #>> '{}')::numeric < 1)
  ) then
    raise exception 'El parámetro "%" debe ser una lista de días mayores o iguales a 1', new.nombre;
  elsif new.tipo = 'lista_texto' and jsonb_typeof(new.valor) <> 'array' then
    raise exception 'El parámetro "%" debe ser una lista', new.nombre;
  elsif new.tipo = 'nivel_financiero'
    and new.valor #>> '{}' not in ('no_validada', 'declarada', 'precalificada', 'aprobada') then
    raise exception 'Nivel financiero no válido';
  end if;
  return new;
end $$;

-- Corrige: calculaba jsonb_array_length antes de ver la clave, y fallaba al guardar cualquier parámetro que no
-- fuera una lista (por ejemplo, el cierre de sesión por inactividad)
create or replace function public.sincronizar_plantillas_refuerzo() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_base public.plantillas%rowtype;
begin
  if new.clave <> 'refuerzos_dias' then
    return new;
  end if;
  for n in 1..jsonb_array_length(new.valor) loop
    if not exists (select 1 from public.plantillas where clave = 'refuerzo_' || n) then
      select * into v_base from public.plantillas
      where categoria = 'refuerzo' order by orden desc limit 1;
      insert into public.plantillas (clave, nombre, categoria, descripcion, cuerpo, cuerpo_defecto, orden)
      values ('refuerzo_' || n, 'Refuerzo ' || n, 'refuerzo', 'Refuerzo agregado desde parámetros.',
              v_base.cuerpo, v_base.cuerpo_defecto, v_base.orden + 1);
    end if;
  end loop;
  return new;
end $$;

-- Tarifas por mensaje entregado en Perú (+51). Valores referenciales: confírmalos en el rate card de Meta.
insert into public.parametros (clave, nombre, descripcion, grupo, tipo, unidad, valor, valor_defecto, orden) values
  ('whatsapp_tarifa_marketing', 'Tarifa de plantillas de marketing',
   'Lo que cobra Meta por cada plantilla de marketing entregada en Perú. Confírmala en el rate card de Meta.',
   'Costos de WhatsApp', 'decimal', 'US$ por mensaje', '0.0703', '0.0703', 200),
  ('whatsapp_tarifa_utility', 'Tarifa de plantillas utility',
   'Lo que cobra Meta por cada plantilla utility (o de autenticación) entregada en Perú. Subió el 1 de octubre de 2026.',
   'Costos de WhatsApp', 'decimal', 'US$ por mensaje', '0.03', '0.03', 210),
  ('whatsapp_tarifa_servicio', 'Tarifa del chat sobre el cupo gratis',
   'Lo que cobra Meta por cada mensaje del chat (dentro de las 24 h) que pasa el cupo gratis del mes. Meta aún no publica la tarifa de Perú: actualízala cuando la publique.',
   'Costos de WhatsApp', 'decimal', 'US$ por mensaje', '0', '0', 220),
  ('whatsapp_servicio_gratis_mes', 'Cupo gratis del chat',
   'Mensajes del chat (dentro de las 24 h) que Meta no cobra cada mes por número.',
   'Costos de WhatsApp', 'entero', 'mensajes al mes', '1000', '1000', 230);

-- Costos de WhatsApp para el tablero. Solo cuesta lo que sale del panel por la Cloud API: lo que se envía
-- desde la app del celular y lo que escriben los clientes es gratis. Si Meta ya informó el cobro del mensaje
-- se usa ese dato; si no (sin webhook todavía, o modo simulado), se estima.
create or replace function public.costos_whatsapp(p_desde date, p_hasta date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_desde timestamptz := p_desde::timestamp at time zone 'America/Lima';
  v_hasta timestamptz := (p_hasta + 1)::timestamp at time zone 'America/Lima';
  -- El cupo gratis es por mes calendario: se cuenta desde el inicio del mes de "desde"
  v_inicio_mes timestamptz := date_trunc('month', p_desde)::timestamp at time zone 'America/Lima';
  v_gratis int := coalesce(public.param_int('whatsapp_servicio_gratis_mes'), 1000);
  v_tarifas jsonb := jsonb_build_object(
    'marketing', coalesce((public.param('whatsapp_tarifa_marketing') #>> '{}')::numeric, 0),
    'utility', coalesce((public.param('whatsapp_tarifa_utility') #>> '{}')::numeric, 0),
    'servicio', coalesce((public.param('whatsapp_tarifa_servicio') #>> '{}')::numeric, 0));
  v_resultado jsonb;
begin
  if not public.es_admin() then
    raise exception 'Solo el administrador ve los costos' using errcode = '42501';
  end if;

  with panel as (
    select m.created_at, m.cobro_tipo,
      to_char(m.created_at at time zone 'America/Lima', 'YYYY-MM') as mes,
      case
        when m.cobro_categoria like 'marketing%' or m.cobro_categoria = 'group_marketing' then 'marketing'
        when m.cobro_categoria in ('utility', 'group_utility') or m.cobro_categoria like 'authentication%' then 'utility'
        when m.cobro_categoria is not null then 'servicio'
        when m.tipo = 'plantilla' and p.categoria in ('cita', 'recordatorio', 'visita', 'insights') then 'utility'
        when m.tipo = 'plantilla' then 'marketing'
        else 'servicio'
      end as categoria
    from public.mensajes m
    left join public.plantillas p on p.clave = m.plantilla_clave
    where m.direccion = 'saliente' and m.origen = 'panel' and m.estado not in ('fallido', 'registrado')
      and m.created_at >= v_inicio_mes and m.created_at < v_hasta
  ),
  numerados as (
    select *, row_number() over (partition by mes, categoria = 'servicio' order by created_at) as n_mes from panel
  ),
  clasificados as (
    select mes, categoria, cobro_tipo is null as estimado,
      case
        when cobro_tipo is not null then cobro_tipo = 'regular'
        when categoria = 'servicio' then n_mes > v_gratis
        else true
      end as cobrable
    from numerados
    where created_at >= v_desde
  ),
  por_categoria as (
    select categoria, count(*) as enviados, count(*) filter (where cobrable) as cobrables,
      round(count(*) filter (where cobrable) * (v_tarifas ->> categoria)::numeric, 2) as costo
    from clasificados group by categoria
  ),
  por_mes as (
    select mes, count(*) as enviados, count(*) filter (where cobrable) as cobrables,
      round(sum(case when cobrable then (v_tarifas ->> categoria)::numeric else 0 end), 2) as costo
    from clasificados group by mes
  )
  select jsonb_build_object(
    'tarifas', v_tarifas,
    'gratis_mes', v_gratis,
    'categorias', coalesce((select jsonb_agg(to_jsonb(c)) from por_categoria c), '[]'),
    'meses', coalesce((select jsonb_agg(to_jsonb(x) order by x.mes) from por_mes x), '[]'),
    'estimados', (select count(*) from clasificados where estimado),
    'desde_celular', (select count(*) from public.mensajes
      where direccion = 'saliente' and origen in ('celular', 'importado') and created_at >= v_desde and created_at < v_hasta),
    'entrantes', (select count(*) from public.mensajes
      where direccion = 'entrante' and origen in ('whatsapp', 'importado') and created_at >= v_desde and created_at < v_hasta),
    'chat_mes_actual', (select count(*) from public.mensajes m
      where m.direccion = 'saliente' and m.origen = 'panel' and m.tipo <> 'plantilla' and m.estado not in ('fallido', 'registrado')
        and m.created_at >= date_trunc('month', public.hoy_lima())::timestamp at time zone 'America/Lima')
  ) into v_resultado;
  return v_resultado;
end $$;

revoke execute on function public.costos_whatsapp(date, date) from public, anon;
grant execute on function public.costos_whatsapp(date, date) to authenticated, service_role;
