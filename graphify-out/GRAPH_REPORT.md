# Graph Report - DH_panel  (2026-11-13)

## Corpus Check
- 165 files · ~99,389 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 3, .graphify-bak 1, .example 1)

## Summary
- 1398 nodes · 5113 edges · 64 communities (59 shown, 5 thin omitted)
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 343 edges (avg confidence: 0.9)
- Token cost: 272,888 input · 0 output

## Graph Freshness
- Built from commit: `95df1fc8`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Server Actions & Supabase Client
- Leads Schema (fase2)
- formato.ts
- Forms & Chat UI
- Properties, Agenda & Visits UI
- probar-sql.mjs
- Properties & Appointments Schema
- Interactive Guides
- Daily Publishing UI
- Match UI & Catalogs
- Panel Redesign Plan & Spec
- Form Fields & Users Page
- Match & Finance Schema
- resumen.tsx
- Base Schema (Profiles, Params)
- catalogos.ts
- HU-03: Parámetros del sistema
- README Setup & Ops
- Match Engine Requirements
- File Uploads (Storage)
- CLAUDE.md Project Rules
- shadcn Config
- Leads Data Model Docs
- package.json
- Appointments & Visits Docs
- Core Spec & Lead Concepts
- avisos-dispositivo.tsx
- Dashboard (Tablero) UI
- TypeScript Config
- Navigation Menu
- Roles, Users & RLS Docs
- Publishing & Insights Docs
- Properties & Contracts Docs
- Supuestos de negocio
- WhatsApp Coexistence Schema
- Closing & Post-sale Docs
- Closing & Dashboard Schema
- Publishing & Insights Schema
- Notificaciones en tiempo real en celular y computadora
- npm Scripts
- Auth Proxy & Session
- Root Layout & Toasts
- index.ts
- verificar-rediseno.mjs
- crear-admin.mjs
- cn
- Button
- recordatorios/route.ts
- Plan de implementacion del rediseno Verde cierre
- 20261113000200_notificaciones_push.sql
- datos-demo.mjs
- App Icon & Brand
- Vercel Cron Config
- 20261107000500_fase5_whatsapp.sql
- crearClienteAdmin
- leads/route.ts
- Review Focus
- Task 2: layout, menu, campana, aviso emergente y acceso
- Task 9: limpieza y verificacion final
- Temas pendientes
- Task 4: pagina Hoy

## God Nodes (most connected - your core abstractions)
1. `crearClienteServidor()` - 153 edges
2. `exigirUsuario()` - 91 edges
3. `exito()` - 75 edges
4. `next` - 72 edges
5. `deError()` - 70 edges
6. `fallo()` - 66 edges
7. `texto()` - 62 edges
8. `public.leads` - 60 edges
9. `Plan de construcción y modelo de datos` - 58 edges
10. `Badge()` - 57 edges

## Surprising Connections (you probably didn't know these)
- `Task 2: Envío del push en el servidor` --references--> `crearClienteAdmin()`  [INFERRED]
  docs/superpowers/plans/2026-11-13-notificaciones-push.md → lib/supabase/admin.ts
- `Task 3: Dispositivo (PWA, service worker, activación y toast)` --references--> `AvisosDispositivo()`  [INFERRED]
  docs/superpowers/plans/2026-11-13-notificaciones-push.md → components/avisos-dispositivo.tsx
- `Casilla con Checkbox de Radix que envia value ?? 'on'` --references--> `Casilla()`  [INFERRED]
  docs/superpowers/plans/2026-11-12-rediseno-panel.md → components/campos.tsx
- `Badge con variantes marino, azul, verde, ambar, rojo y gris` --references--> `colorEstado()`  [EXTRACTED]
  docs/superpowers/plans/2026-11-12-rediseno-panel.md → lib/catalogos.ts
- `Fuera de alcance del rediseno (reglas de negocio, meta mensual, landing, modo oscuro)` --conceptually_related_to--> `Sitio web depahostcapital (landing en Astro)`  [INFERRED]
  docs/superpowers/specs/2026-11-12-rediseno-panel-design.md → README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Fuentes de los insights al propietario** — docs_especificacion_resumen_de_insights_por_whatsapp, docs_especificacion_publicación_diaria_en_redes, docs_especificacion_enlace_de_whatsapp_con_atribución, docs_especificacion_envío_de_matches, docs_especificacion_respuestas_rápidas_del_match, docs_especificacion_visita_al_inmueble, docs_especificacion_opinión_tras_la_visita, docs_especificacion_base_de_propiedades [EXTRACTED 1.00]
