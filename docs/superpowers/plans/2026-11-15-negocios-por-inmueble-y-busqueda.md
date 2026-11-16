# Varios inmuebles por propietario, varias búsquedas, Contactos e identificación del tipo: plan de implementación

> **Para agentes:** sub-skill requerida: superpowers:executing-plans (elegida por el usuario). Los pasos usan casillas (`- [ ]`).

**Objetivo:** que un propietario lleve varios inmuebles a la vez (cada uno con su ficha de captación, citas y etapa), que un interesado tenga varias búsquedas, que Cliente deje de ser un estado final, que exista la sección Contactos y que el tipo de lead se reconozca a simple vista.

**Arquitectura:** una migración nueva, `supabase/migrations/20261115000600_negocios_por_inmueble.sql`, que crece tarea a tarea. La lógica vive en SQL (RPC `security definer` y triggers), como en el resto del proyecto, y las pantallas leen con RLS. Las funciones que cambian de firma se borran y se vuelven a crear con sus `revoke` y `grant`.

**Tecnologías:** Next.js 16 (lee la guía de `node_modules/next/dist/docs/` antes de crear rutas), Supabase Postgres y pruebas SQL en PGlite (`npm run test:sql`).

**Especificación:** `docs/superpowers/specs/2026-11-15-negocios-por-inmueble-y-busqueda-design.md`. Inventario de lo que se toca: el informe del agente de exploración, resumido en cada tarea. Abreviaturas de las migraciones: M2 = `…000200_fase2_leads.sql`, M3 = `…000300_fase3_inmuebles.sql`, M4 = `…000400_fase4_match.sql`, M7 = `…000700_fase7_cierre.sql`, MP = `20261115000300_personas_telefonos.sql`, MU = `20261115000400_unir_personas_baja_citas.sql`.

## Restricciones globales

- No se editan migraciones anteriores. Toda función reemplazada parte de su **última** definición (ver “Dónde”).
- Cada acción nueva deja un evento con `persona_id`, `lead_id` y `inmueble_id` cuando aplica; `autor_id = auth.uid()`.
- RLS: el asesor ve solo lo de sus leads; los datos públicos del inmueble siguen visibles para todo usuario activo; los datos sensibles de captación, no.
- Interfaz en español (Perú) y usable desde el celular.
- Las 62 pruebas actuales siguen pasando; las que cambian de comportamiento se actualizan en la tarea dueña, dejando el motivo en el ledger.

## Puntos de revisión

1. Un propietario con **dos inmuebles en captación** agenda una cita sin elegir inmueble → error “Elige el inmueble”, sin cita creada.
2. Un propietario **Cliente** deja otra intención dentro del plazo → mismo lead, sin ciclo nuevo; puede agregar otro inmueble y agendar.
3. Un interesado cierra una compraventa → la búsqueda de esa compra queda cumplida, y otra búsqueda activa sigue recibiendo novedades.
4. Un asesor **sin** el lead → no lee `inmueble_captacion` (hipoteca, saldo), pero sí el inmueble público para el match.
5. **Datos existentes en producción:** después de migrar, cada `calificacion_propietario` quedó en un inmueble (conteos antes y después en la Tarea 9).

Cada punto tiene su prueba en la tarea correspondiente.

---

### Tarea 1: el inmueble como unidad de captación (SQL)

**Archivos:** crear la migración y `scripts/probar-sql-negocios.mjs` (misma forma que `probar-sql-personas.mjs`), e importarla en `scripts/probar-sql.mjs`.

