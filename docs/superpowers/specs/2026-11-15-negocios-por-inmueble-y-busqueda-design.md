# Varios inmuebles por propietario, varias búsquedas por interesado e identificación visual del tipo

Fecha: 2026-11-15 · Estado: aprobado por el usuario (2026-11-15)

## Por qué

En DepaHost va a ser frecuente que:

- un **propietario** venda **varios inmuebles** a la vez;
- un **interesado** tenga **varias búsquedas** distintas (por ejemplo, un depa para vivir y un terreno para invertir);
- una persona **venda y compre** al mismo tiempo.

Hoy el lead es **persona × tipo** (con ciclos en el tiempo). La ficha de calificación del propietario (`calificacion_propietario`) y el perfil de búsqueda (`busquedas`) son **uno por lead** (su PK es `lead_id`), así que un segundo inmueble pisa al primero y no caben dos búsquedas. Vender y comprar a la vez ya funciona (dos leads en paralelo), pero no se ve que una operación dependa de la otra.

Además, el usuario pidió que **se identifique a simple vista si algo es de propietario o de interesado**.

## Enfoque elegido (A)

El **lead** pasa a ser la **relación** con la persona para un tipo: contacto, bienvenida, refuerzos, consentimiento, asesor y ciclo. La unidad del negocio pasa a ser:

- para el propietario, **el inmueble**: tiene su propia ficha de captación, citas, contrato y avance;
- para el interesado, **la búsqueda**: tiene su propio perfil y sus matches.

Enfoques descartados:

- **B. Un lead por inmueble o búsqueda:** duplica la bienvenida, los refuerzos y el consentimiento a la misma persona, y cada mensaje de WhatsApp tendría que decidir a qué lead pertenece.
- **C. Dejarlo como está:** los casos van a ser frecuentes.

## Objetivos

1. Un lead de propietario tiene **N inmuebles**, cada uno con su ficha de captación, sus citas, su contrato y su **etapa**.
2. Un lead de interesado tiene **N búsquedas**, cada una con su perfil y sus matches. La capacidad financiera sigue siendo una por lead, porque es de la persona.
3. Vínculo opcional **“vende para comprar”** entre el lead de interesado y el de propietario de la misma persona.
4. **Identificación visual del tipo** en todo el panel.
5. Sin perder la trazabilidad: cada inmueble y cada búsqueda nuevos, y cada cambio de etapa, quedan en la bitácora con fecha y autor.

## No objetivos

- No cambia la cadencia (bienvenida y refuerzos): sigue siendo por lead.
- No se crea un lead por inmueble ni por búsqueda.
- No se calcula automáticamente cuánto aporta la venta a la capacidad financiera: el vínculo es informativo.

## Anti-objetivos

- Que un propietario con dos inmuebles reciba dos bienvenidas o dos cadencias.
- Que el Tablero (leads por etapa, conversiones) deje de cuadrar.
- Que se pierdan los datos de calificación que ya existen.

## Diseño

### 1. Propietario: el inmueble como unidad

**Ficha de captación por inmueble.** Los datos de `calificacion_propietario` se reparten así:

- **Pasan a la persona** (son comunes a todos sus leads y se editan en la ficha del cliente, sección 8): preferencia de contacto y horario.
- **Pasan al inmueble** (pueden variar por inmueble): rol (propietario o encargado) y poder o autorización para firmar, porque alguien puede ser dueño de un inmueble y encargado de otro. También tipo, dirección, distrito, metraje, dormitorios, baños, cochera, precio esperado, hipoteca (banco y saldo), urgencia o plazo, inscripción en SUNARP y copropietarios.

El implementador mapea columna por columna con esa regla.

**El inmueble se crea al empezar la captación**, no después de la primera cita:

- Botón **“Agregar inmueble”** en la ficha del lead de propietario. Se crea en estado `en_captacion` y etapa `calificando`.
- `registrar_resultado_cita` deja de insertar un inmueble y actualiza el inmueble de la cita (fotos, estado del inmueble, precio acordado).
- Las citas de propietario quedan asociadas a **un inmueble**; la columna `citas.inmueble_id` ya existe y pasa a ser obligatoria para las citas de tipo propietario.

**Etapa de captación.** Columna nueva `inmuebles.etapa_captacion`, que solo aplica mientras el estado es `en_captacion`: `calificando` → `cita_agendada` → `cita_realizada`. Al registrar el contrato, el inmueble pasa a `en_cartera` como hoy. La etapa avanza sola con las acciones (agendar cita, registrar resultado), y cada cambio deja un evento `etapa_inmueble` con fecha y autor.

**Estado del lead de propietario (decisión del implementador).** Se mantiene el enum actual. El lead refleja **el inmueble más avanzado**; `avanzar_estado` ya solo avanza, así que el Tablero sigue cuadrando. El lead pasa a Cliente con el primer contrato.

