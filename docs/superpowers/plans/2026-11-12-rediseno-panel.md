# Rediseño del panel «Verde cierre» Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el kit propio `components/ui.tsx` por shadcn/ui con la identidad «Verde cierre» en todo el panel, sin tocar reglas de negocio ni base de datos.

**Architecture:** shadcn/ui en `components/ui/`, con el tema en variables CSS de `app/globals.css`. El kit actual se renombra a `components/legado.tsx` para que las páginas sin migrar sigan funcionando, y se migra por partes hasta borrarlo. Un script de verificación (`scripts/verificar-rediseno.mjs`) define cuándo termina la migración.

**Tech Stack:** Next.js 16.4.5 (App Router, Turbopack), React 19.3, Tailwind v4 con `@tailwindcss/turbopack` (sin PostCSS), shadcn/ui, Radix, lucide-react, sonner, `next/font/google` (Outfit, Rubik).

**Spec:** `docs/superpowers/specs/2026-11-12-rediseno-panel-design.md`

## Global Constraints

- Colores: primario `#012147`; éxito `#13a46f` solo decorativo (puntos, íconos, bordes); relleno de botones verdes `#0b7a55` (el blanco sobre `#13a46f` da 3.2:1 y no llega a 4.5:1; sobre `#0b7a55` da 5.34:1); verde claro `#3ddc97` (solo sobre azul); etiqueta positiva `#dcf5ea` / `#0b6b4a`; fondo `#f3f7f6`; tarjetas blancas; texto `#17233a`; secundario `#5a6678`; bordes `#dfe8e5`; los `wa-*` actuales se conservan para WhatsApp.
- Esquinas: tarjetas de 16 px; controles de 10 px. Sin sombra gris genérica en las tarjetas.
- Fuentes: Outfit para títulos (`--font-titulo`) y Rubik para el texto (`--font-sans`). Inter se elimina.
- Menú lateral blanco con borde `#dfe8e5`, logo «DepaHost» con punto verde, ítem activo `#012147` con texto blanco.
- Único degradado del panel: la franja de «Hoy» (`#012147 → #0f3466 → #0b6b52`).
- Sin etiquetas en mayúsculas, sin `→` en enlaces ni botones, y sin emojis en la interfaz. `app/(panel)/difusion/texto.ts` queda excluido (son textos que se publican).
- El verde vive en su propia variable `--exito`, no en `--accent`.
- Botón verde (`variant="exito"`) solo para: dar la bienvenida, agendar cita o visita, enviar matches, registrar el contrato y registrar el cierre.
- Formularios: siguen con `<form action>`, `name` y `defaultValue`. Los selectores siguen siendo `<select>` nativos. Ningún campo enviado puede cambiar de nombre ni de valor.
- Pestañas: siguen siendo enlaces `?tab=`.
- Sin cambios en `supabase/`, `lib/` (salvo `cn`), acciones del servidor ni textos de negocio.
- Accesibilidad: foco visible, contraste de 4.5:1, objetivos táctiles de 44 px en el celular, `prefers-reduced-motion` y `aria-label` en los botones que solo tienen ícono.
- Commits: `Rediseño: <parte>` con la línea `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- Una casilla (`Checkbox` de Radix) sin marcar o marcada debe enviar exactamente lo mismo que el `<input type="checkbox">` de hoy, porque las acciones leen `datos.get(name)`. Se prueba en la Task 3.
- Si se guarda dentro de un diálogo, el diálogo se cierra y el aviso emergente muestra el mensaje. Si falla, el error queda visible dentro del diálogo abierto. Se prueba en la Task 3.
- El menú del celular (`Sheet`) se cierra al navegar, y la campana se puede usar con el teclado. Se prueba en la Task 2.
- Una tabla ancha a 375 px no debe ensanchar la página: o se desplaza dentro de su caja, o pasa a lista. Se prueba en las Tasks 5 a 8.
- «Atiende primero» con cero leads muestra un vacío con un enlace a la bandeja, no una lista vacía. Se prueba en la Task 4.

---

### Task 1: Base: shadcn, tema, fuentes y kit legado

**Files:**
- Rename: `components/ui.tsx` → `components/legado.tsx` (y las 45 importaciones de `@/components/ui` → `@/components/legado`)
- Create: `components.json`, `lib/utils.ts` (`cn`), `components/ui/{button,badge,card,input,textarea,label,checkbox,alert,table,dialog,sheet,popover,tabs,separator,sonner}.tsx`
- Modify: `app/globals.css`, `app/layout.tsx`, `package.json`
- Create: `scripts/verificar-rediseno.mjs`; agregar el script `"verificar:rediseno"` en `package.json`

**Interfaces:**
- Produces: `cn(...clases): string` en `@/lib/utils`.
- Produces: `Button` con `variant: 'default' | 'exito' | 'outline' | 'ghost' | 'peligro' | 'whatsapp'`, `size: 'sm' | 'default' | 'icon'` y `asChild`. Equivalencias: primario→default, secundario→outline, fantasma→ghost, peligro→peligro, whatsapp→whatsapp.
- Produces: `Badge` con `variant: 'marino' | 'azul' | 'verde' | 'ambar' | 'rojo' | 'gris'`, los mismos nombres que devuelven `colorEstado` y `colorEstadoInmueble` de `lib/catalogos.ts`, para no tocar catálogos.
- Produces: la clase de utilidad `font-titulo` (Outfit) y el color `exito` en el tema (`bg-exito`, `text-exito`).

- [ ] **Step 1:** Escribir `scripts/verificar-rediseno.mjs`. Recorre `app/` y `components/` (`.tsx` y `.ts`), excluye `app/(panel)/difusion/texto.ts` y cuenta cuatro reglas: emojis (`/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u`), la clase `uppercase`, importaciones de `@/components/legado` y tokens viejos (`/\b(?:bg|text|border|ring)-(?:marino|tinta|suave|tenue|borde|fondo)\b/`). Imprime archivo, línea y regla, y sale con código 1 si algo cuenta.
- [ ] **Step 2:** Ejecutar `npm run verificar:rediseno`. Esperado: FALLA y lista los emojis de `app/(panel)/layout.tsx`, entre otros.
- [ ] **Step 3:** Renombrar `components/ui.tsx` a `components/legado.tsx` y actualizar las importaciones con `sed`.
- [ ] **Step 4:** Ejecutar `npx shadcn@latest init`, adaptado a Tailwind v4 con Turbopack sin PostCSS (`components.json` con `"tailwind": { "css": "app/globals.css" }` y la configuración vacía), con los alias `@/components/ui` y `@/lib/utils`. Después, `npx shadcn@latest add` con la lista de componentes de arriba.
- [ ] **Step 5:** En `app/globals.css`, definir las variables de shadcn con los valores de las Global Constraints (`--primary`, `--primary-foreground`, `--background`, `--foreground`, `--card`, `--muted`, `--muted-foreground`, `--border`, `--input`, `--ring: #012147`, `--destructive`, `--radius: 0.625rem`), más `--exito: #0b7a55`, `--exito-foreground: #fff` y `--exito-vivo: #13a46f` (decorativo), expuestas con `@theme inline`. Conservar por ahora los tokens viejos para que `legado` siga funcionando, y conservar `wa-*`.
- [ ] **Step 6:** Agregar las variantes `exito`, `peligro` y `whatsapp` a `button.tsx`, y las seis de `badge.tsx` (marino `#e1e7f0`/`#0f3466`, verde `#dcf5ea`/`#0b6b4a`, y ámbar, rojo, azul y gris en tonos 100/800).
- [ ] **Step 7:** En `app/layout.tsx`, reemplazar Inter por Outfit (`variable: '--font-titulo'`) y Rubik (`variable: '--font-rubik'`), y apuntar `--font-sans` a Rubik.
- [ ] **Step 8:** Ejecutar `npm run typecheck && npm run lint && npm run build`. Esperado: sin errores, y el panel se ve igual salvo la fuente.
- [ ] **Step 9:** Commit: `Rediseño: base con shadcn, tema Verde cierre y kit legado`.