**Interfaces que produce:**
- `inmuebles`: `tipo`, `direccion` y `distrito` dejan de ser `not null`; check `inmuebles_datos_fuera_de_captacion check (estado = 'en_captacion' or (tipo is not null and direccion is not null and distrito is not null))`. Columna `etapa_captacion text check (etapa_captacion in ('calificando','cita_agendada','cita_realizada'))`, nula fuera de captación. Recrear `v_inmuebles` (usa `i.*`) a partir de su última definición (`20261112000100_sitio_web.sql:15`).
- Tabla `inmueble_captacion(inmueble_id uuid pk references inmuebles on delete cascade, rol_contacto, tiene_poder, hipoteca, hipoteca_banco, hipoteca_saldo, urgencia, inscrito_sunarp, copropietarios, copropietarios_detalle, notas, updated_at, updated_by)`, con los mismos checks que `calificacion_propietario` (M3:9) y el trigger `tocar_autor`. RLS select, insert y update con `puede_ver_captacion(inmueble_id)` = `puede_ver_lead(i.propietario_lead_id)` (admin incluido); grants select, insert, update a authenticated.
- `agregar_inmueble(p_lead_id uuid, p_tipo text default null, p_direccion text default null, p_distrito text default null, p_precio_esperado numeric default null) returns uuid`: exige `puede_ver_lead`, lead de tipo propietario, vigente y no en Baja. Inserta el inmueble `en_captacion` / `calificando` con `persona_id`, `propietario_lead_id` y `asesor_id` del lead, más su fila vacía en `inmueble_captacion`. Evento `inmueble_agregado`.
- `agendar_cita`: firma nueva con `p_inmueble_id uuid default null` al final (borrar y crear; repetir los grants). Si es nulo y el lead tiene exactamente un inmueble `en_captacion`, usa ese; si tiene más de uno → `'Elige el inmueble de la cita'`; si no tiene ninguno → `'Agrega primero el inmueble'`. El inmueble debe ser del lead y estar `en_captacion`. Se quita el bloqueo por Cliente (M3:240). La etapa pasa a `cita_agendada` y se registra el evento `etapa_inmueble {de, a}`.
- `registrar_resultado_cita` (M3:356): ya **no inserta** inmuebles; usa `cita.inmueble_id` (obligatorio). Lee `inmueble_captacion` en lugar de `calificacion_propietario` para `precio_esperado`. Etapa `cita_realizada` y evento.
- `cancelar_cita` (M3:296): si era la única cita programada del inmueble, la etapa vuelve a `cita_realizada` si ese inmueble ya tuvo una realizada, o a `calificando` si no. Evento.
- `registrar_contrato` (M3:433): al pasar a `en_cartera`, `etapa_captacion = null` y se exigen tipo, dirección y distrito (mensaje claro).
- **Migración de datos:** por cada fila de `calificacion_propietario`: si el lead tiene inmuebles, copia los campos sensibles a `inmueble_captacion` del más reciente y completa los públicos que estén vacíos; si no tiene, crea un inmueble `en_captacion` con los públicos (tipo, dirección, distrito, metraje, dormitorios, baños, cochera → cocheras 1/0, precio_esperado) y su `inmueble_captacion`, con la etapa según sus citas. Asigna `citas.inmueble_id` a las citas de propietario sin inmueble, cuando el lead tiene un solo inmueble.

- [x] **Paso 1: pruebas (fallan)** en `probar-sql-negocios.mjs`:
  - `'Inmuebles: un propietario agrega dos inmuebles en captación'`: dos `agregar_inmueble` → 2 filas con etapa `calificando` y dos eventos `inmueble_agregado`.
  - `'Inmuebles: con dos inmuebles la cita exige elegir'` (punto 1): `agendar_cita` sin `p_inmueble_id` → `/Elige el inmueble/`, y la cuenta de citas no cambia; con `p_inmueble_id` → etapa `cita_agendada` solo en ese inmueble.
  - `'Inmuebles: el resultado de la cita actualiza el inmueble, no crea otro'`: la cuenta de inmuebles del lead no cambia; etapa `cita_realizada`; precio y metraje actualizados.
  - `'Inmuebles: cancelar la única cita devuelve la etapa'`.
  - `'Inmuebles: la captación sensible solo la ve el asesor del lead'` (punto 4): OTRO lee `inmueble_captacion` → 0 filas; lee `inmuebles` → 1 fila.
  - `'Inmuebles: el contrato exige tipo, dirección y distrito'`.
- [x] **Paso 2:** `npm run test:sql` → las nuevas fallan. Las que dejan de valer en `probar-sql-fases.mjs` (HU-13 `:11`, HU-14 `:21`, HU-15 `:37`) se reescriben con `agregar_inmueble` + `inmueble_captacion` en este mismo paso, manteniendo lo que validan (RLS, recordatorios, ficha creada).
- [x] **Paso 3:** implementar.
- [x] **Paso 4:** `npm run test:sql` → todo pasa.
- [x] **Paso 5:** commit `HU-13/14/15: el inmueble es la unidad de captación`.

