-- Fase 1: base, usuarios, parámetros y plantillas (HU-01 a HU-04)

create type public.rol_usuario as enum ('administrador', 'asesor');

-- Un perfil por usuario de Supabase Auth. Los usuarios no se borran: se desactivan (HU-02).
create table public.perfiles (
  id uuid primary key references auth.users (id),
  nombre text not null,
  email text not null,
  telefono text,
  rol public.rol_usuario not null default 'asesor',
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.tocar_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger perfiles_updated_at before update on public.perfiles
  for each row execute function public.tocar_updated_at();

create or replace function public.es_usuario_activo() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and activo);
$$;

create or replace function public.es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.perfiles where id = auth.uid() and activo and rol = 'administrador'
  );
$$;

create or replace function public.hoy_lima() returns date
language sql stable as $$
  select (now() at time zone 'America/Lima')::date;
$$;

-- Siempre debe quedar al menos un administrador activo.
create or replace function public.proteger_ultimo_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.rol = 'administrador' and old.activo
     and (new.rol <> 'administrador' or not new.activo)
     and not exists (
       select 1 from public.perfiles
       where id <> old.id and rol = 'administrador' and activo
     ) then
    raise exception 'Debe quedar al menos un administrador activo';
  end if;
  return new;
end $$;

create trigger perfiles_ultimo_admin before update on public.perfiles
  for each row execute function public.proteger_ultimo_admin();

-- Parámetros configurables (HU-03)
create table public.parametros (
  clave text primary key,
  nombre text not null,
  descripcion text not null,
  grupo text not null,
  tipo text not null check (tipo in ('entero', 'lista_enteros', 'lista_texto', 'nivel_financiero', 'texto')),
  unidad text,
  valor jsonb not null,
  valor_defecto jsonb not null,
  orden int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.perfiles (id)
);

create or replace function public.tocar_autor() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

create trigger parametros_autor before update on public.parametros
  for each row execute function public.tocar_autor();

create or replace function public.param(p_clave text) returns jsonb
language sql stable security definer set search_path = public as $$
  select valor from public.parametros where clave = p_clave;
$$;