### Task 2: Estructura: layout, menú, campana, aviso emergente y acceso

**Files:**
- Modify: `app/(panel)/layout.tsx`, `components/navegacion.tsx`, `components/campana.tsx`, `app/layout.tsx`, `app/(auth)/layout.tsx`, `app/(auth)/login/page.tsx`, `app/(auth)/recuperar/page.tsx`, `app/(auth)/restablecer/page.tsx`

**Interfaces:**
- Consumes: `Button`, `Sheet`, `Popover`, `Badge` y `cn` (Task 1).
- Produces: `ItemNav = { href: string; texto: string; icono: LucideIcon; contador?: number }`. El icono pasa de string a componente de lucide.
- Produces: `<Toaster />` de `@/components/ui/sonner`, montado una vez en `app/layout.tsx`, abajo al centro en el celular y abajo a la derecha desde `lg`.

- [ ] **Step 1:** Íconos de lucide en el menú: Hoy `Sun`, Leads `Users`, Chats `MessageCircle`, Agenda `CalendarDays`, Inmuebles `House`, Difusión `Megaphone`, Marketing `Mail`, Tablero `ChartColumn`, Configuración `Settings`.
- [ ] **Step 2:** `Navegacion`: en escritorio, una barra lateral blanca fija de `w-60`. En el celular, una barra superior blanca y un `Sheet` desde la izquierda, que se cierra al hacer clic en un enlace. El contador va como `Badge variant="verde"`.
- [ ] **Step 3:** `Campana` con `Popover`. El botón del ícono `Bell` lleva `aria-label="Notificaciones"`.
- [ ] **Step 4:** Rediseñar el pie del menú (nombre, rol y «Cerrar sesión») y las páginas de acceso con `Card`, `Input`, `Label` y `Button`.
- [ ] **Step 5:** Verificar en el navegador a 375 px y a 1280 px: abrir el menú del celular, navegar a Leads (el menú se cierra), abrir la campana con Tab y Enter, iniciar sesión y probar la recuperación. Esperado: todo funciona y no hay desplazamiento horizontal.
- [ ] **Step 6:** `npm run typecheck && npm run lint && npm run build`. Commit: `Rediseño: estructura, menú y acceso`.

