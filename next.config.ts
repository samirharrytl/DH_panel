import type { NextConfig } from 'next'

// Panel interno con sesión en cada página: se renderiza siempre en el servidor por petición,
// así que no se usa Cache Components.
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '*.supabase.co' }],
  },
}

export default nextConfig
