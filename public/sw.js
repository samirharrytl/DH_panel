// Service worker del panel: muestra los avisos push que envía /api/push y abre el panel al tocarlos.

self.addEventListener('push', (event) => {
  const aviso = event.data ? event.data.json() : { titulo: 'Panel DepaHost' }
  const enlace = aviso.enlace || '/'
  event.waitUntil(
    self.registration.showNotification(aviso.titulo, {
      body: aviso.cuerpo || undefined,
      icon: '/icon-192.png',
      // Los avisos del mismo chat o lead se reemplazan en vez de amontonarse, pero vuelven a sonar
      tag: enlace,
      renotify: true,
      data: { enlace },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.enlace || '/', self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
      const abierta = ventanas.find((v) => v.url.startsWith(self.location.origin))
      if (abierta) return abierta.focus().then((v) => v.navigate(url))
      return self.clients.openWindow(url)
    }),
  )
})
