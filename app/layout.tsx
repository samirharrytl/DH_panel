import type { Metadata, Viewport } from 'next'
import { Outfit, Rubik } from 'next/font/google'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'

const outfit = Outfit({ variable: '--font-outfit', subsets: ['latin'] })
const rubik = Rubik({ variable: '--font-rubik', subsets: ['latin'] })

export const metadata: Metadata = {
  title: { default: 'Panel DepaHost', template: '%s · Panel DepaHost' },
  description: 'Seguimiento de propietarios e interesados de DepaHost',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = { themeColor: '#012147', width: 'device-width', initialScale: 1 }

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="es-PE" className={`${outfit.variable} ${rubik.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        {children}
        {/* Abajo a la derecha; por debajo de 600 px Sonner lo pone a lo ancho, abajo */}
        <Toaster position="bottom-right" />
      </body>
    </html>
  )
}
