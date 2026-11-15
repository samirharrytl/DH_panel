# Intenciones visibles, perfil del cliente y varios teléfonos por persona

Fecha: 2026-11-15 · Estado: borrador para aprobación

## Por qué

Cuando un mismo cliente deja varias intenciones (formularios de la web, pautas, etc.), el administrador solo ve una por tipo: la primera como propietario y la primera como interesado. Las siguientes se pierden: hoy se suman como nota al lead vigente y solo avisan si ese lead tiene asesor asignado. Además, el historial es por lead, así que nadie ve en un solo lugar todo lo que pidió la persona.

Se quiere:

1. Ver **todas** las intenciones de un cliente.
2. Que todo quede registrado, con trazabilidad, en un **perfil del cliente**.
3. Que el cliente se identifique por su teléfono, pero que pueda tener **varios teléfonos**.

## Cómo funciona hoy (lo relevante)

- `personas.telefono` es único: un solo teléfono por persona. Se busca a la persona por teléfono en tres funciones: `registrar_lead_interno` (fase 2), la de mensajes entrantes de WhatsApp (fase 5) y `registrar_mensaje_app` (coexistencia).
- `leads_un_vigente_por_tipo`: como máximo un lead vigente por (persona, tipo). Una intención repetida del mismo tipo cae en `registrar_lead_interno` como `ya_activo` o `retomado`. Se agrega una nota y un evento `lead_regreso`, y se avisa solo a `v_lead.asesor_id`. Si es nulo, no se avisa a nadie.
- `eventos` ya tiene `persona_id`, `autor_id` (`auth.uid()`, nulo = Sistema) y `datos jsonb`. Es la bitácora que se usará.
- Tablas que apuntan a `personas`: `leads`, `eventos`, `mensajes`, `inmuebles`. Todo lo demás (citas, matches, notas, refuerzos, visitas…) apunta a `leads`, así que se mueve solo al mover los leads.

## Objetivos

- Cada intención queda como un evento con todos sus datos y avisa a alguien.
- Página **Perfil del cliente** (`/personas/[id]`): datos, teléfonos, leads (vigentes y anteriores) y una línea de tiempo con las intenciones y la trazabilidad de la persona.
- Varios teléfonos por persona; cualquiera la identifica.
- El asesor une a dos personas a mano. El panel sugiere la unión cuando coincide el correo.
- Trazabilidad completa, con fecha y autor, de intenciones, cambios de teléfonos, sugerencias y uniones.

## No objetivos

- No cambia la bandeja: sigue mostrando un lead vigente por tipo.
- No se separa una persona ya unida (no hay “deshacer unión”). La copia de datos del evento permite reconstruirla a mano si hiciera falta.
- No se detectan duplicados por nombre ni por otros datos; solo por correo.

## Anti-objetivos (sería un fracaso aunque funcione)

- Que una intención repetida vuelva a disparar la bienvenida o los refuerzos.
- Que una unión pierda historial (mensajes, citas, matches, eventos) o lo deje huérfano.
- Que una persona en Baja vuelva a recibir mensajes por haberse unido con otra.

## Enfoques considerados

- **A. Evento por intención y perfil del cliente (elegido).** Se reutilizan `eventos` y el modelo de un lead vigente por tipo. Es lo más pequeño y no duplica datos.
- B. Tabla propia de intenciones. Más fácil de filtrar en el Tablero, pero guarda el mismo hecho dos veces. Descartado por ahora; se puede derivar de `eventos` si el Tablero lo necesita.
- C. Un lead nuevo por intención. Descartado: repite la bienvenida y los refuerzos y rompe “una persona, un registro”.

## Diseño

### 1. Teléfonos

Tabla nueva `persona_telefonos`:

| columna | tipo | nota |
| --- | --- | --- |
| telefono | text, PK | normalizado, mismo `check` que `personas.telefono` |
| persona_id | uuid → personas, not null | |
| principal | boolean | exactamente uno por persona (índice único parcial) |
| created_at, created_by | | |