- **Panel como backend del sitio web depahostcapital** — readme_sitio_web_astro, readme_api_v1_properties, readme_api_v1_leads, readme_contrato_openapi, readme_actualizar_web, readme_variables_sitio_web [EXTRACTED 1.00]
- **Migracion por partes al rediseno Verde cierre** — docs_superpowers_plans_2026_11_12_rediseno_panel_task_1_base, docs_superpowers_plans_2026_11_12_rediseno_panel_task_2_estructura, docs_superpowers_plans_2026_11_12_rediseno_panel_task_3_componentes_compartidos, docs_superpowers_plans_2026_11_12_rediseno_panel_task_4_pagina_hoy, docs_superpowers_plans_2026_11_12_rediseno_panel_task_5_leads, docs_superpowers_plans_2026_11_12_rediseno_panel_task_6_chats_agenda, docs_superpowers_plans_2026_11_12_rediseno_panel_task_7_inmuebles_difusion_marketing, docs_superpowers_plans_2026_11_12_rediseno_panel_task_8_tablero_configuracion, docs_superpowers_plans_2026_11_12_rediseno_panel_task_9_limpieza [EXTRACTED 1.00]
- **Reglas transversales del panel** — docs_especificacion_ventana_de_whatsapp_de_24_horas, docs_especificacion_regla_de_bajas, docs_especificacion_consentimiento_ley_29733, docs_especificacion_una_persona_un_registro, docs_especificacion_horario_preferido_del_lead, docs_especificacion_mensajes_neutros_en_género, docs_especificacion_registro_de_eventos [EXTRACTED 1.00]
- **Ingesta de mensajes de WhatsApp en coexistencia** — claude_whatsapp_cloud_api_coexistencia, claude_webhook_smb_message_echoes, claude_webhook_history, claude_sincronizacion_historial_smb_app_data, claude_mensajes_celular_sin_reglas [EXTRACTED 1.00]
- **Reglas de match y priorización** — docs_supuestos_filtros_obligatorios_del_match, docs_supuestos_puntaje_de_match_de_0_a_100, docs_supuestos_umbral_de_novedades_de_50_puntos, docs_supuestos_priorización_ponderada_50_30_20, docs_especificacion_cruce_inmueble_interesado, docs_especificacion_priorización_de_inmuebles [INFERRED 0.85]

## Communities (64 total, 5 thin omitted)

### Community 0 - "Server Actions & Supabase Client"
Cohesion: 0.08
Nodes (120): iniciarSesion(), pedirRecuperacion(), restablecerContrasena(), urlBase(), GET(), marcarNotificacionesLeidas(), agendarCita(), cancelarCita() (+112 more)

### Community 1 - "Leads Schema (fase2)"
Cohesion: 0.07
Nodes (42): eventos_lead_idx, eventos_persona_idx, eventos_tipo_idx, lead_historial_lead_idx, leads_antes, leads_asesor_idx, leads_despues, leads_estado_idx (+34 more)

### Community 2 - "formato.ts"
Cohesion: 0.10
Nodes (30): Encabezado(), metadata, PaginaLeads(), textoParam(), Chip(), Cliente, enlace(), Filtros (+22 more)

### Community 3 - "Forms & Chat UI"
Cohesion: 0.11
Nodes (53): metadata, MOTIVOS, PaginaLogin(), metadata, PaginaRecuperar(), metadata, PaginaRestablecer(), Control() (+45 more)

### Community 4 - "Properties, Agenda & Visits UI"
Cohesion: 0.13
Nodes (37): CitaAgenda, COLOR_CITA, metadata, PaginaAgenda(), sumarDias(), caracteristicasTexto(), DatosAcceso(), diasEntre() (+29 more)

### Community 5 - "probar-sql.mjs"
Cohesion: 0.23
Nodes (10): @electric-sql/pglite@^0.5.15, @electric-sql/pglite, como(), crearBase(), dirMigraciones, esperarError(), registrar(), main() (+2 more)

### Community 6 - "Properties & Appointments Schema"
Cohesion: 0.09
Nodes (36): public.registrar_mensaje(), calificacion_autor, citas_asesor_idx, citas_inicio_idx, citas_lead_idx, citas_updated_at, contratos_un_vigente, inmueble_fotos_idx (+28 more)