**Nueva intención de un propietario que ya es Cliente (decisión del implementador; regla nueva).** Hoy abre un ciclo nuevo. Con este diseño, **el lead de propietario sigue siendo el mismo**: la intención se registra y el asesor agrega el inmueble nuevo. El ciclo nuevo solo se abre si pasó el plazo de retorno sin interacción. Para el interesado no cambia: si ya compró (es Cliente), una intención nueva abre un ciclo nuevo.

### 2. Interesado: varias búsquedas

- `busquedas` pasa a tener `id` como PK, con `lead_id` como FK (N por lead), más `nombre` (por ejemplo, “Depa para vivir”) y `activa` (boolean). Las búsquedas que ya existen se conservan.
- `calcular_match(lead, inmueble)` evalúa el inmueble contra **cada búsqueda activa** y se queda con la de **mejor puntaje**. `match_opciones` gana `busqueda_id`, para registrar con qué búsqueda hizo match: así lo usará el modelo predictivo.
- `sugerir_matches`, `interesados_para_inmueble` (novedades, HU-24) y `priorizar_interes` consideran todas las búsquedas activas.
- La pestaña de matches agrupa las sugerencias por búsqueda.
- La capacidad financiera y el nivel siguen siendo por lead.
- El estado del lead de interesado no cambia (refleja lo más avanzado: match enviado, visita, compraventa).

### 3. Vende para comprar

- Columna `leads.vende_para_comprar boolean` en el lead de interesado. Solo se puede marcar si la misma persona tiene un lead de propietario vigente.
- Se muestra en los dos leads (“Compra sujeta a la venta de DH-0012…”) y en el perfil del cliente. Marcarlo o desmarcarlo deja un evento.

### 4. Identificación visual del tipo

Un componente único, `TipoLead`, que se usa en todos los lugares donde aparece el tipo: bandeja, vista por intención, ficha del lead, perfil del cliente, Chats, Agenda y Tablero.

| Tipo | Color | Ícono (lucide) | Texto |
| --- | --- | --- | --- |
| Propietario | violeta (`bg-violet-100 text-violet-800`) | `House` | Propietario |
| Interesado | turquesa (`bg-teal-100 text-teal-800`) | `Search` | Interesado |

Son colores que no usan los estados (verde = éxito, rojo = Baja, ámbar = aviso, azul o marino = etapas), así que tipo y estado no se confunden. En las listas (bandeja e intenciones), además, cada fila lleva un **borde izquierdo** del color del tipo:

```
▌Juan Pérez        +51 911 000 111   [🏠 Propietario]  [En conversación]   DH-0012 · Cita agendada · DH-0015 · Calificando
▌Juan Pérez        +51 911 000 111   [🔍 Interesado]   [Match enviado]     2 búsquedas · Vende para comprar
(▌ violeta = propietario, ▌ turquesa = interesado)
```

En la bandeja, las filas de propietario muestran sus inmuebles con su etapa, y las de interesado, cuántas búsquedas activas tienen.

### 5. Trazabilidad

Eventos nuevos, con `persona_id`, `lead_id` y, cuando aplica, `inmueble_id`: `inmueble_agregado`, `etapa_inmueble`, `busqueda_agregada`, `busqueda_desactivada` y `vende_para_comprar`. Se muestran en la línea de tiempo del perfil y en el historial del lead.

### 6. Datos existentes

La migración:

- Por cada `calificacion_propietario` cuyo lead ya tenga un inmueble, copia los datos del inmueble a ese inmueble. Si no lo tiene, crea un inmueble `en_captacion` con esos datos y una etapa calculada a partir de sus citas.
- Asocia las citas de propietario sin inmueble al inmueble del lead.
- Convierte cada búsqueda en la búsqueda “Principal” de su lead.

### 8. Sección Contactos (pedido del usuario)

El lead es **la gestión** (embudo, cadencia, asesor). La persona es **el perfil centralizado**: los datos comunes viven en un solo lugar y todos sus leads los usan.