### Tarea 2: Cliente deja de ser un estado final (SQL)

**Interfaces:**
- `avanzar_estado` (M2:330) y `marcar_respuesta_lead` (M2:350): ya no cortan por `cliente`, solo por `baja`. Un lead en Cliente no cambia de estado (es el más alto en `orden_estado`), pero registra la respuesta y la interacción.
- `registrar_lead_interno` (MP:70, última versión en MP): se quita `v_lead.estado = 'cliente' or`. Dentro del plazo, un Cliente cae en `ya_activo`. En un **ciclo nuevo** (plazo vencido), pasa al lead nuevo los inmuebles con `propietario_lead_id` = el anterior y estado en (`en_captacion`, `en_cartera`) y las búsquedas activas (Tarea 3; si la columna aún no existe, esta parte se agrega en la Tarea 3). Evento `ciclo_traspaso {inmuebles, busquedas}`.
- `dar_baja` (M3:540) y `unir_personas` (MU:2): los leads en Cliente también cancelan sus refuerzos pendientes y citas programadas, sin cambiar de estado.
- `registrar_inmueble` (20261113000100): no cambia; deja de abrir un ciclo nuevo como consecuencia de lo anterior.

- [x] **Paso 1: pruebas (fallan):**
  - `'Cliente: un propietario Cliente que vuelve sigue en el mismo lead'` (punto 2): firma el contrato del inmueble A → Cliente; `registrar` de nuevo → `resultado = 'ya_activo'`, mismo `lead_id`; `agregar_inmueble` y `agendar_cita` funcionan.
  - `'Cliente: pasado el plazo, el ciclo nuevo se lleva los inmuebles abiertos'`.
  - `'Cliente: la Baja cancela las citas de un lead Cliente'`.
  - Invertir `fases:133` (HU-22: “un cliente no puede agendar otra cita”): ahora puede, si el inmueble está en captación.
- [x] **Paso 2:** `npm run test:sql` → fallan.
- [x] **Paso 3:** implementar.
- [x] **Paso 4:** `npm run test:sql` → pasan.
- [x] **Paso 5:** commit `Leads: Cliente sigue operando mientras tenga negocios abiertos`.

### Tarea 3: varias búsquedas por interesado (SQL)

**Interfaces:**
- `busquedas`: columna `id uuid not null default gen_random_uuid()` como PK nueva (se quita la PK por `lead_id`), índice en `lead_id`, `nombre text not null default 'Principal'`, `activa boolean not null default true` y `cumplida_at timestamptz`. RLS y grants sin cambios. `derivacion_despues_de_guardar` (M4:133) no toca búsquedas: sin cambios.
- `busqueda_despues_de_guardar` (M4:85): evento `busqueda_agregada` al insertar y `perfil_busqueda` al editar, con `busqueda_id`; `busqueda_desactivada` cuando `activa` pasa a false.
- `calcular_match_busqueda(p_busqueda_id uuid, p_lead_id uuid, p_inmueble_id uuid) returns jsonb`: la lógica actual de `calcular_match` (M4:183) aplicada a una búsqueda (o a ninguna si es nula). `calcular_match(p_lead_id, p_inmueble_id)` mantiene su firma y devuelve el de mayor puntaje entre las búsquedas activas (o el de ninguna, si no hay), con `busqueda_id` y `busqueda_nombre` dentro del jsonb. La exclusión `rechazado` sigue siendo por lead.
- `sugerir_matches` (M4:281): firma de retorno con `busqueda_id uuid` y `busqueda_nombre text` al final (borrar y crear).
- `match_opciones.busqueda_id uuid references busquedas on delete set null`; `registrar_envio_match` (M4:339) lo llena desde `calcular_match`.
- `interesados_para_inmueble` (M4:391): la lista de estados permitidos incluye `cliente`, y exige que el lead tenga al menos una búsqueda activa.
- `cerrar_compraventa` (M7:25): marca como cumplida (`activa = false`, `cumplida_at = now()`) la búsqueda del último `match_opciones.busqueda_id` de ese inmueble y lead; si no hay y el lead tiene una sola búsqueda activa, esa. Evento `busqueda_cumplida`.
- `registrar_lead_interno`: completar el traspaso de búsquedas activas al ciclo nuevo (Tarea 2).