### Community 7 - "Interactive Guides"
Cohesion: 0.09
Nodes (38): Lanzador(), metadata, PaginaGuias(), cerrarGuia(), EstadoGuia, fijar(), iniciarGuia(), instantanea() (+30 more)

### Community 8 - "Daily Publishing UI"
Cohesion: 0.17
Nodes (22): Cliente, parametrosDifusion(), urlPortada(), colorMotivo(), metadata, PaginaDifusion(), Sugerencia, ListaPublicaciones() (+14 more)

### Community 9 - "Match UI & Catalogs"
Cohesion: 0.19
Nodes (21): InmuebleEnvio, COLOR_RESPUESTA, colorPuntaje(), Desglose(), DetalleMatch, InmuebleLinea, lineaInmueble(), PARTES (+13 more)

### Community 10 - "Panel Redesign Plan & Spec"
Cohesion: 0.15
Nodes (16): API de components/campos (Campo, Casilla, Seleccion, SiNo, Dato, Vacio, Aviso, EncabezadoPagina, Tabla), Review Focus (casillas, dialogos, menu del celular, tablas a 375 px, vacio de Atiende primero), Task 1: base con shadcn, tema, fuentes y kit legado, Task 3: componentes compartidos, Diseno del rediseno del panel Verde cierre con shadcn/ui, Accesibilidad (foco visible, contraste 4.5:1, 44 px, prefers-reduced-motion), Casillas con Checkbox de shadcn, Dialogos con Dialog de shadcn (contexto que cierra al guardar) (+8 more)

### Community 11 - "Form Fields & Users Page"
Cohesion: 0.17
Nodes (17): metadata, PaginaUsuarios(), AVISOS, Tabla(), Tarjeta(), Card(), CardAction(), CardContent() (+9 more)

### Community 12 - "Match & Finance Schema"
Cohesion: 0.11
Nodes (27): busqueda_despues, busquedas_autor, capacidad_antes, capacidad_despues, derivaciones_despues, derivaciones_updated_at, match_opciones_inmueble_idx, match_opciones_lead_idx (+19 more)

### Community 13 - "resumen.tsx"
Cohesion: 0.18
Nodes (31): PaginaChats(), DifusionInmueble(), generateMetadata(), PaginaLead(), REGISTRO, SeccionChat(), Compraventa, CompraventaEnCurso() (+23 more)

### Community 14 - "Base Schema (Profiles, Params)"
Cohesion: 0.12
Nodes (21): parametros_autor, parametros_refuerzos, parametros_validar, perfiles_ultimo_admin, perfiles_updated_at, plantillas_autor, public.es_admin(), public.es_usuario_activo() (+13 more)

### Community 15 - "catalogos.ts"
Cohesion: 0.08
Nodes (38): Fila, metadata, Interesado, EVENTOS, Item, alcanza(), Busqueda, Capacidad (+30 more)

### Community 16 - "HU-03: Parámetros del sistema"
Cohesion: 0.28
Nodes (8): Aviso de vencimiento de contrato, Módulo 1: Captación de propietarios, HU-03: Parámetros del sistema, HU-04: Plantillas de mensajes, Migración fase1_base.sql, Módulo lib/whatsapp, Pantalla /configuracion, Tabla plantillas

### Community 17 - "README Setup & Ops"
Cohesion: 0.11
Nodes (27): Cadencia de refuerzos Dias 1, 3 y 4 (Dia 0 bienvenida), Migraciones versionadas en el repositorio, Modulo lib/whatsapp con modo simulado, Sin separacion del inmueble ni alquileres, Supabase (Postgres, Auth con correo, Storage), Variables WHATSAPP_TOKEN, PHONE_NUMBER_ID, BUSINESS_ACCOUNT_ID, WEBHOOK_VERIFY_TOKEN y APP_SECRET, Zona horaria America/Lima, README.md (Panel de seguimiento DepaHost) (+19 more)

### Community 18 - "Match Engine Requirements"
Cohesion: 0.21
Nodes (18): Capacidad financiera, Cruce inmueble–interesado, Derivación a banco o bróker aliado, Envío de matches, Fondo MiVivienda y Techo Propio, Perfil de búsqueda, Respuestas rápidas del match, HU-19: Perfil de búsqueda (+10 more)

### Community 19 - "File Uploads (Storage)"
Cohesion: 0.16
Nodes (16): accion(), ArchivoElegido, Bucket, ControlArchivos, REGLAS, SelectorArchivos(), Subida, subirArchivos() (+8 more)

