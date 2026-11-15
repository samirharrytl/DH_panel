# Intenciones, perfil del cliente y varios teléfonos: plan de implementación

> **Para agentes:** sub-skill requerida: superpowers:subagent-driven-development o superpowers:executing-plans. Los pasos usan casillas (`- [ ]`).

**Objetivo:** que cada intención de un cliente quede registrada y avise a alguien, que exista un perfil del cliente con toda su trazabilidad y que una persona pueda tener varios teléfonos y unirse a mano con otra.

**Arquitectura:** una migración nueva (`20261115000300_personas_telefonos.sql`) agrega `persona_telefonos`, `sugerencias_union` y `mensajes.telefono`, y reemplaza las funciones que buscan a la persona por teléfono. La lógica vive en SQL (RPC `security definer`), como en el resto del proyecto. La página `/personas/[id]` lee con el cliente del servidor y llama a las RPC desde server actions.

**Tecnologías:** Next.js 16 (App Router; antes de escribir páginas, lee la guía de `node_modules/next/dist/docs/`, como indica AGENTS.md), Supabase Postgres, pruebas SQL en PGlite (`npm run test:sql`).

**Especificación:** `docs/superpowers/specs/2026-11-15-intenciones-y-telefonos-design.md`

## Restricciones globales

- Una sola migración nueva; no se editan las anteriores. Si una función cambia de firma: `drop function` de la firma vieja, `create` de la nueva y repetir sus `revoke` y `grant`.
- Las RPC nuevas: `security definer set search_path = public`, `revoke ... from public, anon` y `grant` a `authenticated` (o a `service_role` si solo las usa el servidor).
- Toda acción deja un evento en `eventos` con `persona_id`; `autor_id` = `auth.uid()` (nulo = Sistema).
- Interfaz en español (Perú) y usable desde el celular.
- Teléfonos normalizados con `public.normalizar_telefono`.

## Puntos de revisión

1. Llega una intención desde un **teléfono secundario** → se suma a la persona correcta, no crea otra.
2. Un WhatsApp entrante desde un teléfono secundario → mismo chat y misma persona; la respuesta, con la ventana abierta, sale a ese número.
3. Se unen dos personas y una estaba en **Baja** → la persona final y sus leads vigentes quedan en Baja.
4. Un asesor agrega un teléfono que es de un cliente de **otro asesor** → error sin datos del otro cliente.
5. Se intenta unir y el lead que se cerraría tiene una **cita pendiente** → falla con un mensaje que dice qué resolver.

Cada punto tiene su prueba en la tarea correspondiente.

---

### Tarea 0: borrar los datos de prueba (operación, sin código)

Confirmado por el usuario el 2026-11-15. Se conservan `perfiles`, `parametros`, `plantillas` y las suscripciones push.

- [ ] Listar el conjunto que alcanzaría `truncate ... cascade` y comprobar que no incluye `perfiles`, `parametros`, `plantillas` ni `suscripciones_push`.
- [ ] Ejecutar, con `DATABASE_URL`, `truncate public.personas, public.leads, public.mensajes, public.eventos, public.notas, public.notificaciones cascade`.
- [ ] Verificar: `personas`, `leads` y `mensajes` en 0; `perfiles` 3, `parametros` 18, `plantillas` 16.

### Tarea 1: teléfonos por persona

**Archivos:**
- Crear: `supabase/migrations/20261115000300_personas_telefonos.sql`
- Crear: `scripts/probar-sql-personas.mjs` (misma forma que `probar-sql-fases.mjs`: `export function registrar({...})`)
- Modificar: `scripts/probar-sql.mjs`, para importar también `./probar-sql-personas.mjs` junto a `probar-sql-fases.mjs`

