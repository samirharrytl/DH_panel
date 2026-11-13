# Rediseño del panel: dirección «Verde cierre» con shadcn/ui

Fecha: 2026-11-12 · Estado: borrador para aprobación

## Intención

El panel funciona, pero se ve genérico y se nota que fue generado por IA (tarjetas iguales con la misma sombra gris, emojis como íconos, etiquetas en mayúsculas). Samir quiere una interfaz más fresca, que dé motivación para trabajar dentro todo el día y que transmita que DepaHost está listo para triunfar.

Se eligió una identidad híbrida: el azul marino de la marca (depahostperu.com) con un acento verde de «luz verde, avanzar, crecer». En las maquetas se eligió la dirección **C. Verde cierre** y se pidió construirla sobre **shadcn/ui**.

## Objetivos

- Todo el panel (las 18 páginas, el login y la recuperación de contraseña) con la identidad Verde cierre.
- Componentes de shadcn/ui en lugar del kit propio `components/ui.tsx`.
- Íconos dibujados (lucide-react) en lugar de emojis en todas partes.
- La página «Hoy» rediseñada a fondo: es la pantalla donde más se siente la motivación.
- Igual de usable en el celular que hoy, o mejor.

## Fuera de alcance

- Cambios de reglas de negocio, base de datos, migraciones o acciones del servidor.
- La meta mensual de cierres: Samir pidió no ponerla todavía.
- La publicación de inmuebles en la landing: es un proyecto aparte que va después.
- Modo oscuro: no se pidió.
- Nuevas funciones o cambios de textos de negocio.

## Lo que haría fracasar el proyecto aunque funcione

- **Que se vea como shadcn por defecto** (gris zinc, esquinas y sombras de plantilla). Eso es justamente el aspecto «hecho por IA» que se quiere dejar atrás. El tema debe llevar la identidad Verde cierre en todos los componentes.
- Romper un formulario: hoy todos envían con `<form action={accionDelServidor}>`, campos con `name` y `defaultValue`. Ningún formulario puede dejar de enviar un campo.
- Que en el celular cueste más trabajar (menús que no se abren, tablas que se cortan, selectores incómodos).
- Que se pierdan los enlaces directos a pestañas (`?tab=chat`) o a filtros de la bandeja.

## Identidad visual (decidida en las maquetas)

Maqueta de referencia: `.superpowers/brainstorm/144-1794535714/content/direccion-visual.html`, opción C.

| Rol | Valor |
|---|---|
| Primario (marca) | Azul marino `#012147`; navegación activa, botones principales, títulos |
| Acento de triunfo | Verde `#13a46f` para detalles (puntos, íconos, bordes); los botones verdes usan `#0b7a55` para que el texto blanco tenga un contraste de 5.3:1 |
| Verde claro | `#3ddc97` solo sobre azul (barra o detalles del resumen) y `#dcf5ea` / `#0b6b4a` para etiquetas positivas |
| Fondo | `#f3f7f6` |
| Tarjetas | Blanco, esquinas de 16 px, sin sombra gris genérica |
| Texto | `#17233a`; secundario `#5a6678` |
| Bordes | `#dfe8e5` |
| WhatsApp | Se mantienen los verdes de WhatsApp (`wa-*`) solo para acciones de WhatsApp |

- Tipografía: **Outfit** para títulos, **Rubik** para el texto, ambas con `next/font/google` en lugar de Inter.
- Menú lateral **blanco**, con borde suave, logo «DepaHost» y un punto verde. El ítem activo va en azul marino con texto blanco.
- La página «Hoy» abre con una franja de resumen en degradado azul a verde (`#012147 → #0f3466 → #0b6b52`). Es el único degradado del panel: la audacia se gasta ahí.
- Sin etiquetas en mayúsculas, sin `→` pegado a enlaces o botones y sin unir datos con «·» cuando pueden ir en su propia línea o columna.

## Enfoques considerados