### Task 3: Componentes compartidos

**Files:**
- Modify: `components/formulario.tsx`, `components/pestanas.tsx`, `components/subir-archivos.tsx`, `components/copiar.tsx`, `components/acciones-cita.tsx`, `components/chat/chat-cliente.tsx`, `components/chat/chat.tsx`, `components/vigilante-inactividad.tsx`
- Create: `components/campos.tsx`, que reemplaza a `Campo`, `Casilla`, `SiNo`, `Seleccion`, `Dato`, `Vacio`, `Aviso`, `EncabezadoPagina` y `Tabla` de legado

**Interfaces:**
- Consumes: Task 1 y `<Toaster />` (Task 2).
- Produces, en `@/components/campos`: `Campo({ etiqueta, ayuda?, falta?, children, className? })`; `Casilla({ etiqueta, name, defaultChecked?, value?, disabled? })` con un `Checkbox` de Radix que envía `value ?? 'on'` solo si está marcada; `Seleccion(props de <select>)` nativo con las clases de `Input`; `SiNo({ name, valor, disabled? })`; `Dato({ etiqueta, children, className? })`; `Vacio({ children, accion?: ReactNode })`; `Aviso({ tipo: 'info' | 'alerta' | 'error' | 'exito', children, className? })` sobre `Alert`; `EncabezadoPagina({ titulo, descripcion?, acciones?, volver? })` con `font-titulo` y `ChevronLeft` en lugar de «←»; `Tabla({ children })` sobre `Table`, que se desplaza dentro de su caja.
- Produces, en `@/components/formulario`: las mismas exportaciones y firmas de hoy (`Formulario`, `BotonEnviar`, `Dialogo`, `BotonAccion`), con la prop `variante` aceptando los valores de `Button`.