**Interfaces que produce:**
- Tabla `persona_telefonos(telefono text pk check '^[0-9]{8,15}$', persona_id uuid not null references personas on delete cascade, principal boolean not null default false, created_at, created_by default auth.uid())`, con un índice único parcial `(persona_id) where principal`. RLS: `select` si `puede_ver_persona(persona_id)`; no hay escritura directa.
- Trigger `after insert on personas`: inserta `(new.telefono, new.id, true)`.
- `persona_por_telefono(p_tel text) returns uuid` (interna, sin grant a authenticated).
- Columna `mensajes.telefono text`. `mensajes_antes_de_guardar` la completa con `personas.telefono` si llega nula.
- `registrar_mensaje(...)` gana `p_telefono text default null` al final (drop y create).
- `registrar_lead_interno`, `registrar_entrante_whatsapp` y `registrar_mensaje_app`: buscan con `persona_por_telefono` en lugar de `where telefono = v_tel`, y los dos de WhatsApp guardan `mensajes.telefono = v_tel`. Partir de la **última** definición de cada uno (fase2, fase5 y coexistencia, respectivamente).
- RPC para `authenticated`:
  - `agregar_telefono(p_persona uuid, p_telefono text) returns void`. Si el número es de otra persona: el administrador o quien puede verla recibe `'Ese número ya es de otro cliente (id: <uuid>). Únelos desde su perfil'`; quien no puede verla recibe `'Ese número ya pertenece a otro cliente; pide a un administrador que los una'`. Evento `telefono_agregado {telefono}`.
  - `quitar_telefono(p_persona uuid, p_telefono text) returns void`. Si es el principal: `'No se puede quitar el teléfono principal'`. Evento `telefono_quitado {telefono}`.
  - `marcar_principal(p_persona uuid, p_telefono text) returns void`. Actualiza `persona_telefonos` y `personas.telefono`. Evento `telefono_principal {anterior, nuevo}`.
  - Las tres exigen `puede_ver_persona(p_persona)`.

- [ ] **Paso 1: escribir las pruebas (fallan)** en `probar-sql-personas.mjs`:
  - `'Teléfonos: una persona nueva tiene su teléfono principal'`: después de `registrar(ASESORA, '911000001', 'Tel Uno', 'interesado')`, `select count(*) from persona_telefonos where telefono = '51911000001' and principal` = 1.
  - `'Teléfonos: una intención desde un número secundario se suma a la misma persona'`: `agregar_telefono(persona, '911000002')`, luego `registrar(..., '911000002', ...)` devuelve el mismo `persona_id` y `resultado` = `'ya_activo'`.
  - `'Teléfonos: un WhatsApp desde el secundario cae en la misma persona y guarda el número'`: `registrar_entrante_whatsapp` desde `51911000002` deja `mensajes.persona_id` = persona y `mensajes.telefono` = `'51911000002'`.
  - `'Teléfonos: no se quita el principal; marcar principal cambia personas.telefono'`, y los eventos `telefono_agregado` y `telefono_principal` existen con `autor_id` = ASESORA.
  - `'Teléfonos: un número de otro asesor da error sin datos'`: OTRO registra `'911000003'`; ASESORA hace `agregar_telefono(suPersona, '911000003')` → error que coincide con `/pide a un administrador/` y no contiene el uuid.
- [ ] **Paso 2:** `npm run test:sql` → las nuevas fallan y las existentes pasan.
- [ ] **Paso 3:** escribir la migración con lo descrito en Interfaces.
- [ ] **Paso 4:** `npm run test:sql` → todo pasa.
- [ ] **Paso 5:** commit `Personas: varios teléfonos por persona`.

### Tarea 2: intenciones registradas, avisos y sugerencia por correo

**Archivos:**
- Modificar: `supabase/migrations/20261115000300_personas_telefonos.sql`
- Modificar: `app/api/v1/leads/route.ts` (pasar el detalle completo)
- Modificar: `scripts/probar-sql-personas.mjs`

**Interfaces:**
- `registrar_lead_interno(...)` gana `p_detalle jsonb default '{}'` al final (drop y create; mismos revokes). El evento `lead_registrado`/`lead_regreso` guarda `datos = p_detalle || {resultado, canal, canal_detalle, telefono: v_tel, email: p_email, tipo: p_tipo}`.
- En los casos `retomado`, `ya_activo` y `baja`: si `v_lead.asesor_id` es nulo → `notificar_admins('lead_regreso', 'Un lead volvió a escribir', ..., '/leads/' || id)`.
- `registrar_lead_web(...)` (última definición, en `20261115000200_pauta_digital.sql`): pasa `coalesce(p_detalle,'{}') || {origen, mensaje: p_nota, inmuebles: v_inmuebles}` como `p_detalle`. `registrar_lead` pasa `'{}'`.
- Tabla `sugerencias_union(id bigint identity pk, persona_a uuid references personas on delete cascade, persona_b uuid references personas on delete cascade, motivo text not null default 'correo', estado text not null default 'pendiente' check in ('pendiente','aceptada','descartada'), resuelta_por uuid, resuelta_at timestamptz, created_at)`, con un índice único `(least(persona_a,persona_b), greatest(persona_a,persona_b))`. RLS: `select` si `puede_ver_persona(persona_a) or puede_ver_persona(persona_b)`.
- En `registrar_lead_interno`: si `lower(trim(p_email))` coincide con el `email` de otra persona → `insert ... on conflict do nothing` y evento `union_sugerida {otra_persona, motivo:'correo'}` en las dos. Se avisa al asesor del lead solo si `puede_ver_persona` para ese asesor da verdadero sobre las dos; si no, a los administradores. Enlace `'/personas/' || persona`.
- `descartar_sugerencia(p_id bigint) returns void` (authenticated; exige ver las dos personas, o ser administrador): estado `descartada` y evento `union_descartada` en las dos.