### Community 20 - "CLAUDE.md Project Rules"
Cohesion: 0.13
Nodes (21): CLAUDE.md (instrucciones del proyecto), Commit con el ID de la historia (HU-XX), Consentimiento de datos y marketing (Ley 29733), Construccion en 7 fases (HU-01 a HU-35), Costos de WhatsApp en el Tablero (webhook de estados pricing), Embedded Signup (Tech Provider o BSP, por definir), Fuera de alcance en la fase 1 (bot, publicacion automatica, firma virtual, comision, alquileres, modelo predictivo), Mensajes del celular fuera de las reglas del panel (aviso por Baja) (+13 more)

### Community 21 - "shadcn Config"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 22 - "Leads Data Model Docs"
Cohesion: 0.15
Nodes (23): HU-05: Registro de lead, HU-06: Lead que regresa, HU-08: Recordatorio de refuerzos, HU-09: Cambio de estado y notas, cambiar_estado_lead(), Cron diario, hoy_lima(), Migración fase2_leads.sql (+15 more)

### Community 23 - "package.json"
Cohesion: 0.07
Nodes (40): eslintConfig, dependencies, next@16.4.5, react@19.3.0, react-dom@19.3.0, server-only@^0.0.1, shadcn@^4.23.0, @supabase/ssr@^0.12.7 (+32 more)

### Community 24 - "Appointments & Visits Docs"
Cohesion: 0.21
Nodes (18): Agenda, Cita con el propietario, Consideraciones de acceso, Ficha del lead, Opinión tras la visita, Priorización de inmuebles, Visita al inmueble, HU-12: Chat con el lead (+10 more)

### Community 25 - "Core Spec & Lead Concepts"
Cohesion: 0.16
Nodes (19): Documentos fuente (especificacion e historias HU-01 a HU-35), Bot, Cliente, Encargado, Especificación del sistema de seguimiento, Interesado, Lead, Métricas del piloto de match (+11 more)

### Community 26 - "avisos-dispositivo.tsx"
Cohesion: 0.42
Nodes (8): borrarSuscripcionPush(), guardarSuscripcionPush(), claveBytes(), EstadoAvisos, estadoInicial(), useAvisosDispositivo(), activar(), desactivar()

### Community 27 - "Dashboard (Tablero) UI"
Cohesion: 0.13
Nodes (21): ItemPublicacion(), Metrica(), enlaceWhatsApp(), textoParaRed(), Barra(), CategoriaCosto, CATEGORIAS_COSTO, Cifra() (+13 more)

### Community 28 - "TypeScript Config"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 29 - "Navigation Menu"
Cohesion: 0.20
Nodes (12): activo(), Enlaces(), ICONOS, ItemNav, Logo(), Navegacion(), Sheet(), SheetContent() (+4 more)

### Community 30 - "Roles, Users & RLS Docs"
Cohesion: 0.20
Nodes (16): Bandeja de leads, Plataforma de seguimiento, Rol Administrador, Rol Asesor, Rol Propietario (por definir), HU-01: Inicio de sesión, HU-02: Gestión de usuarios, HU-07: Bandeja de leads (+8 more)

### Community 31 - "Publishing & Insights Docs"
Cohesion: 0.30
Nodes (13): Enlace de WhatsApp con atribución, Módulo 3: Difusión en redes y Canal de WhatsApp, Módulo 5: Insights al propietario, Publicación diaria en redes, Resumen de insights por WhatsApp, HU-28: Sugerencia diaria de publicación, HU-29: Enlace de WhatsApp único, HU-30: Resumen de insights (+5 more)

### Community 32 - "Properties & Contracts Docs"
Cohesion: 0.29
Nodes (16): Base de propiedades, Calificación del propietario, Contrato con el propietario, Estados del inmueble, HU-13: Ficha de calificación del propietario, HU-15: Resultado de la cita, HU-16: Registrar contrato, HU-17: Aviso de vencimiento de contrato (+8 more)

### Community 33 - "Supuestos de negocio"
Cohesion: 0.22
Nodes (9): Estado No responde, Estados del lead, Novedades, HU-11: Marcar Baja, HU-24: Aviso de novedades, Embudo del interesado, Embudo del propietario, Salidas del lead (+1 more)

### Community 34 - "WhatsApp Coexistence Schema"
Cohesion: 0.13
Nodes (6): public.dar_baja(), public.costos_whatsapp(), public.mensajes_antes_de_guardar(), public.mensajes_despues_de_guardar(), public.registrar_mensaje_app(), public.registrar_inmueble()