- [x] **Paso 1: pruebas (fallan):**
  - `'Búsquedas: un interesado tiene dos búsquedas y el match usa la mejor'`: búsqueda A en Miraflores y búsqueda B de terrenos; un terreno en cartera → `calcular_match(...)->>'busqueda_nombre'` = B.
  - `'Búsquedas: el envío guarda con qué búsqueda hizo match'`.
  - `'Búsquedas: al cerrar, la búsqueda queda cumplida y la otra sigue recibiendo novedades'` (punto 3): después de `cerrar_compraventa`, A queda cumplida, el lead está en Cliente y `interesados_para_inmueble(nuevo terreno)` incluye al lead.
  - Actualizar `fases:115/145/161/174` si dependen de la PK `lead_id` (por ejemplo, `on conflict (lead_id)`).
- [x] **Paso 2:** `npm run test:sql` → fallan.
- [x] **Paso 3:** implementar.
- [x] **Paso 4:** `npm run test:sql` → pasan.
- [x] **Paso 5:** commit `HU-19/22/24: varias búsquedas por interesado`.

### Tarea 4: vende para comprar, bandeja y dataset (SQL)

**Interfaces:**
- `leads.lead_venta_id uuid references leads`. `vincular_venta(p_lead_interesado uuid, p_lead_propietario uuid) returns void`: con `p_lead_propietario` nulo desvincula; exige la misma persona, los tipos correctos y `puede_ver_lead` de los dos. Evento `vende_para_comprar {lead_venta_id}`.
- `v_bandeja`: se recrea a partir de `20261115000500` y se le agregan al final `inmuebles jsonb` (para propietarios: `[{codigo, estado, etapa}]` de los inmuebles del lead que no están vendidos ni retirados), `busquedas_activas int` y `lead_venta_id uuid`.
- `v_dataset_propietarios` (M7:239): pasa a tener una fila por inmueble con `propietario_lead_id`; une `inmuebles` con `inmueble_captacion`; `firmo` es la existencia de un contrato del inmueble. Se conservan los nombres de columna que usa `tablero/page.tsx:122-127` (rol_contacto, precio_esperado, urgencia y demás) y se agrega `inmueble_id`.
- `drop table calificacion_propietario` (al final de la migración, después de mover sus datos y de reemplazar a todos los que la usaban).

- [x] **Paso 1: pruebas (fallan):**
  - `'Vende para comprar: solo entre leads de la misma persona'`.
  - `'Bandeja: el propietario muestra sus inmuebles con su etapa'`.
  - Ajustar `fases:291` (HU-34/35) a una fila por inmueble.
- [x] **Paso 2:** `npm run test:sql` → fallan.
- [x] **Paso 3:** implementar.
- [x] **Paso 4:** `npm run test:sql` → pasan. `grep -rn calificacion_propietario app lib scripts supabase/migrations/20261115000600*` → solo quedan la migración de datos y el `drop`.
- [x] **Paso 5:** commit `Leads: vende para comprar, bandeja con inmuebles y dataset por inmueble`.

### Tarea 5: distintivo visual del tipo

**Archivos:** crear `components/tipo-lead.tsx`; modificar los lugares listados abajo.

**Interfaces:**
- `TipoLead({ tipo, corto? }: { tipo: TipoLead; corto?: boolean })`: un Badge con ícono `House` (propietario, `bg-violet-100 text-violet-800`) o `Search` (interesado, `bg-teal-100 text-teal-800`); `corto` muestra solo el ícono, con `aria-label`.
- `bordeTipo(tipo): string` → `border-l-4 border-l-violet-400` o `border-l-4 border-l-teal-400`, para las filas de las listas.
- Se usa en: `leads/page.tsx` (bandeja `:245` e intenciones `:214`, más el borde de la fila), `leads/[id]/encabezado.tsx:49`, `leads/[id]/secciones/resumen.tsx:328`, `chats/page.tsx:103`, `page.tsx:117` (Hoy), `marketing/page.tsx:171,224`, `personas/[id]/page.tsx:192,220`, `personas/[id]/unir/page.tsx:122,133` y `tablero/page.tsx:58-59`. Los textos de filtros y formularios (`leads/page.tsx:142`, `leads/nuevo`) siguen como texto.
- En la bandeja, las filas de propietario muestran `inmuebles` como chips `DH-0012 · Cita agendada`, y las de interesado `N búsquedas` y “Vende para comprar” cuando `lead_venta_id` no es nulo.