- **Nueva entrada en el menú, “Contactos”**, junto a Leads. Se eligió ese nombre para no chocar con el glosario, donde “Cliente” es quien ya firmó contrato o ya compró. En la interfaz, la ficha se llama “Ficha del contacto”. Muestra la lista de personas con búsqueda por nombre, cualquier teléfono o correo, y filtros por relación (solo propietario, solo interesado, ambos), asesor, Baja y fecha. Cada fila muestra los leads de la persona con el distintivo de tipo de la sección 4 y su estado.
- **Ficha del contacto** (la página `/personas/[id]` que ya existe), donde se **editan los datos comunes**: nombre, correo, teléfonos, género (para personalizar mensajes solo si está confirmado), horario preferido, medio de contacto preferido e intención de marketing (invertir, comprar otro inmueble, vender). Hoy algunos de estos datos se editan en la ficha del lead. Pasan a editarse solo en la ficha del cliente, y la ficha del lead los muestra en solo lectura con un enlace.
- Además de lo que ya tiene (teléfonos, leads, sugerencias de unión, línea de tiempo y unir), la ficha muestra todos los **inmuebles** de la persona (como propietaria) y sus **búsquedas** (como interesada), y el resumen de **consentimiento** de cada lead (Ley 29733: sigue siendo por lead).
- Cada cambio de un dato común deja un evento `persona_editada` con el valor anterior y el nuevo, la fecha y el autor.
- RLS sin cambios: el asesor ve solo las personas con algún lead asignado a él (`puede_ver_persona`).

### 7. Documentos fuente

Se actualizan `docs/historias-de-usuario.md` (HU-13, HU-14, HU-15, HU-19, HU-22, HU-24) y las secciones 1.2, 1.5, 2.2 y “Estados del lead y del inmueble” de `docs/especificacion.md`, para que reflejen “una ficha de captación por inmueble” y “varias búsquedas por interesado”.

### 9. Decisiones tras la revisión del diseño

- **Datos sensibles del inmueble (decisión del implementador).** Hoy todos los usuarios leen `inmuebles`, porque la base y el match la necesitan. Los datos sensibles de captación (hipoteca, banco y saldo, urgencia, copropietarios, situación legal, rol y poder) van a una tabla aparte, `inmueble_captacion` (1:1 con el inmueble), con la misma regla de acceso que hoy tiene `calificacion_propietario`: el administrador y el asesor del lead. En `inmuebles` quedan los datos públicos (tipo, dirección, distrito, metraje, dormitorios, baños, cochera, precios y acceso). Así nadie ve más que hoy.
- **Inmueble en captación con datos incompletos (decisión del implementador).** Tipo, dirección y distrito pueden quedar vacíos mientras el inmueble está `en_captacion`, y se exigen al pasar a `en_cartera`.
- **Vende para comprar (decisión del implementador).** En vez de un booleano, `leads.lead_venta_id` apunta al lead de propietario de la misma persona. Se muestran sus inmuebles con su estado. Si ese lead sale (Descartado, Baja) o todos sus inmuebles se venden o retiran, el vínculo queda y se muestra como “venta cerrada” o “sin venta activa”.
- **Rechazos en el match (decisión del implementador).** Un “No me interesa” excluye el inmueble para todo el lead, no solo para una búsqueda, como hoy.
- **Modelo predictivo (decisión del implementador).** `v_dataset_propietarios` pasa a tener una fila por inmueble, con los datos de la persona y del lead como atributos, porque la firma es por inmueble. La probabilidad que ve el administrador (HU-35, aún inactiva) es por inmueble.
- **Cliente deja de ser un estado final (decidido por el usuario).** Cliente significa “ya cerró al menos un negocio”. Un lead en Cliente **sigue operando** mientras tenga inmuebles en captación o búsquedas activas: agenda citas y visitas, recibe matches y novedades y avanza la etapa de sus inmuebles. La búsqueda que terminó en compra queda `cumplida` (inactiva) y las demás siguen activas. Si se abre un ciclo nuevo (pasó el plazo de retorno sin interacción), los inmuebles abiertos (en captación o en cartera) y las búsquedas activas **pasan al lead del ciclo nuevo**; lo cerrado (vendidos, retirados, búsquedas cumplidas o inactivas) queda en el ciclo anterior. La postventa (testimonio y reseña) sigue siendo por cada compraventa cerrada. Esto reemplaza lo dicho en la sección 1 sobre la nueva intención de un propietario Cliente: para los dos tipos, una intención nueva de un lead Cliente se suma al mismo lead mientras no venza el plazo.
- **Baja con leads en Cliente (decisión del implementador).** `dar_baja` también cancela las citas programadas de los leads en Cliente, para que un contacto en Baja no reciba recordatorios.

## Restricciones

- Migraciones nuevas versionadas; RLS según el rol (el asesor ve los inmuebles y búsquedas de sus leads).
- Interfaz en español (Perú) y usable desde el celular.
- Pruebas SQL en `scripts/probar-sql*.mjs` para cada regla nueva; las 62 actuales deben seguir pasando.

## Lo que se deja al implementador

- El mapeo exacto de columnas de `calificacion_propietario`, siguiendo la regla de la sección 1.
- El diseño de “Agregar inmueble” y “Agregar búsqueda” con los componentes existentes.
- Cómo se ve la etapa del inmueble en `/inmuebles`: filtro por etapa dentro de “En captación”.