### Community 35 - "Closing & Post-sale Docs"
Cohesion: 0.24
Nodes (14): Cierre de compraventa, Comisión a intermediarios, Fuera de alcance de la fase 1, Módulo 6: Cierre y postventa, Postventa y marketing por intención, Testimonio y reseña en Google, HU-31: Registrar cierre de compraventa, HU-32: Recordatorio de testimonio (+6 more)

### Community 36 - "Closing & Dashboard Schema"
Cohesion: 0.22
Nodes (8): compraventas_updated_at, public.compraventas, public.cerrar_compraventa(), public.marcar_compraventa_caida(), public.registrar_pedido_testimonio(), public.tablero(), public.testimonios, testimonios_updated_at

### Community 37 - "Publishing & Insights Schema"
Cohesion: 0.26
Nodes (9): public.atribuir_mensaje_entrante(), public.atribuir_publicacion(), public.guardar_insights(), public.insights_inmueble(), public.insights_pendientes(), public.insights_resumenes, public.publicaciones, public.sugerir_publicaciones() (+1 more)

### Community 38 - "Notificaciones en tiempo real en celular y computadora"
Cohesion: 0.22
Nodes (8): Decisiones del constructor (revisables), Diseño, Enfoques considerados, No objetivos, Notificaciones en tiempo real en celular y computadora, Objetivos, Por qué, Restricciones

### Community 39 - "npm Scripts"
Cohesion: 0.15
Nodes (13): scripts, build, crear-admin, db:demo, db:migrar, dev, lint, start (+5 more)

### Community 40 - "Auth Proxy & Session"
Cohesion: 0.19
Nodes (12): GET, POST, salir(), escribirCookie(), leerCookie(), VigilanteInactividad(), COOKIE_ACTIVIDAD, COOKIE_TTL (+4 more)

### Community 41 - "Root Layout & Toasts"
Cohesion: 0.22
Nodes (8): metadata, outfit, RootLayout(), rubik, viewport, Toaster(), sonner@^2.0.8, sonner

### Community 42 - "index.ts"
Cohesion: 0.13
Nodes (19): POST(), Boton, CambioWebhook, contenido(), credenciales(), enviar(), enviarBotones(), enviarPlantilla() (+11 more)

### Community 43 - "verificar-rediseno.mjs"
Cohesion: 0.15
Nodes (8): dir, sql, pruebas, raiz, archivos(), EXCLUIDOS, raiz, REGLAS

### Community 44 - "crear-admin.mjs"
Cohesion: 0.25
Nodes (5): email, nombre, rl, supabase, usuario

### Community 45 - "cn"
Cohesion: 0.09
Nodes (14): LayoutConfiguracion(), SECCIONES, Pestanas(), Alert(), alertVariants, TabsList(), tabsListVariants, class-variance-authority@^0.7.1 (+6 more)

### Community 46 - "Button"
Cohesion: 0.15
Nodes (19): LayoutPanel(), AvisosDispositivo(), Campana(), Notificacion, Copiar(), copiar(), copiarConRespaldo(), Variante (+11 more)

### Community 47 - "recordatorios/route.ts"
Cohesion: 0.27
Nodes (7): GET(), avisoQueToca(), diaLima(), horaLima(), npm run test:recordatorios, ahora, nada

### Community 48 - "Plan de implementacion del rediseno Verde cierre"
Cohesion: 0.25
Nodes (10): AGENTS.md (reglas para agentes de Next.js), generate-agent-files.js (next dev reescribe el bloque), Guia node_modules/next/dist/docs, Plan de implementacion del rediseno Verde cierre, Button con variantes default, exito, outline, ghost, peligro y whatsapp, Task 5: leads, Task 6: chats y agenda, Task 7: inmuebles, difusion y marketing (+2 more)

### Community 49 - "20261113000200_notificaciones_push.sql"
Cohesion: 0.32
Nodes (6): notificaciones_usuario_idx, public.notificaciones, notificaciones_push, public.notificaciones_enviar_push(), public.suscripciones_push, suscripciones_push_usuario_idx

### Community 50 - "datos-demo.mjs"
Cohesion: 0.60
Nodes (5): borrar(), cargar(), lead(), ok(), supabase