- [ ] **Step 1:** `Formulario`: si termina bien con mensaje, llama a `toast.success(estado.mensaje)`, también dentro de un diálogo, y elimina el `Aviso` de éxito. El error sigue como `Aviso tipo="error"` dentro del formulario.
- [ ] **Step 2:** `Dialogo` sobre `Dialog` de shadcn, conservando `ContextoDialogo` (`cerrar`).
- [ ] **Step 3:** Prueba manual de casillas. Antes de migrar, en un formulario con `Casilla` (por ejemplo, el consentimiento de `leads/nuevo`), agregar temporalmente `console.log([...datos.entries()])` en la acción y anotar lo que envía marcada y sin marcar. Repetir después de migrar. Esperado: salida idéntica. Quitar el `console.log`.
- [ ] **Step 4:** Prueba manual del diálogo: guardar bien en un diálogo (se cierra y aparece el aviso emergente) y forzar un error, por ejemplo enviando un campo obligatorio vacío (el diálogo sigue abierto y muestra el error).
- [ ] **Step 5:** `Pestanas` con el estilo de `Tabs`, siguiendo como enlaces `?tab=`. Su contador como `Badge variant="ambar"`.
- [ ] **Step 6:** Reemplazar los emojis de `subir-archivos`, `copiar`, `chat-cliente` y `formulario` por íconos de lucide (`Upload`, `Copy`, `Check`, `CheckCheck`, `Clock`, `X`), con `aria-hidden` cuando acompañan texto.
- [ ] **Step 7:** `npm run typecheck && npm run lint && npm run build`. Commit: `Rediseño: componentes compartidos y aviso emergente`.

### Task 4: Página «Hoy»

**Files:**
- Modify: `app/(panel)/page.tsx`

**Interfaces:**
- Consumes: `Card`, `Button`, `Badge`, `EncabezadoPagina`, `Vacio` y `cn`.

- [ ] **Step 1:** Consultas nuevas, en el mismo `Promise.all`:
  - Leads por atender: `supabase.rpc('procesar_cadencias')` antes, igual que la bandeja. Después, `v_bandeja` con `vigente = true`, `proxima_accion_at` no nulo y `<= fin de hoy` en Lima, ordenado por `proxima_accion_at`, con límite de 20.
  - Cierres del mes: `compraventas` con `estado = 'cerrada'` y `fecha_cierre >= primer día del mes en Lima`, usando `count: 'exact', head: true`.
- [ ] **Step 2:** La franja de resumen con el degradado de las Global Constraints muestra tres cifras: leads por atender, citas y visitas de hoy, y cierres del mes. La etiqueta es «Cierres de <mes>» para el administrador y «Tus cierres de <mes>» para el asesor. Sin metas ni barra de avance.
- [ ] **Step 3:** «Atiende primero»: cada fila muestra el nombre, el tipo (`Badge`) y la próxima acción con su fecha. Las vencidas llevan `Badge variant="ambar"` con «Vencida». El botón «Abrir» (`variant="outline"`) solo enlaza a `/leads/<id>`. Con cero leads, `Vacio` con un enlace «Ver la bandeja».
- [ ] **Step 4:** Debajo van las citas y visitas del día (con los avisos actuales) y los contratos por vencer, en `Card`.
- [ ] **Step 5:** Verificar con `npm run db:demo` (o datos existentes) a 375 px y a 1280 px: las tres cifras coinciden con la bandeja, la agenda y el tablero. Con un asesor, solo aparecen sus leads.
- [ ] **Step 6:** Commit: `Rediseño: página Hoy`.

### Task 5: Leads

**Files:**
- Modify: `app/(panel)/leads/page.tsx`, `app/(panel)/leads/nuevo/page.tsx`, `app/(panel)/leads/[id]/page.tsx`, `app/(panel)/leads/[id]/encabezado.tsx`, `app/(panel)/leads/[id]/secciones/*.tsx`

