-- Registro directo de un inmueble con contrato firmado, sin pasar por la cita: el propietario se registra
-- (o se une a su registro por el teléfono), el inmueble se crea y el contrato lo deja En cartera.
create or replace function public.registrar_inmueble(
  p_telefono text,
  p_nombre text,
  p_canal public.canal_origen,
  p_consentimiento_datos boolean,
  p_tipo text,
  p_direccion text,
  p_distrito text,
  p_precio numeric,
  p_metraje numeric,
  p_dormitorios int,
  p_banos int,
  p_cocheras int,
  p_descripcion text,
  p_fecha_firma date,
  p_exclusividad boolean,
  p_plazo_meses int,
  p_comision_pct numeric,
  p_autoriza_publicar boolean
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_lead uuid;
  l public.leads%rowtype;
  v_inmueble uuid;
begin
  if not public.es_usuario_activo() then
    raise exception 'Usuario no autorizado' using errcode = '42501';
  end if;
  if coalesce(trim(p_direccion), '') = '' or coalesce(trim(p_distrito), '') = '' then
    raise exception 'La dirección y el distrito son obligatorios';
  end if;
  if p_precio is null or p_precio <= 0 then
    raise exception 'Indica el precio de venta';
  end if;

  v_lead := (public.registrar_lead_interno(
    p_telefono, p_nombre, 'propietario', coalesce(p_canal, 'otro'), 'Registro directo de inmueble', null,
    coalesce(p_consentimiento_datos, false), false, auth.uid(), null
  ) ->> 'lead_id')::uuid;
  select * into l from public.leads where id = v_lead;

  insert into public.inmuebles (
    propietario_lead_id, persona_id, asesor_id, tipo, direccion, distrito, metraje, dormitorios, banos,
    cocheras, precio, descripcion
  ) values (
    v_lead, l.persona_id,
    -- El asesor que registra queda a cargo; el administrador respeta al asesor que ya tenía el propietario
    case when public.es_admin() then coalesce(l.asesor_id, auth.uid()) else auth.uid() end,
    p_tipo, trim(p_direccion), trim(p_distrito), p_metraje, p_dormitorios, p_banos, coalesce(p_cocheras, 0),
    p_precio, nullif(trim(p_descripcion), '')
  ) returning id into v_inmueble;
  perform public.registrar_evento('inmueble_creado', v_lead, '{"origen": "registro_directo"}', v_inmueble);

  perform public.registrar_contrato(
    v_inmueble, p_fecha_firma, p_exclusividad, p_plazo_meses, p_comision_pct, p_autoriza_publicar
  );
  return v_inmueble;
end $$;

revoke all on function public.registrar_inmueble(text, text, public.canal_origen, boolean, text, text, text, numeric,
  numeric, int, int, int, text, date, boolean, int, numeric, boolean) from public, anon;
grant execute on function public.registrar_inmueble(text, text, public.canal_origen, boolean, text, text, text, numeric,
  numeric, int, int, int, text, date, boolean, int, numeric, boolean) to authenticated, service_role;
