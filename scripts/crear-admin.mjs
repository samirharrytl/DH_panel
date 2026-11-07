// Crea (o promueve) un usuario administrador en Supabase. Pide los datos por la terminal.
// Uso: npm run crear-admin
import { createClient } from '@supabase/supabase-js'
import { createInterface } from 'node:readline/promises'
import path from 'node:path'

try {
  process.loadEnvFile(path.resolve(import.meta.dirname, '..', '.env.local'))
} catch {
  // Sin .env.local se usan las variables del entorno
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const clave = process.env.SUPABASE_SECRET_KEY
if (!url || !clave) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY en .env.local')
  process.exit(1)
}

function preguntarOculto(pregunta) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    // Algunas terminales de Windows no permiten ocultar lo que se escribe
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    return rl.question(`${pregunta}(se verá al escribir) `).finally(() => rl.close())
  }
  return new Promise((resolve) => {
    process.stdout.write(pregunta)
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.setEncoding('utf8')
    let valor = ''
    const alEscribir = (c) => {
      if (c === '\r' || c === '\n' || c === '\u0004') {
        process.stdin.setRawMode(false)
        process.stdin.pause()
        process.stdin.off('data', alEscribir)
        process.stdout.write('\n')
        resolve(valor)
      } else if (c === '\u0003') {
        process.exit(1)
      } else if (c === '\u007f' || c === '\b') {
        valor = valor.slice(0, -1)
      } else {
        valor += c
      }
    }
    process.stdin.on('data', alEscribir)
  })
}

const rl = createInterface({ input: process.stdin, output: process.stdout })
const nombre = (await rl.question('Nombre completo: ')).trim()
const email = (await rl.question('Correo: ')).trim().toLowerCase()
rl.close()
if (!nombre || !email) {
  console.error('Nombre y correo son obligatorios')
  process.exit(1)
}

const supabase = createClient(url, clave, { auth: { persistSession: false, autoRefreshToken: false } })

// Si el correo ya existe en Auth (por ejemplo, creado desde el dashboard), solo se le da el rol
const { data: lista } = await supabase.auth.admin.listUsers({ perPage: 1000 })
let usuario = lista?.users.find((u) => u.email?.toLowerCase() === email)

if (!usuario) {
  const password = await preguntarOculto('Contraseña (mínimo 8 caracteres): ')
  const repetir = await preguntarOculto('Repite la contraseña: ')
  if (password.length < 8 || password !== repetir) {
    console.error('La contraseña es muy corta o no coincide')
    process.exit(1)
  }
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nombre },
  })
  if (error) {
    console.error(`No se pudo crear el usuario: ${error.message}`)
    process.exit(1)
  }
  usuario = data.user
} else {
  console.log('El correo ya existía en Supabase Auth: se le asigna el rol de administrador.')
}

const { error } = await supabase
  .from('perfiles')
  .upsert({ id: usuario.id, nombre, email, rol: 'administrador', activo: true }, { onConflict: 'id' })
if (error) {
  console.error(`No se pudo guardar el perfil: ${error.message}`)
  process.exit(1)
}
await supabase.auth.admin.updateUserById(usuario.id, { ban_duration: 'none' })
console.log(`Listo: ${email} es administrador. Ingresa en http://localhost:3000/login`)
