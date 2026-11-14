import type { MetadataRoute } from 'next'

// Permite instalar el panel como app. En iPhone es requisito para recibir notificaciones push.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Panel DepaHost',
    short_name: 'DepaHost',
    description: 'Seguimiento de propietarios e interesados de DepaHost',
    lang: 'es-PE',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#012147',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}
