import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ variable: '--font-inter', subsets: ['latin'] })

export const metadata: Metadata = {
  title: { default: 'Panel DepaHost', template: '%s · Panel DepaHost' },
  description: 'Seguimiento de propietarios e interesados de DepaHost',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = { themeColor: '#012147', width: 'device-width', initialScale: 1 }

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="es-PE" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  )
}