- [ ] **Paso 1: pruebas (fallan):**
  - `'Intenciones: una intención repetida queda como evento con su detalle'`: dos `registrar_lead_web` con origen `'ad-buy'` y el mismo teléfono → 2 eventos `lead_registrado`/`lead_regreso` para la persona, el segundo con `datos->>'origen'` = `'ad-buy'` y `datos->>'telefono'` correcto; sigue habiendo 1 lead vigente de interesado.
  - `'Intenciones: sin asesor avisa a los administradores'`: el segundo registro web genera una notificación `lead_regreso` para ADMIN.
  - `'Sugerencia: el mismo correo con otro teléfono crea una sugerencia pendiente'`: y `descartar_sugerencia` la pasa a `descartada`, con evento `union_descartada`.
- [ ] **Paso 2:** `npm run test:sql` → fallan.
- [ ] **Paso 3:** implementar.
- [ ] **Paso 4:** `npm run test:sql` y `npm run typecheck` → pasan.
- [ ] **Paso 5:** commit `Intenciones: cada intención queda registrada y avisa; sugerencia de unión por correo`.

### Tarea 3: unir personas

**Archivos:** misma migración y `scripts/probar-sql-personas.mjs`.

**Interfaces:**
- `unir_personas(p_queda uuid, p_absorbida uuid, p_leads_que_siguen uuid[] default '{}') returns void` (authenticated). Orden:
  1. Exige `puede_ver_persona` sobre las dos y que sean distintas.
  2. Por cada tipo en que las dos tienen un lead vigente: el lead que sigue debe estar en `p_leads_que_siguen`; si falta → `'Elige qué lead de <tipo> sigue'`. El otro lead es el que se cierra.
  3. Si el que se cierra está en `cliente`, tiene una cita o visita con estado agendada en el futuro, o una compraventa en curso → error que nombra lo que hay que resolver. Revisar en las migraciones de las fases 3, 4 y 7 los nombres reales de las tablas y estados.
  4. Lead que se cierra: `vigente = false`, refuerzos pendientes → `cancelado`, evento `lead_cerrado_por_union {lead_que_sigue}`.
  5. `update ... set persona_id = p_queda` en `leads`, `mensajes`, `eventos` e `inmuebles`; `persona_telefonos` con `principal = false`; `sugerencias_union` de la absorbida → `aceptada`, o se borran si quedan apuntando a la misma persona.
  6. Datos de la persona: completar con `coalesce` los vacíos (`email`, `genero`, `horario_preferido`, `medio_contacto`, `intencion`); `ultimo_entrante_at = greatest(...)`; si alguna de las dos tenía `no_contactar` → `no_contactar = true` y sus leads vigentes que no estén en `baja` ni en `cliente` pasan a `baja` con refuerzos cancelados (misma lógica que `dar_baja`, sin su chequeo de permisos).
  7. Evento `personas_unidas` en `p_queda` con `{absorbida: to_jsonb(fila), telefonos: [...], leads_que_siguen, leads_cerrados, movidos: {leads, mensajes, eventos, inmuebles}}`.
  8. `delete from personas where id = p_absorbida`.

- [ ] **Paso 1: pruebas (fallan):**
  - `'Unir: exige elegir el lead cuando las dos tienen uno vigente del mismo tipo'`: sin elección → `/Elige qué lead/`.
  - `'Unir: mueve todo, cierra el otro lead y deja la copia de la absorbida'`: después de unir, `count(*) from mensajes/leads/eventos where persona_id = absorbida` = 0, `personas` sin la absorbida, el teléfono de la absorbida está en `persona_telefonos` de `p_queda` y el evento `personas_unidas` tiene `datos->'absorbida'->>'nombre'`.
  - `'Unir: la Baja gana'`: la absorbida en Baja → `p_queda.no_contactar` y su lead vigente en `baja`.
  - `'Unir: bloquea si el lead que se cierra tiene una cita pendiente'`.
  - `'Unir: un asesor no une con un cliente de otro asesor'`: ASESORA intenta unir con una persona de OTRO → error de acceso.