- [x] **Paso 1:** implementar.
- [x] **Paso 2:** `npm run typecheck` y `npx eslint` sobre los archivos tocados → sin errores.
- [x] **Paso 3:** commit `Panel: propietario e interesado se distinguen a simple vista`.

### Tarea 6: pantallas del propietario y del interesado

**Archivos:**
- Propietario: la pestaña `calificacion` del lead se reemplaza por **“Inmuebles”** (`secciones/inmuebles.tsx` y `secciones/inmuebles-acciones.ts`). Se borran `calificacion.tsx` y `calificacion-acciones.ts`, y se ajustan `secciones/citas.tsx`, `agenda/acciones.ts`, `secciones/resumen.tsx`, `lib/mensajeria.ts` (`variablesLead`), `inmuebles/page.tsx`, `inmuebles/[id]/page.tsx`, `inmuebles/acciones.ts` y `leads/[id]/page.tsx`.
- Interesado: `secciones/perfil.tsx`, `secciones/perfil-acciones.ts`, `secciones/matches.tsx` y `matches-selector.tsx` (tipo `Sugerencia` con `busqueda_id` y `busqueda_nombre`); `secciones/cierre.tsx` (`puedeIniciar` admite Cliente con búsqueda activa).

**Contenido:**
- **Inmuebles (propietario):** lista de inmuebles del lead (`v_inmuebles` con `propietario_lead_id`) con estado, etapa y código; botón “Agregar inmueble” (diálogo: tipo, dirección y distrito opcionales → `agregar_inmueble`); por inmueble, la **ficha de captación**: los campos públicos (tipo, dirección, distrito, metraje, dormitorios, baños, cochera, precio esperado) se guardan con `editarInmueble`, y los sensibles en `inmueble_captacion`. Muestra los datos que faltan, como la ficha actual (lógica de `calificacion.tsx:37`), y un enlace a la ficha completa del inmueble.
- **Citas:** el diálogo de agendar tiene un selector de inmueble (obligatorio si hay más de uno en captación) y llena `p_inmueble_id`; las citas se agrupan por inmueble; `puedeAgendar` = hay inmuebles en captación y el lead no está en Baja.
- **`editarInmueble`** (`inmuebles/acciones.ts:33-35`): en captación, tipo, dirección, distrito y precio dejan de ser obligatorios.
- **`/inmuebles`:** filtro “Etapa” (calificando, cita agendada, cita realizada) cuando el estado es En captación; la etapa se muestra en la lista y en la ficha.
- **Perfil del interesado:** lista de búsquedas (nombre, activa o cumplida); “Agregar búsqueda”; editar cada una (`busqueda_id` oculto: si viene, se actualiza; si no, se inserta); desactivar o reactivar. La capacidad financiera queda igual. Aviso de presupuesto (`perfil.tsx:261`) por búsqueda.
- **Vende para comprar:** en el perfil del interesado, un selector con el lead de propietario vigente de la misma persona (o “ninguno”) → `vincular_venta`; en los dos leads, el texto con los inmuebles del propietario y su estado.
- **Matches:** las sugerencias se agrupan por `busqueda_nombre`.
- **`resumen.tsx` y `lib/mensajeria.ts`:** en vez de `.maybeSingle()` sobre `calificacion_propietario` o `busquedas`, toman el inmueble en captación más reciente (`inmuebles`) o la búsqueda activa más reciente (`order('updated_at', desc).limit(1)`).
- `scripts/datos-demo.mjs`: inserta con `agregar_inmueble` + `inmueble_captacion` y búsquedas con `nombre`.