- [ ] **Step 1:** Migrar las importaciones de `legado` a `@/components/ui/*` y `@/components/campos`. Reemplazar los tokens viejos por los semánticos (`text-foreground`, `text-muted-foreground`, `border-border`, `bg-background`) y los emojis por íconos de lucide.
- [ ] **Step 2:** Usar el botón verde en «Dar la bienvenida», «Agendar cita», «Agendar visita», «Enviar matches» y «Registrar cierre». Quitar los `→` y las mayúsculas de las cabeceras de tabla.
- [ ] **Step 3:** En la bandeja a 375 px, mostrar una lista de tarjetas compactas en lugar de la tabla (`hidden lg:block` para la tabla y `lg:hidden` para la lista).
- [ ] **Step 4:** Verificar en el navegador: filtrar la bandeja, crear un lead, cambiar un estado, agregar una nota, recorrer cada pestaña de la ficha y enviar un formulario de calificación y otro de perfil. Todo funciona y no hay desplazamiento horizontal a 375 px.
- [ ] **Step 5:** `npm run typecheck && npm run lint && npm run build`. Commit: `Rediseño: leads`.

### Task 6: Chats y Agenda

**Files:**
- Modify: `app/(panel)/chats/page.tsx`, `app/(panel)/agenda/page.tsx`

- [ ] **Step 1:** Migrar igual que en la Task 5, paso 1. En la agenda, los grupos por distrito van como encabezados con `font-titulo` y los emojis pasan a `MapPin`, `KeyRound` y `IdCard`.
- [ ] **Step 2:** Verificar: enviar un mensaje simulado en Chats, agendar y reprogramar una cita en la Agenda, a 375 px y a 1280 px.
- [ ] **Step 3:** Commit: `Rediseño: chats y agenda`.

### Task 7: Inmuebles, Difusión y Marketing

**Files:**
- Modify: `app/(panel)/inmuebles/**/*.tsx`, `app/(panel)/difusion/{page,publicaciones,registrar}.tsx`, `app/(panel)/marketing/page.tsx`. No se toca `difusion/texto.ts`.

- [ ] **Step 1:** Migrar igual que en la Task 5, paso 1. Botón verde en «Registrar contrato».
- [ ] **Step 2:** Verificar: filtrar la base, abrir una ficha, subir una foto, registrar un contrato, registrar una publicación y abrir Marketing, a 375 px y a 1280 px.
- [ ] **Step 3:** Commit: `Rediseño: inmuebles, difusión y marketing`.

### Task 8: Tablero y Configuración

**Files:**
- Modify: `app/(panel)/tablero/page.tsx`, `app/(panel)/configuracion/**/*.tsx`

- [ ] **Step 1:** Migrar igual que en la Task 5, paso 1. En el tablero, las cifras con `font-titulo`, y en las filas de costos un salto de línea en lugar de «·».
- [ ] **Step 2:** Verificar: cambiar el periodo del tablero, guardar y restablecer un parámetro, editar una plantilla, y crear y desactivar un usuario.
- [ ] **Step 3:** Commit: `Rediseño: tablero y configuración`.

### Task 9: Limpieza y verificación final

**Files:**
- Delete: `components/legado.tsx`
- Modify: `app/globals.css` (quitar los tokens viejos `marino-*`, `tinta`, `suave`, `tenue`, `borde`, `fondo`, `shadow-tarjeta` y `shadow-flotante`, si ya nadie los usa)

- [ ] **Step 1:** Borrar `legado.tsx` y los tokens viejos.
- [ ] **Step 2:** `npm run verificar:rediseno`. Esperado: PASA, con cero hallazgos.
- [ ] **Step 3:** `npm run typecheck && npm run lint && npm run build && npm run test:sql`. Esperado: todo pasa, 41 de 41 en SQL.
- [ ] **Step 4:** Recorrido final de las 18 páginas a 375 px y a 1280 px, con capturas. Revisar el contraste del texto secundario sobre el fondo y del blanco sobre el verde `#0b7a55` de los botones, y el foco con el teclado.
- [ ] **Step 5:** Commit: `Rediseño: limpieza final`.