- [ ] **Paso 2:** `npm run test:sql` → fallan.
- [ ] **Paso 3:** implementar.
- [ ] **Paso 4:** `npm run test:sql` → pasan.
- [ ] **Paso 5:** commit `Personas: unir dos registros con trazabilidad`.

### Tarea 4: a qué número se envía

**Archivos:** modificar `lib/mensajeria.ts` y `app/(panel)/chats/acciones.ts` (envío manual).

- `enviarMensaje`: con la ventana abierta, destino = `telefono` del último mensaje `entrante` de la persona (`mensajes` ordenados por `created_at desc limit 1`), o `persona.telefono` si es nulo. Sin ventana (plantilla), destino = `persona.telefono` (el principal). Pasar `p_telefono: destino` a `registrar_mensaje`.
- Registro manual en el chat: `p_telefono` = el principal.
- [ ] **Paso 1:** implementar.
- [ ] **Paso 2:** `npm run typecheck` y `npm run lint` → sin errores.
- [ ] **Paso 3:** commit `WhatsApp: con la ventana abierta se responde al número que escribió`.

### Tarea 5: perfil del cliente

**Archivos:**
- Crear: `app/(panel)/personas/[id]/page.tsx` y `app/(panel)/personas/[id]/acciones.ts`
- Modificar: `app/(panel)/leads/[id]/secciones/historial.tsx` (exportar `EVENTOS` y agregar etiquetas: `telefono_agregado`, `telefono_quitado`, `telefono_principal`, `union_sugerida`, `union_descartada`, `personas_unidas`, `lead_cerrado_por_union`, `persona_nueva_whatsapp`, `interes_web`)
- Modificar: `app/(panel)/leads/[id]/encabezado.tsx` (el nombre enlaza a `/personas/{persona.id}`) y `app/(panel)/chats/page.tsx` (enlace “Ver perfil” en la conversación abierta)

**Contenido** (componentes existentes: `Tarjeta`, `Badge`, `Dialogo`, `Formulario`, `BotonEnviar`):
- Encabezado: nombre, correo, `No contactar` si corresponde.
- Teléfonos: lista con “Principal”; acciones agregar, quitar y hacer principal (`agregar_telefono`, `quitar_telefono`, `marcar_principal`).
- Sugerencias pendientes (`sugerencias_union` con `estado = 'pendiente'`): “Posible misma persona: <nombre>” con los botones Unir y Descartar.
- Leads: todos los de la persona (vigentes y anteriores) con tipo, estado, asesor, ciclo y enlace a su ficha.
- Línea de tiempo: `eventos where persona_id = id` y `notas` de sus leads, de más nueva a más vieja, con autor o “Sistema”. Las intenciones (`lead_registrado`, `lead_regreso`) se destacan y muestran origen, teléfono, mensaje y UTM de `datos`.
- Unir: diálogo para buscar a la otra persona por teléfono o nombre (solo entre las que el usuario puede ver), elegir el lead que sigue por cada tipo en conflicto y confirmar → `unir_personas`. Después, redirigir al perfil que queda.
- Si la persona no existe o no se puede ver: `notFound()`.

- [ ] **Paso 1:** leer la guía de Next 16 sobre páginas dinámicas y server actions en `node_modules/next/dist/docs/`.
- [ ] **Paso 2:** implementar.
- [ ] **Paso 3:** `npm run typecheck`, `npm run lint` y `npm run build` → sin errores.
- [ ] **Paso 4:** recorrido en local (`npm run dev`): registrar dos intenciones con el mismo correo y distinto teléfono, ver la sugerencia, unir y revisar la línea de tiempo.
- [ ] **Paso 5:** commit `Personas: perfil del cliente con teléfonos, intenciones y trazabilidad`.

### Tarea 6: despliegue

- [ ] `npm run test:sql` → todo pasa.
- [ ] `npm run db:migrar` → aplica `20261115000300_personas_telefonos.sql`.
- [ ] `git push origin main` → Vercel despliega.