create or replace function public.param_int(p_clave text) returns int
language sql stable security definer set search_path = public as $$
  select (valor #>> '{}')::int from public.parametros where clave = p_clave;
$$;

create or replace function public.param_texto(p_clave text) returns text
language sql stable security definer set search_path = public as $$
  select valor #>> '{}' from public.parametros where clave = p_clave;
$$;

insert into public.parametros (clave, nombre, descripcion, grupo, tipo, unidad, valor, valor_defecto, orden) values
  ('sesion_inactividad_min', 'Cierre de sesión por inactividad',
   'Minutos sin actividad tras los que se cierra la sesión.',
   'Acceso', 'entero', 'minutos', '30', '30', 10),
  ('refuerzos_dias', 'Días de los refuerzos',
   'Días después de la bienvenida (Día 0) en que toca cada refuerzo. La cantidad de días es la cantidad de refuerzos.',
   'Seguimiento', 'lista_enteros', 'días', '[1, 3, 4]', '[1, 3, 4]', 20),
  ('novedades_no_responde_dias', 'Frecuencia de novedades a leads sin respuesta',
   'Cada cuántos días reciben novedades los leads en "No responde" que aceptaron marketing.',
   'Seguimiento', 'entero', 'días', '30', '30', 30),
  ('retorno_plazo_meses', 'Plazo para retomar a un lead que regresa',
   'Dentro de este plazo se retoma la conversación donde quedó; después se trata como nuevo, con su historial.',
   'Seguimiento', 'entero', 'meses', '6', '6', 40),
  ('novedades_tope_dias', 'Tope de novedades a un interesado',
   'Mínimo de días entre dos novedades a un mismo interesado activo.',
   'Interesados', 'entero', 'días', '7', '7', 50),
  ('match_max_opciones', 'Opciones por envío de match',
   'Máximo de inmuebles en un mismo envío.',
   'Interesados', 'entero', 'inmuebles', '3', '3', 60),
  ('nivel_visita', 'Nivel financiero para agendar visita',
   'Nivel mínimo de capacidad financiera para agendar una visita.',
   'Interesados', 'nivel_financiero', null, '"declarada"', '"declarada"', 70),
  ('nivel_compraventa', 'Nivel financiero para iniciar la compraventa',
   'Nivel mínimo de capacidad financiera para iniciar la compraventa.',
   'Interesados', 'nivel_financiero', null, '"precalificada"', '"precalificada"', 80),
  ('insights_frecuencia_dias', 'Frecuencia de insights al propietario',
   'Cada cuántos días se envía al propietario el resumen de interés de su inmueble.',
   'Propietarios', 'entero', 'días', '7', '7', 90),
  ('contrato_aviso_dias', 'Aviso de vencimiento de contrato',
   'Cuántos días antes del vencimiento del contrato avisa la plataforma.',
   'Propietarios', 'entero', 'días', '30', '30', 100),
  ('redes_difusion', 'Redes de difusión diaria',
   'Redes donde se publica a diario. Se ofrecen al registrar una publicación.',
   'Difusión', 'lista_texto', null,
   '["Facebook", "Instagram", "TikTok", "Canal de WhatsApp"]',
   '["Facebook", "Instagram", "TikTok", "Canal de WhatsApp"]', 110),
  ('whatsapp_numero', 'Número de WhatsApp de DepaHost',
   'Número con código de país y sin "+" (por ejemplo 51987654321). Se usa en los enlaces de las publicaciones.',
   'Difusión', 'texto', null, '""', '""', 120),
  ('testimonio_dias', 'Plazo para pedir testimonio',
   'Días después del cierre en que se pide testimonio y reseña.',
   'Postventa', 'entero', 'días', '7', '7', 130),
  ('resena_google_url', 'Enlace para la reseña en Google',
   'Enlace directo que se envía al pedir la reseña.',
   'Postventa', 'texto', null, '""', '""', 140);

-- Plantillas de mensajes (HU-04). Variables entre corchetes; lo que va entre llaves { } solo aparece
-- si todas sus variables tienen valor.
create table public.plantillas (
  clave text primary key,
  nombre text not null,
  categoria text not null check (categoria in (
    'bienvenida', 'refuerzo', 'retorno', 'match', 'novedades', 'cita', 'recordatorio', 'visita',
    'insights', 'testimonio'
  )),
  descripcion text,
  cuerpo text not null,
  cuerpo_defecto text not null,
  meta_nombre text,
  meta_idioma text not null default 'es',
  orden int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.perfiles (id)
);

create trigger plantillas_autor before update on public.plantillas
  for each row execute function public.tocar_autor();

insert into public.plantillas (clave, nombre, categoria, descripcion, cuerpo, cuerpo_defecto, orden)
select clave, nombre, categoria, descripcion, cuerpo, cuerpo, orden from (values
  ('bienvenida_propietario', 'Bienvenida a propietario', 'bienvenida',
   'Día 0. Se envía en cuanto entra el lead.',
   'Hola [nombre], vemos que dejaste tu intención en uno de nuestros canales ([canal]).{ Nos escribiste por [inmueble].} Soy [asesor], de DepaHost. ¿Conversamos sobre la venta de tu inmueble?', 10),
  ('bienvenida_interesado', 'Bienvenida a interesado', 'bienvenida',
   'Día 0. Se envía en cuanto entra el lead.',
   'Hola [nombre], vemos que dejaste tu intención en uno de nuestros canales ([canal]).{ Te interesó [inmueble].} Soy [asesor], de DepaHost. ¿Te cuento más y vemos qué estás buscando?', 20),
  ('refuerzo_1', 'Refuerzo 1: recordar sin presionar', 'refuerzo',
   'Primer refuerzo si no responde a la bienvenida.',
   'Hola [nombre], te escribimos ayer y no pudimos encontrarte. Sé que tienes el día lleno. Cuando puedas, aquí estamos.', 30),
  ('refuerzo_2', 'Refuerzo 2: aportar valor', 'refuerzo',
   'Segundo refuerzo.',
   'Hola [nombre], en DepaHost acompañamos toda la compraventa{ en [distrito]}: publicación diaria, interesados con su financiamiento validado, visitas y firma. Si quieres, te cuento cómo podemos ayudarte.', 40),
  ('refuerzo_3', 'Refuerzo 3: último intento, puerta abierta', 'refuerzo',
   'Último refuerzo.',
   'Hola [nombre], te dejamos este mensaje por si quieres retomarlo cuando te acomode. Aquí estaremos.', 50),
  ('retorno', 'Lead que regresa', 'retorno',
   'Para retomar la conversación con quien vuelve dentro del plazo.',
   'Hola [nombre], la última vez conversamos sobre [tema]. ¿Seguimos por ahí o buscas algo distinto? ¿En qué horario te escribimos?', 60),
  ('match', 'Envío de matches', 'match',
   'Inmuebles sugeridos por el motor de match.',
   'Hola [nombre], tengo estos, que hacen match con lo que buscas:

[opciones]', 70),
  ('novedades', 'Novedad para un interesado', 'novedades',
   'Inmueble nuevo en la base que encaja con su perfil.',
   'Hola [nombre], entró a nuestra base un inmueble que encaja con lo que buscas:

[opciones]

Si prefieres no recibir novedades, respóndenos NO.', 80),
  ('novedades_general', 'Novedades del mes', 'novedades',
   'Para leads en "No responde" que aceptaron marketing y para clientes en postventa.',
   'Hola [nombre], te compartimos las novedades de DepaHost.{

[opciones]}

Si quieres retomar la conversación, respóndenos este mensaje. Si prefieres no recibir más mensajes, respóndenos NO.', 90),
  ('cita_confirmacion', 'Confirmación de cita con propietario', 'cita',
   'Se envía al agendar la cita.',
   'Hola [nombre], confirmamos nuestra cita el [fecha] a las [hora] en [direccion]. Si necesitas reprogramar o cancelar, respóndenos por aquí.', 100),
  ('visita_confirmacion', 'Confirmación de visita', 'cita',
   'Se envía al agendar la visita de un interesado.',
   'Hola [nombre], confirmamos la visita a [inmueble] el [fecha] a las [hora], en [direccion]. Si necesitas reprogramar o cancelar, respóndenos por aquí.', 110),
  ('recordatorio_24h', 'Recordatorio 24 horas antes', 'recordatorio',
   'Recordatorio de cita o visita un día antes.',
   'Hola [nombre], te recordamos nuestra cita de mañana, [fecha] a las [hora], en [direccion]. Si necesitas reprogramar, respóndenos por aquí.', 120),
  ('recordatorio_mismo_dia', 'Recordatorio el mismo día', 'recordatorio',
   'Recordatorio de cita o visita el mismo día.',
   'Hola [nombre], hoy nos vemos a las [hora] en [direccion]. ¡Hasta pronto!', 130),
  ('opinion_visita', 'Opinión tras la visita', 'visita',
   'Se pide después de la visita.',
   'Hola [nombre], gracias por visitar [inmueble]. ¿Qué te pareció? Tu opinión nos ayuda a encontrar lo que buscas.', 140),
  ('insights', 'Resumen de insights al propietario', 'insights',
   'Resumen periódico de interés del inmueble.',
   'Hola [nombre], este es el resumen de interés de tu inmueble [inmueble]:

[resumen]

Cualquier duda, aquí estamos.', 150),
  ('testimonio', 'Pedido de testimonio y reseña', 'testimonio',
   'Se envía unos días después del cierre.',
   'Hola [nombre], gracias por confiar en DepaHost. ¿Nos ayudas con una reseña? Te toma un minuto:{ [enlace_resena]}

Y si nos autorizas, nos encantaría compartir tu testimonio en nuestras redes. ¿Te parece?', 160)
) as t(clave, nombre, categoria, descripcion, cuerpo, orden);

-- Si el administrador agrega refuerzos, se crea su plantilla copiando la del último refuerzo.
create or replace function public.sincronizar_plantillas_refuerzo() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_total int := jsonb_array_length(new.valor);
  v_base public.plantillas%rowtype;
begin
  if new.clave <> 'refuerzos_dias' then
    return new;
  end if;
  for n in 1..v_total loop
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

create trigger parametros_refuerzos after update on public.parametros
  for each row execute function public.sincronizar_plantillas_refuerzo();

-- Validación de valores de parámetros
create or replace function public.validar_parametro() returns trigger
language plpgsql as $$
begin
  if new.tipo = 'entero' and (jsonb_typeof(new.valor) <> 'number' or (new.valor #>> '{}')::numeric < 0) then
    raise exception 'El parámetro "%" debe ser un número entero mayor o igual a 0', new.nombre;
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

create trigger parametros_validar before insert or update on public.parametros
  for each row execute function public.validar_parametro();

-- RLS
alter table public.perfiles enable row level security;
alter table public.parametros enable row level security;
alter table public.plantillas enable row level security;

create policy perfiles_leer on public.perfiles for select to authenticated
  using (public.es_usuario_activo() or id = auth.uid());
create policy perfiles_admin_editar on public.perfiles for update to authenticated
  using (public.es_admin()) with check (public.es_admin());

create policy parametros_leer on public.parametros for select to authenticated
  using (public.es_usuario_activo());
create policy parametros_admin_editar on public.parametros for update to authenticated
  using (public.es_admin()) with check (public.es_admin());

create policy plantillas_leer on public.plantillas for select to authenticated
  using (public.es_usuario_activo());
create policy plantillas_admin_editar on public.plantillas for update to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- Permisos explícitos: Supabase concede todo por defecto a anon y authenticated en tablas nuevas
grant usage on schema public to authenticated, service_role;
revoke all on public.perfiles, public.parametros, public.plantillas from anon, authenticated;
grant select on public.perfiles, public.parametros, public.plantillas to authenticated;
-- Los perfiles se crean desde el servidor con la clave secreta; el rol y el estado solo los cambia el admin
grant update (nombre, telefono, rol, activo) on public.perfiles to authenticated;
grant update (valor) on public.parametros to authenticated;
grant update (cuerpo, meta_nombre, meta_idioma) on public.plantillas to authenticated;
grant all on public.perfiles, public.parametros, public.plantillas to service_role;