### Community 51 - "App Icon & Brand"
Cohesion: 0.50
Nodes (5): App Icon (favicon, app/icon.svg), DepaHost Real Estate Brand Identity, House Outline Brand Mark (white stroke: roof, walls, door), Navy Rounded-Square Background (#012147), Next.js App Router icon file convention

### Community 56 - "crearClienteAdmin"
Cohesion: 0.36
Nodes (6): GET(), POST(), Fila, GET(), n(), crearClienteAdmin()

### Community 58 - "leads/route.ts"
Cohesion: 0.40
Nodes (9): cadena(), captchaValido(), cors(), invalido(), OPTIONS(), ORIGENES, POST(), recibo() (+1 more)

### Community 59 - "Review Focus"
Cohesion: 0.25
Nodes (7): Global Constraints, Notificaciones push Implementation Plan, Review Focus, Task 1: Modelo de datos y trigger, Task 2: Envío del push en el servidor, Task 3: Dispositivo (PWA, service worker, activación y toast), Task 4: Documentación y commit

### Community 60 - "Task 2: layout, menu, campana, aviso emergente y acceso"
Cohesion: 0.33
Nodes (5): Tipo ItemNav (icono de lucide), Task 2: layout, menu, campana, aviso emergente y acceso, Toaster de sonner montado en app/layout.tsx, Campana de notificaciones con Popover, Menu del celular con Sheet

### Community 61 - "Task 9: limpieza y verificacion final"
Cohesion: 0.60
Nodes (5): Kit legado components/legado.tsx, Reglas de verificacion: emojis, uppercase, importaciones de legado y tokens viejos, Task 9: limpieza y verificacion final, Como se verifica el rediseno, npm run test:sql (migraciones en PGlite y criterios de aceptacion)

### Community 62 - "Temas pendientes"
Cohesion: 0.50
Nodes (3): Plan del rediseño sin marcar, Push: reintentar cuando falla el transporte, Temas pendientes

### Community 63 - "Task 4: pagina Hoy"
Cohesion: 0.83
Nodes (3): Task 4: pagina Hoy, Atiende primero (leads con proxima accion vencida o para hoy), Cierres del mes en la franja (compraventas cerradas, hora de Lima)

## Knowledge Gaps
- **10 isolated node(s):** `Tipo ItemNav (icono de lucide)`, `Orden de trabajo del rediseno (5 pasos)`, `Panel de seguimiento DepaHost`, `Registro de cambios de estado con fecha y autor`, `Reglas de uso de graphify (graphify-out)` (+5 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 291 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `next` connect `Server Actions & Supabase Client` to `formato.ts`, `Forms & Chat UI`, `Properties, Agenda & Visits UI`, `Interactive Guides`, `Daily Publishing UI`, `Match UI & Catalogs`, `Form Fields & Users Page`, `resumen.tsx`, `catalogos.ts`, `File Uploads (Storage)`, `package.json`, `Dashboard (Tablero) UI`, `Navigation Menu`, `Auth Proxy & Session`, `Root Layout & Toasts`, `index.ts`, `Button`, `recordatorios/route.ts`, `crearClienteAdmin`, `leads/route.ts`?**
  _High betweenness centrality (0.223) - this node is a cross-community bridge._
- **What connects `Tipo ItemNav (icono de lucide)`, `Orden de trabajo del rediseno (5 pasos)`, `Panel de seguimiento DepaHost` to the rest of the system?**
  _10 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Server Actions & Supabase Client` be split into smaller, more focused modules?**
  _Cohesion score 0.07597315436241611 - nodes in this community are weakly interconnected._
- **Why does `README.md (Panel de seguimiento DepaHost)` connect `README Setup & Ops` to `Supuestos de negocio`, `recordatorios/route.ts`, `CLAUDE.md Project Rules`, `Leads Data Model Docs`, `Task 9: limpieza y verificacion final`?**
  _High betweenness centrality (0.197) - this node is a cross-community bridge._
- **Should `Leads Schema (fase2)` be split into smaller, more focused modules?**
  _Cohesion score 0.07474747474747474 - nodes in this community are weakly interconnected._
- **Why does `Plan de construcción y modelo de datos` connect `Leads Data Model Docs` to `Properties & Contracts Docs`, `Supuestos de negocio`, `Closing & Post-sale Docs`, `HU-03: Parámetros del sistema`, `README Setup & Ops`, `Match Engine Requirements`, `Appointments & Visits Docs`, `Core Spec & Lead Concepts`, `Roles, Users & RLS Docs`, `Publishing & Insights Docs`?**
  _High betweenness centrality (0.126) - this node is a cross-community bridge._
- **Should `formato.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10160427807486631 - nodes in this community are weakly interconnected._