- [ ] **Paso 1:** leer la guía de Next 16 sobre server actions si hace falta.
- [ ] **Paso 2:** implementar.
- [ ] **Paso 3:** `npm run typecheck`, `npm run lint` y `npm run build` → sin errores.
- [ ] **Paso 4:** commit `HU-13/19: pantallas de inmuebles del propietario y de búsquedas del interesado`.

### Tarea 7: sección Contactos

**Archivos:** crear `app/(panel)/contactos/page.tsx`; modificar `app/(panel)/layout.tsx` (ítem `{ href: '/contactos', texto: 'Contactos', icono: 'contactos' }` después de Leads), `components/navegacion.tsx` (clave `contactos: BookUser` en `ICONOS`), `personas/[id]/page.tsx`, `personas/[id]/acciones.ts` y `leads/[id]/secciones/resumen.tsx` (diálogo de contacto).

**Contenido:**
- **`/contactos`:** lista de `personas` (RLS), cada una con sus leads incrustados (`leads(id, tipo, estado, vigente, asesor:perfiles!leads_asesor_id_fkey(nombre))`). Búsqueda por nombre, correo (ilike) o cualquier teléfono (`persona_telefonos`, por dígitos). Filtros: relación (propietario, interesado, ambos), asesor, Baja, “creado desde/hasta”. Cada fila: nombre, teléfono principal, `TipoLead` y estado por cada lead vigente; enlace a `/personas/{id}`. Límite de 300 con aviso.
- **Ficha del contacto (`/personas/[id]`):** título “Ficha del contacto”; tarjeta “Datos” editable (nombre, correo, género, horario preferido, medio de contacto, intención de marketing) → `editarContacto` hace update a `personas` (las columnas ya tienen grant de update y RLS); tarjetas “Inmuebles” (de sus leads de propietario, con estado y etapa) y “Búsquedas” (con activa o cumplida); consentimiento por lead en la tarjeta Leads.
- **Trigger `personas_editada`** (en la migración): `after update` en `personas`; por cada columna que cambió entre nombre, email, genero, horario_preferido, medio_contacto e intencion, registra el evento `persona_editada {campo, antes, despues}` con `persona_id`.
- **`resumen.tsx` (`guardarContacto`):** los datos de la persona se muestran en solo lectura con el enlace “Editar en la ficha del contacto”; en el lead se edita solo `recibe_novedades`.
- `historial.tsx` (`EVENTOS`): etiquetas para `inmueble_agregado`, `etapa_inmueble`, `busqueda_agregada`, `busqueda_desactivada`, `busqueda_cumplida`, `vende_para_comprar`, `ciclo_traspaso` y `persona_editada`.

- [ ] **Paso 1: prueba SQL (falla):** `'Contactos: editar un dato común deja el antes y el después'`.
- [ ] **Paso 2:** `npm run test:sql` → falla.
- [ ] **Paso 3:** implementar el trigger y las pantallas.
- [ ] **Paso 4:** `npm run test:sql`, `npm run typecheck`, `npm run lint` y `npm run build` → sin errores.
- [ ] **Paso 5:** commit `Contactos: lista y ficha centralizada de cada persona`.

### Tarea 8: documentos fuente

- [ ] Actualizar `docs/historias-de-usuario.md` (HU-13, HU-14, HU-15, HU-19, HU-22, HU-24) y `docs/especificacion.md` (1.2, 1.5, 2.2 y “Estados del lead y del inmueble”, incluido “Cliente = cerró al menos un negocio; sigue operando”), y agregar “Contacto” al glosario.
- [ ] Commit `Docs: inmuebles y búsquedas como unidad del negocio; Contactos`.

### Tarea 9: despliegue

- [ ] `npm run test:sql` y `npm run build` → todo pasa.
- [ ] Antes de migrar, contar en producción `calificacion_propietario`, `busquedas` y los inmuebles por lead (solo lectura).
- [ ] `npm run db:migrar`.
- [ ] Después (punto 5): `inmueble_captacion` tiene tantas filas como tenía `calificacion_propietario`, cada búsqueda tiene `id`, y ningún lead de propietario que tenía calificación quedó sin inmueble.
- [ ] Revisión final de toda la rama (agente nuevo), corregir lo crítico e importante, fusionar a `main` y `git push`.
