# Temas pendientes

## Push: reintentar cuando falla el transporte

**Detectado:** 2026-11-13, al probar las notificaciones push en producción.

`pg_net` falla de vez en cuando con `Error in the HTTP2 framing layer` antes de llegar a
`/api/push` (1 de 7 llamadas en las pruebas). La notificación queda en la campana, pero el push
no sale y no hay reintento: `net._http_response` solo guarda el error.

**Propuesta:**

1. Agregar `push_enviado_at timestamptz` a `public.notificaciones`.
2. `/api/push` la marca al terminar, incluso cuando el usuario no tiene dispositivos.
3. Un cron cada 5 minutos (Vercel o `pg_cron`) reintenta los avisos sin marcar de la última hora.

**Por qué se dejó para después:** con el volumen actual el fallo es poco frecuente y el aviso
sigue visible en la campana. Se retoma si se pierden avisos de leads reales.

## Plan del rediseño sin marcar

`docs/superpowers/plans/2026-11-12-rediseno-panel.md` tiene los checkboxes en `- [ ]` aunque el
trabajo ya está commiteado. Revisar tarea por tarea y marcarlo como se hizo con el plan de push.