1. **Cambiar las piezas compartidas** (tokens, `ui.tsx`, menú) y repasar lo suelto. Era el más corto, sin dependencias nuevas.
2. **Pasar todo a shadcn/ui.** Reescribe la interfaz sobre una librería mantenida, con componentes accesibles (diálogos, menús, popovers). Suma dependencias y es más trabajo. **Elegido por Samir.**
3. **Solo colores y fuentes.** Se quedaba corto: el menú y los emojis seguían igual.

## Decisiones de construcción

Lo que sigue son decisiones mías, salvo que diga lo contrario. Samir puede corregirlas.

- **Instalación:** `npx shadcn@latest init` sobre Tailwind v4 y React 19. Los componentes van en `components/ui/` con alias `@/components/ui/<componente>`. Se suman `lucide-react` y las dependencias que shadcn instale por componente (Radix, `class-variance-authority`, `clsx`, `tailwind-merge`). Se usa el `cn()` de shadcn en lugar de `cx()`.
- **Choque de nombres:** hoy existe `components/ui.tsx` y shadcn necesita la carpeta `components/ui/`. Primero se renombra el kit actual a `components/legado.tsx` (actualizando sus importaciones) y se borra al terminar la migración. Al final no debe quedar ninguna importación de `legado`.
- **Tema:** las variables de shadcn (`--primary`, `--accent`, `--background`, `--card`, `--border`, `--ring`, `--radius`, `--destructive`) se definen en `app/globals.css` con los valores de la tabla. Los tokens actuales (`marino-*`, `tinta`, `suave`, etc.) se reemplazan por los semánticos de shadcn durante la migración.
- **Selectores en formularios:** se mantiene el `<select>` nativo, con el estilo de shadcn (Native Select si el registro lo trae, o un `<select>` con las clases de `Input`). Motivo: en el celular abre el selector del sistema, y los formularios dependen de `name` y `defaultValue` sin JavaScript extra. El `Select` de Radix queda solo para casos fuera de formularios, si los hay.
- **Casillas:** `Checkbox` de shadcn con `name` y `value`, comprobando que la acción reciba lo mismo que hoy (`"on"` o el valor usado).
- **Diálogos:** el `<dialog>` nativo de `components/formulario.tsx` pasa a `Dialog` de shadcn, y conserva el contexto que lo cierra al guardar.
- **Menú en el celular:** `Sheet` de shadcn en lugar del panel lateral hecho a mano.
- **Campana de notificaciones:** `Popover`.
- **Pestañas:** siguen siendo enlaces (`?tab=`) para no perder los enlaces directos, con el estilo de `Tabs` de shadcn.
- **Mapeo del kit actual:** `Boton`/`EnlaceBoton` → `Button` (con `asChild` para enlaces); `Insignia` → `Badge` con variantes de estado; `Tarjeta` → `Card`; `Entrada`/`AreaTexto` → `Input`/`Textarea`; `Campo` → `Label` + campo + texto de ayuda; `Aviso` → `Alert`; `Tabla` → `Table` (en el celular, las tablas largas pasan a listas); `Vacio` → componente de vacío con un llamado a la acción; `Dato` → lista de definiciones con el nuevo estilo. Las variantes `whatsapp` y `peligro` del botón se mantienen.
- **Avisos de resultado** (pedido por Samir): un aviso emergente pequeño (`Sonner` de shadcn), abajo al centro en el celular y abajo a la derecha en escritorio, con el estilo Verde cierre. Lo muestra `components/formulario.tsx` cuando la acción termina bien y trae mensaje, también dentro de los diálogos, donde hoy el mensaje se pierde al cerrarse. Reemplaza el `Alert` de éxito. Los errores siguen dentro del formulario, junto a los campos, para que no desaparezcan solos.
- **Página «Hoy»:** la franja de resumen muestra datos que ya existen: citas y visitas de hoy, contratos por vencer y cierres del mes en curso (de la tabla de cierres, con la zona horaria de Lima). No muestra metas. Debajo va **«Atiende primero»** (decidido por Samir): los leads con próxima acción vencida o para hoy (`proxima_accion` y `proxima_accion_at`, los mismos datos de la bandeja, limitados por la seguridad por fila), ordenados por fecha. Cada fila muestra el nombre, el tipo y la acción pendiente, y su botón solo abre la ficha del lead, sin ejecutar nada. Después siguen las citas y visitas del día con los avisos que ya calcula la página, y al final los contratos por vencer.
- **Cierres del mes en la franja** (decisión mía): se cuentan las `compraventas` con `estado = 'cerrada'` y `fecha_cierre` en el mes en curso, en la zona horaria de Lima, con la consulta directa que permite la seguridad por fila. El administrador ve todos los cierres y la etiqueta dice «Cierres de noviembre». El asesor ve los suyos y la etiqueta dice «Tus cierres de noviembre».
- **Botones en verde** (decisión mía): una lista cerrada en la variante `exito`, solo para las acciones que hacen avanzar un lead o un inmueble de etapa: dar la bienvenida, agendar una cita o visita, enviar matches, registrar el contrato y registrar el cierre. El resto de acciones principales van en azul marino. El verde va en su propia variable (`--exito`), no en `--accent` de shadcn, para que no tiña el resaltado de los menús.
- **Emojis en textos que se publican o se envían** (decisión mía): los textos que genera `app/(panel)/difusion/texto.ts` (publicaciones e insights) no se cambian, porque son textos de negocio que ven los clientes. La búsqueda final de emojis excluye ese archivo.
- **Instalación con Turbopack:** el proyecto usa `@tailwindcss/turbopack` y no tiene PostCSS. La instalación de shadcn se adapta a eso, sin cambiar el cargador de Tailwind.
- **Copia:** se corrigen solo los textos de botones y vacíos que el estilo vuelva incoherentes (por ejemplo, quitar «→»). Los textos de negocio no cambian.
- **Accesibilidad:** foco visible, contraste mínimo de 4.5:1, objetivos táctiles de 44 px en el celular, `prefers-reduced-motion` respetado y etiquetas en los botones que solo tienen ícono.