- **`personas.telefono` se mantiene** como copia del teléfono principal, para que no cambie el código TypeScript que lo lee (envíos, encabezados, chats).
- Un trigger `after insert on personas` inserta su teléfono en `persona_telefonos` como principal. Así, los tres puntos que crean personas no cambian.
- La migración rellena `persona_telefonos` con los teléfonos actuales.
- Función `persona_por_telefono(tel)`: reemplaza los tres `where telefono = v_tel`.
- RPC del panel, con el permiso `puede_ver_persona`:
  - `agregar_telefono(persona, tel)`. Si el número ya es de otra persona, falla y devuelve el id de esa persona; la interfaz ofrece unirlas.
  - `quitar_telefono(persona, tel)`. No se puede quitar el principal.
  - `marcar_principal(persona, tel)`. Actualiza también `personas.telefono`.
  - Cada uno registra un evento (`telefono_agregado`, `telefono_quitado`, `telefono_principal`) con el valor anterior y el nuevo.

**WhatsApp con varios números (decidido):** la ventana de 24 horas es por número. Se agrega `mensajes.telefono`, el número por el que entró o salió cada mensaje.

- **Con la ventana abierta**, se responde al **número del último mensaje entrante**. Como `personas.ultimo_entrante_at` es justamente el de ese mensaje, el cálculo de la ventana sigue siendo correcto.
- **Sin ventana**, las plantillas (refuerzos, novedades, recordatorios, insights, testimonio) van al **principal**.

La regla vive en `lib/mensajeria.ts` (`enviarMensaje`), por donde pasan todos los envíos.

### 2. Intenciones

- “Intención” = cada evento `lead_registrado` o `lead_regreso`. Hoy ya se crean uno por registro (panel, web, atribución de WhatsApp). No hay tipo nuevo.
- `registrar_lead_interno` recibe un `p_detalle jsonb` opcional y lo guarda en `datos` del evento, junto con el teléfono y el correo con que llegó. `registrar_lead_web` le pasa origen, mensaje, detalles, UTM e inmuebles. La nota de texto se mantiene, para que la ficha del lead siga igual.
- **Siempre se avisa:** en los casos `ya_activo`, `retomado` y `baja`, si el lead no tiene asesor, se llama a `notificar_admins` en vez de no avisar a nadie. Los leads nuevos y los ciclos nuevos ya avisan por el trigger `leads_despues`.
- No se repite la bienvenida ni los refuerzos (sin cambios en ese flujo).

### 3. Sugerencia por correo

Tabla `sugerencias_union` (`persona_a`, `persona_b`, `motivo` = 'correo', `estado` pendiente | aceptada | descartada, `resuelta_por`, `resuelta_at`, `created_at`). Índice único sobre el par ordenado, para no repetir la misma sugerencia.

- En `registrar_lead_interno`, si el correo recibido (comparado en minúsculas) pertenece a **otra** persona, se crea la sugerencia y se avisa (al asesor del lead o, si no tiene, a los administradores). Evento `union_sugerida` en las dos personas.
- Descartarla registra `union_descartada`. Aceptarla abre el flujo de unión.
- **Privacidad (decisión del implementador):** si el asesor del lead no puede ver a la otra persona, la sugerencia se avisa solo a los administradores. Del mismo modo, `agregar_telefono` responde “Ese número ya pertenece a otro cliente; pide a un administrador que los una” sin dar datos de la otra persona.
- **Datos existentes:** son de prueba y se borrarán antes de aplicar la migración, así que no se rellenan teléfonos, mensajes ni sugerencias. El alcance exacto del borrado se confirma aparte.

### 4. Unión de personas

RPC `unir_personas(p_queda, p_absorbida, p_leads_que_siguen uuid[])`, en una sola transacción:

- **Permiso:** `puede_ver_persona` sobre las dos. Si el asesor no ve a la otra persona porque es de otro asesor, solo puede unirlas el administrador.
- **Conflictos de leads:** si las dos tienen un lead vigente del mismo tipo, el asesor **elige cuál sigue** (`p_leads_que_siguen`). La función falla si falta la elección. El otro pasa a `vigente = false` y se cancelan sus refuerzos pendientes, con un evento `lead_cerrado_por_union` que apunta al lead que sigue.
- **Bloqueos (decisión del implementador):** la unión falla, con un mensaje que dice qué resolver primero, si el lead que se cerraría tiene una cita o visita agendada pendiente, una compraventa en curso o está en estado `cliente`. Así nada queda atado a un lead invisible. Sus matches, notas y demás quedan en su historial, visibles desde el perfil.
- **Consentimiento (decisión del implementador):** es por lead (Ley 29733), así que cada lead conserva el suyo y no se combinan. El lead que sigue no gana un consentimiento de marketing que no dio.
- **Baja (decisión del implementador):** si cualquiera de las dos personas estaba en Baja, la persona que queda queda en Baja y sus leads vigentes pasan a `baja`, con los refuerzos cancelados, igual que en `dar_baja`.
- **Se mueven** a `p_queda`: `leads`, `mensajes`, `eventos`, `inmuebles.persona_id`, `persona_telefonos` (como secundarios) y las sugerencias.
- **Datos de la persona:** se conservan los de `p_queda` y los vacíos se completan con los de la absorbida. `no_contactar` queda en verdadero si cualquiera de las dos lo tenía (la Baja gana). `ultimo_entrante_at` toma el mayor.
- **Trazabilidad:** evento `personas_unidas` en `p_queda`, con autor, una copia completa de la fila absorbida y de sus teléfonos, los leads elegidos y los cerrados, y cuántas filas se movieron por tabla.
- Al final se borra la fila absorbida.

### 5. Perfil del cliente (`/personas/[id]`)

- **Encabezado:** nombre, correo, Baja, intención de marketing.
- **Teléfonos:** lista con el principal marcado. Acciones: agregar, quitar y hacer principal.
- **Sugerencias pendientes:** aviso “Posible misma persona: [nombre]” con botones Unir y Descartar.
- **Leads:** vigentes y de ciclos anteriores, con tipo, estado y asesor, y enlace a su ficha.
- **Línea de tiempo:** eventos con `persona_id` = la persona, ordenados por fecha, con su autor (o “Sistema”). Las intenciones se destacan y muestran su origen, el teléfono usado, el mensaje y los inmuebles. Se reutilizan las etiquetas de `EVENTOS` de `secciones/historial.tsx`, con las de los eventos nuevos agregadas.
- **Unir:** botón “Unir con otra persona” → buscar por teléfono o nombre → si hay conflicto de leads vigentes, elegir cuál sigue por tipo → confirmar.
- **Enlaces de entrada:** desde el encabezado de la ficha del lead y desde Chats.

### 6. Seguridad (RLS)

- `persona_telefonos` y `sugerencias_union` se pueden leer si se cumple `puede_ver_persona`. Solo se escriben con las RPC (`security definer`).
- Las RPC nuevas revocan el acceso a `public` y `anon`, como las existentes.

## Restricciones

- Migración nueva versionada en `supabase/migrations/`, sin editar las anteriores. Las funciones existentes se reemplazan con `create or replace` (las que cambian de firma: `drop` y `create`, revisando los `grant`).
- Interfaz en español (Perú) y usable desde el celular.
- Cada cambio queda con fecha y autor.

## Lo que se deja al implementador

- Diseño visual del perfil, siguiendo los componentes existentes (`Tarjeta`, `Badge`, `Dialog`).
- Cómo buscar a la persona con la que se unirá.
- Nombres exactos de los eventos y textos de las notificaciones.
- Pruebas: como mínimo, pruebas SQL de `unir_personas` (conflicto con elección, Baja que gana, nada huérfano) y de la búsqueda por un teléfono secundario.
