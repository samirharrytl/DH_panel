-- Formulario de pauta digital de la landing (/registro): dos orígenes nuevos y el consentimiento de publicidad.
-- ad-buy crea un interesado y ad-sell un propietario. p_consentimiento_marketing va al final con default para que
-- las llamadas de 8 argumentos sigan funcionando; se borra la firma anterior para no dejar dos versiones.

drop function if exists public.registrar_lead_web(text, text, text, text, uuid[], text, boolean, jsonb);

create function public.registrar_lead_web(
  p_origen text,
  p_nombre text,
  p_telefono text,
  p_email text,
  p_inmuebles uuid[],
  p_nota text,
  p_consentimiento boolean,
  p_detalle jsonb,
  p_consentimiento_marketing boolean default false
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_inmuebles uuid[];
  v_lead uuid;
  v_id uuid;
begin
  if p_origen not in ('intl-form', 'owner-sell', 'cart', 'contact', 'saved-list', 'ad-buy', 'ad-sell') then
    raise exception 'Origen del sitio no válido: %', p_origen;
  end if;

  -- Solo cuentan los inmuebles que el sitio puede mostrar
  select coalesce(array_agg(i.id order by array_position(p_inmuebles, i.id)), '{}') into v_inmuebles
  from public.inmuebles i
  where i.id = any (coalesce(p_inmuebles, '{}')) and i.estado = 'en_cartera' and i.autoriza_publicar;

  if nullif(trim(p_telefono), '') is not null then
    v_lead := (public.registrar_lead_interno(
      p_telefono, p_nombre,
      (case when p_origen in ('owner-sell', 'ad-sell') then 'propietario' else 'interesado' end)::public.tipo_lead,
      'web', coalesce(p_detalle ->> 'canal_detalle', 'Sitio web'), p_email,
      coalesce(p_consentimiento, false), coalesce(p_consentimiento_marketing, false), null, p_nota
    ) ->> 'lead_id')::uuid;
    if cardinality(v_inmuebles) > 0 then
      update public.leads set inmueble_interes_id = v_inmuebles[1] where id = v_lead;
    end if;
  end if;

  foreach v_id in array v_inmuebles loop
    perform public.registrar_evento('interes_web', v_lead, coalesce(p_detalle, '{}') || jsonb_build_object('origen', p_origen), v_id);
  end loop;
  return v_lead;
end $$;

revoke all on function public.registrar_lead_web(text, text, text, text, uuid[], text, boolean, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.registrar_lead_web(text, text, text, text, uuid[], text, boolean, jsonb, boolean) to service_role;