## Orden de trabajo

1. Instalación de shadcn, tema, fuentes, renombre del kit a `legado`.
2. Estructura: layout del panel, menú lateral y `Sheet` en el celular, campana, login y recuperación.
3. Componentes compartidos: formulario y diálogo, pestañas, subir archivos, chat, copiar, acciones de cita.
4. Páginas, de la más usada a la menos usada: Hoy, Leads (bandeja, nuevo, ficha y sus secciones), Chats, Agenda, Inmuebles (base y ficha), Difusión, Marketing, Tablero, Configuración.
5. Borrar `legado.tsx`, comprobar que no queden emojis ni tokens viejos, y verificar.

Cada paso deja el panel funcionando, porque las páginas sin migrar siguen usando `legado`.

## Cómo se verifica

- `npm run typecheck`, `npm run lint` y `npm run build` sin errores. `npm run test:sql` sigue pasando (no se toca SQL).
- Recorrido en el navegador de cada página a 375 px y a 1280 px: enviar al menos un formulario por página y abrir cada diálogo, el menú del celular y la campana.
- Búsqueda final sin emojis en `app/` y `components/`, sin `uppercase` en etiquetas y sin importaciones de `legado`.
- Commits por paso con el mensaje `Rediseño: <parte>`. No es una historia de usuario, así que no lleva un ID HU.

## Lo que queda a criterio de quien construye

- Las variantes exactas de `Badge` por estado de lead e inmueble, siempre que los positivos usen el verde y los de salida (Baja, Descartado) un tono neutro o de error.
- El espaciado fino y los tamaños de la escala tipográfica, dentro de Outfit y Rubik.
- Qué tablas pasan a lista en el celular, según su ancho real.
